use async_trait::async_trait;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::{MemorySecrets, Secret, SecretStore};
use vcore::sessions::{Auth, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, SshConnection};
use vcore::tunnel::{TunnelError, TunnelSpec};

struct Trust;
#[async_trait]
impl HostKeyPrompt for Trust {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        HostKeyDecision::Trust
    }
}

fn server_up() -> bool {
    let up = std::net::TcpStream::connect_timeout(&"127.0.0.1:2222".parse().unwrap(), Duration::from_millis(500)).is_ok();
    if !up {
        eprintln!("SKIP: test sshd kapalı (vcore/tests/docker/up.sh)");
    }
    up
}

async fn connected() -> (tempfile::TempDir, Arc<SshConnection>) {
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new("test-pass-123")).unwrap();
    let session = Session { id: "s1".into(), name: "t".into(), host: "127.0.0.1".into(), port: 2222, user: "tester".into(), folder: None, auth: Auth::Password, tunnels: vec![], jump: None };
    let hosts = Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()));
    let conn = SshConnection::connect(&session, &secrets, hosts, Arc::new(Trust)).await.unwrap();
    (dir, Arc::new(conn))
}

async fn read_banner(s: &mut TcpStream) -> String {
    let mut buf = [0u8; 4];
    tokio::time::timeout(Duration::from_secs(5), s.read_exact(&mut buf)).await.expect("banner timeout").expect("banner read");
    String::from_utf8_lossy(&buf).into_owned()
}

#[tokio::test]
async fn a_local_tunnel_reaches_a_service_that_only_the_server_can_see() {
    if !server_up() { return; }
    let (_d, conn) = connected().await;
    let tunnel = conn.start_tunnel(&TunnelSpec::Local { listen_port: 0, dest_host: "127.0.0.1".into(), dest_port: 2222 }).await.unwrap();
    let mut s = TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.unwrap();
    assert_eq!(read_banner(&mut s).await, "SSH-");
    assert!(tunnel.connections.load(Ordering::SeqCst) >= 1);
}

#[tokio::test]
async fn a_dynamic_tunnel_speaks_socks5() {
    if !server_up() { return; }
    let (_d, conn) = connected().await;
    let tunnel = conn.start_tunnel(&TunnelSpec::Dynamic { listen_port: 0 }).await.unwrap();
    let mut s = TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.unwrap();
    s.write_all(&[5, 1, 0]).await.unwrap();
    let mut greeting = [0u8; 2];
    s.read_exact(&mut greeting).await.unwrap();
    assert_eq!(greeting, [5, 0]);
    s.write_all(&[5, 1, 0, 1, 127, 0, 0, 1, 0x08, 0xae]).await.unwrap();
    let mut reply = [0u8; 10];
    s.read_exact(&mut reply).await.unwrap();
    assert_eq!(&reply[..2], &[5, 0], "{reply:?}");
    assert_eq!(read_banner(&mut s).await, "SSH-");
}

#[tokio::test]
async fn socks_requests_for_unreachable_targets_get_a_failure_reply_and_the_tunnel_survives() {
    if !server_up() { return; }
    let (_d, conn) = connected().await;
    let tunnel = conn.start_tunnel(&TunnelSpec::Dynamic { listen_port: 0 }).await.unwrap();
    let mut s = TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.unwrap();
    s.write_all(&[5, 1, 0]).await.unwrap();
    let mut greeting = [0u8; 2];
    s.read_exact(&mut greeting).await.unwrap();
    s.write_all(&[5, 1, 0, 1, 127, 0, 0, 1, 0, 1]).await.unwrap();
    let mut reply = [0u8; 10];
    s.read_exact(&mut reply).await.unwrap();
    assert_ne!(reply[1], 0, "connecting to a closed port must fail");
    let mut again = TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.unwrap();
    again.write_all(&[5, 1, 0]).await.unwrap();
    let mut g = [0u8; 2];
    again.read_exact(&mut g).await.unwrap();
    assert_eq!(g, [5, 0]);
}

#[tokio::test]
async fn a_local_tunnel_to_a_closed_port_drops_the_client_but_keeps_listening() {
    if !server_up() { return; }
    let (_d, conn) = connected().await;
    let tunnel = conn.start_tunnel(&TunnelSpec::Local { listen_port: 0, dest_host: "127.0.0.1".into(), dest_port: 1 }).await.unwrap();
    let mut s = TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.unwrap();
    let mut buf = [0u8; 1];
    let n = tokio::time::timeout(Duration::from_secs(5), s.read(&mut buf)).await.expect("should be closed").unwrap_or(0);
    assert_eq!(n, 0);
    assert!(TcpStream::connect(("127.0.0.1", tunnel.local_port)).await.is_ok());
}

#[tokio::test]
async fn a_busy_port_is_reported_and_stopping_frees_it() {
    if !server_up() { return; }
    let (_d, conn) = connected().await;
    let blocker = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = blocker.local_addr().unwrap().port();
    let err = conn.start_tunnel(&TunnelSpec::Dynamic { listen_port: port }).await.err().unwrap();
    assert_eq!(err, TunnelError::PortInUse);
    drop(blocker);
    let tunnel = conn.start_tunnel(&TunnelSpec::Dynamic { listen_port: port }).await.unwrap();
    assert_eq!(tunnel.local_port, port);
    tunnel.stop();
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_ok(), "port should be free after stop");
}
