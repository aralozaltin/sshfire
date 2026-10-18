// Kendi test ikilisinde çalışır: pty tespiti "yeni açılan tek pty"ye dayanır, bu yüzden aynı sunucuda
// paralel kabuk açan başka testlerle yarışmamalı (cargo test ikilileri sırayla çalıştırır).
use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::{MemorySecrets, Secret, SecretStore};
use vcore::sessions::{Auth, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, SshConnection};

struct Trust;
#[async_trait]
impl HostKeyPrompt for Trust {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        HostKeyDecision::Trust
    }
}

// Testler aynı sunucuda yeni terminal arar; paralel çalışırlarsa birbirlerinin terminalini aday sayıp şaşarlar.
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn server_up() -> bool {
    let up = std::net::TcpStream::connect_timeout(&"127.0.0.1:2222".parse().unwrap(), Duration::from_millis(500)).is_ok();
    if !up {
        eprintln!("SKIP: test sshd kapalı (vcore/tests/docker/up.sh)");
    }
    up
}

async fn connected() -> (tempfile::TempDir, SshConnection) {
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new("test-pass-123")).unwrap();
    let session = Session { id: "s1".into(), name: "t".into(), host: "127.0.0.1".into(), port: 2222, user: "tester".into(), folder: None, auth: Auth::Password, tunnels: vec![], jump: None, startup: None, color: None };
    let hosts = Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()));
    let conn = SshConnection::connect(&session, &secrets, hosts, Arc::new(Trust)).await.unwrap();
    (dir, conn)
}

#[tokio::test]
async fn finds_the_new_pty_and_follows_cd() {
    let _serial = SERIAL.lock().await;
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    // Diğer testler aynı sunucuda paralel pty açtığı için aday belirsiz kalabilir; birkaç kez dene.
    let mut found = None;
    for _ in 0..8 {
        let before = conn.list_ptys().await.unwrap();
        let shell = conn.open_shell(80, 24).await.unwrap();
        if let Some(pty) = conn.detect_shell_pty(&before).await {
            assert!(!before.contains(&pty));
            found = Some((shell, pty));
            break;
        }
        drop(shell);
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    let (shell, pty) = found.expect("the new pty should be detected");
    shell.write(b"cd /tmp\n").await.unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let cwd = conn.shell_cwd(pty).await.unwrap();
        if cwd.as_deref() == Some("/tmp") { break; }
        assert!(std::time::Instant::now() < deadline, "cwd never became /tmp, last: {cwd:?}");
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    shell.write(b"cd /etc && mkdir -p ../tmp/'a b' && cd /tmp/'a b'\n").await.unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let cwd = conn.shell_cwd(pty).await.unwrap();
        if cwd.as_deref() == Some("/tmp/a b") { break; }
        assert!(std::time::Instant::now() < deadline, "cwd never became '/tmp/a b', last: {cwd:?}");
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

#[tokio::test]
async fn a_pty_that_does_not_exist_has_no_cwd() {
    let _serial = SERIAL.lock().await;
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    assert_eq!(conn.shell_cwd(9999).await.unwrap(), None);
}

#[tokio::test]
async fn the_generic_tty_api_follows_cd_on_linux() {
    let _serial = SERIAL.lock().await;
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    let mut found = None;
    for _ in 0..8 {
        let before = conn.list_ttys().await.unwrap();
        let shell = conn.open_shell(80, 24).await.unwrap();
        if let Some(tty) = conn.detect_shell_tty(&before).await {
            assert!(matches!(tty, vcore::cwd::ShellTty::Pts(_)));
            found = Some((shell, tty));
            break;
        }
        drop(shell);
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    let (shell, tty) = found.expect("the new terminal should be detected");
    shell.write(b"cd /tmp\n").await.unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let cwd = conn.tty_cwd(&tty).await.unwrap();
        if cwd.as_deref() == Some("/tmp") { break; }
        assert!(std::time::Instant::now() < deadline, "cwd never became /tmp, last: {cwd:?}");
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}
