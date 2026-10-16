// Ortam değişkenini (SSH_AUTH_SOCK) değiştirdiği için tek test işlevi ve kendi test ikilisi.
use async_trait::async_trait;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::MemorySecrets;
use vcore::sessions::{Auth, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, SshConnection, SshError};

struct Trust;
#[async_trait]
impl HostKeyPrompt for Trust {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        HostKeyDecision::Trust
    }
}

fn server_up() -> bool {
    std::net::TcpStream::connect_timeout(&"127.0.0.1:2222".parse().unwrap(), Duration::from_millis(500)).is_ok()
}

async fn try_connect() -> Result<SshConnection, SshError> {
    let dir = tempfile::tempdir().unwrap();
    let hosts = Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()));
    let session = Session { id: "s1".into(), name: "t".into(), host: "127.0.0.1".into(), port: 2222, user: "tester".into(), folder: None, auth: Auth::Agent, tunnels: vec![], jump: None, startup: None, color: None };
    SshConnection::connect(&session, &MemorySecrets::default(), hosts, Arc::new(Trust)).await
}

fn start_agent(sock: &std::path::Path) -> Child {
    let child = Command::new("ssh-agent").args(["-D", "-a"]).arg(sock).stdout(Stdio::null()).stderr(Stdio::null()).spawn().expect("ssh-agent");
    for _ in 0..50 {
        if sock.exists() { return child; }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("agent socket never appeared");
}

#[tokio::test]
async fn the_agent_supplies_the_key_and_a_missing_agent_is_reported() {
    if !server_up() {
        eprintln!("SKIP: test sshd kapalı");
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let sock = dir.path().join("agent.sock");
    let key = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/docker/.keys/test_key");

    // 1) Ajan yok.
    unsafe { std::env::remove_var("SSH_AUTH_SOCK") };
    assert!(matches!(try_connect().await.err().unwrap(), SshError::AgentUnavailable(_)));

    // 2) Ajan var ama içinde anahtar yok.
    let mut agent = start_agent(&sock);
    unsafe { std::env::set_var("SSH_AUTH_SOCK", &sock) };
    assert_eq!(try_connect().await.err().unwrap(), SshError::AuthFailed);

    // 3) Anahtar eklenince giriş yapılır.
    let added = Command::new("ssh-add").arg(&key).env("SSH_AUTH_SOCK", &sock).stdout(Stdio::null()).stderr(Stdio::null()).status().unwrap();
    assert!(added.success());
    let conn = try_connect().await.expect("login through the agent");
    assert_eq!(conn.exec("echo agent-ok").await.unwrap(), "agent-ok\n");

    agent.kill().ok();
    unsafe { std::env::remove_var("SSH_AUTH_SOCK") };
}
