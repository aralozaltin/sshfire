use async_trait::async_trait;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::{MemorySecrets, Secret, SecretStore};
use vcore::sessions::{Auth, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, ShellEvent, SshConnection, SshError};

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2222;
const USER: &str = "tester";
const PASSWORD: &str = "test-pass-123";

fn server_up() -> bool {
    let up = std::net::TcpStream::connect_timeout(
        &format!("{HOST}:{PORT}").parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok();
    if !up {
        eprintln!("SKIP: test sshd kapalı (vcore/tests/docker/up.sh)");
    }
    up
}

struct TestPrompt {
    decision: HostKeyDecision,
    calls: AtomicUsize,
}

impl TestPrompt {
    fn new(decision: HostKeyDecision) -> Arc<TestPrompt> {
        Arc::new(TestPrompt { decision, calls: AtomicUsize::new(0) })
    }
}

#[async_trait]
impl HostKeyPrompt for TestPrompt {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.decision
    }
}

fn session(auth: Auth) -> Session {
    Session {
        id: "s1".into(),
        name: "test".into(),
        host: HOST.into(),
        port: PORT,
        user: USER.into(),
        folder: None,
        auth,
        tunnels: vec![], jump: None, startup: None,
    }
}

fn key_path() -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/docker/.keys/test_key").to_string_lossy().into()
}

fn hosts(dir: &tempfile::TempDir) -> Arc<Mutex<KnownHosts>> {
    Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()))
}

async fn read_until(shell: &mut vcore::ssh::ShellChannel, needle: &str) -> String {
    let mut out = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while !out.contains(needle) {
        let ev = tokio::time::timeout_at(deadline, shell.read()).await.expect("timeout waiting for output");
        match ev {
            Some(ShellEvent::Data(d)) => out.push_str(&String::from_utf8_lossy(&d)),
            other => panic!("unexpected event {other:?}, output so far: {out}"),
        }
    }
    out
}

#[tokio::test]
async fn password_login_runs_echo_and_returns_output() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let prompt = TestPrompt::new(HostKeyDecision::Trust);
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), prompt).await.unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    shell.write(b"echo hello-$((40+2))\n").await.unwrap();
    let out = read_until(&mut shell, "hello-42").await;
    assert!(out.contains("hello-42"));
}

#[tokio::test]
async fn key_file_login_works() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let prompt = TestPrompt::new(HostKeyDecision::Trust);
    let conn = SshConnection::connect(
        &session(Auth::KeyFile { path: key_path() }),
        &MemorySecrets::default(),
        hosts(&dir),
        prompt,
    )
    .await
    .unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    shell.write(b"echo key-ok\n").await.unwrap();
    read_until(&mut shell, "key-ok").await;
}

#[tokio::test]
async fn wrong_password_returns_auth_failed_and_error_has_no_password() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new("yanlis-parola-xyz")).unwrap();
    let prompt = TestPrompt::new(HostKeyDecision::Trust);
    let err = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), prompt).await.err().unwrap();
    assert_eq!(err, SshError::AuthFailed);
    assert!(!format!("{err:?}").contains("yanlis-parola-xyz"));
}

#[tokio::test]
async fn missing_password_in_keyring_returns_secret_error() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let prompt = TestPrompt::new(HostKeyDecision::Trust);
    let err = SshConnection::connect(&session(Auth::Password), &MemorySecrets::default(), hosts(&dir), prompt)
        .await
        .err()
        .unwrap();
    assert!(matches!(err, SshError::Secret(_)), "got {err:?}");
}

#[tokio::test]
async fn unknown_host_calls_prompt_and_trust_persists() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let h = hosts(&dir);
    let p1 = TestPrompt::new(HostKeyDecision::Trust);
    SshConnection::connect(&session(Auth::Password), &secrets, h.clone(), p1.clone()).await.unwrap();
    assert_eq!(p1.calls.load(Ordering::SeqCst), 1);
    let p2 = TestPrompt::new(HostKeyDecision::Reject);
    SshConnection::connect(&session(Auth::Password), &secrets, h, p2.clone()).await.unwrap();
    assert_eq!(p2.calls.load(Ordering::SeqCst), 0, "known host must not prompt again");
}

#[tokio::test]
async fn reject_decision_returns_host_key_rejected() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let h = hosts(&dir);
    let err = SshConnection::connect(&session(Auth::Password), &secrets, h.clone(), TestPrompt::new(HostKeyDecision::Reject))
        .await
        .err()
        .unwrap();
    assert_eq!(err, SshError::HostKeyRejected);
    assert!(matches!(h.lock().unwrap().check(HOST, PORT, "SHA256:x"), HostKeyStatus::Unknown));
}

#[tokio::test]
async fn changed_host_key_returns_host_key_changed_without_prompting() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let h = hosts(&dir);
    h.lock().unwrap().trust(HOST, PORT, "SHA256:eski-parmak-izi").unwrap();
    let prompt = TestPrompt::new(HostKeyDecision::Trust);
    let err = SshConnection::connect(&session(Auth::Password), &secrets, h.clone(), prompt.clone()).await.err().unwrap();
    match err {
        SshError::HostKeyChanged { previous, current } => {
            assert_eq!(previous, "SHA256:eski-parmak-izi");
            assert!(current.starts_with("SHA256:"));
        }
        other => panic!("expected HostKeyChanged, got {other:?}"),
    }
    assert_eq!(prompt.calls.load(Ordering::SeqCst), 0);
    assert!(matches!(h.lock().unwrap().check(HOST, PORT, "SHA256:eski-parmak-izi"), HostKeyStatus::Trusted));
}

#[tokio::test]
async fn unreachable_port_returns_unreachable() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = session(Auth::Password);
    s.port = 1;
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let err = SshConnection::connect(&s, &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.err().unwrap();
    assert!(matches!(err, SshError::Unreachable(_)), "got {err:?}");
}

#[tokio::test]
async fn resize_updates_pty_size() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust))
        .await
        .unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    shell.resize(120, 40).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    shell.write(b"stty size\n").await.unwrap();
    read_until(&mut shell, "40 120").await;
}

#[tokio::test]
async fn server_side_exit_emits_closed_event() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust))
        .await
        .unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    shell.write(b"exit\n").await.unwrap();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let ev = tokio::time::timeout_at(deadline, shell.read()).await.expect("timeout waiting for Closed");
        match ev {
            Some(ShellEvent::Closed { reason }) => {
                assert_eq!(reason.as_deref(), Some("exit:0"));
                break;
            }
            Some(ShellEvent::Data(_)) => continue,
            None => panic!("stream ended without Closed"),
        }
    }
}

#[tokio::test]
async fn writer_handle_writes_while_another_task_reads() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust))
        .await
        .unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    let writer = shell.writer();
    let reader = tokio::spawn(async move { read_until(&mut shell, "writer-ok").await });
    writer.write(b"echo writer-$((1+1))ok | sed s/2//\n").await.unwrap();
    let out = reader.await.unwrap();
    assert!(out.contains("writer-ok"));
}

#[tokio::test]
async fn hundred_megabytes_of_output_streams_through_the_bounded_channel() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust))
        .await
        .unwrap();
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    const TOTAL: usize = 100 * 1000 * 1000;
    shell.write(b"stty -echo; head -c 100000000 /dev/zero | tr '\\000' 'a'; echo; echo FLOOD-$((1+1))DONE\n").await.unwrap();
    let started = std::time::Instant::now();
    let mut received = 0usize;
    let mut tail = String::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(120);
    while !tail.contains("FLOOD-2DONE") {
        let ev = tokio::time::timeout_at(deadline, shell.read()).await.expect("flood stalled");
        match ev {
            Some(ShellEvent::Data(d)) => {
                received += d.iter().filter(|b| **b == b'a').count();
                tail.push_str(&String::from_utf8_lossy(&d[d.len().saturating_sub(64)..]));
                if tail.len() > 256 { tail = tail[tail.len() - 128..].to_string(); }
            }
            other => panic!("unexpected {other:?}"),
        }
    }
    // Komutun yankısındaki birkaç 'a' harfi de sayılır; tüm 100 MB eksiksiz gelmeli.
    assert!((TOTAL..TOTAL + 100).contains(&received), "received {received}");
    eprintln!("flood: {} MB in {:?}", TOTAL / 1_000_000, started.elapsed());
}

async fn connected() -> (tempfile::TempDir, SshConnection) {
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let conn = SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust))
        .await
        .unwrap();
    (dir, conn)
}

#[tokio::test]
async fn exec_returns_stdout() {
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    assert_eq!(conn.exec("echo hello; echo world").await.unwrap(), "hello\nworld\n");
}

#[tokio::test]
async fn exec_nonzero_exit_is_an_error_with_stderr() {
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    let err = conn.exec("echo bad >&2; exit 3").await.unwrap_err();
    match err {
        SshError::Other(m) => assert!(m.contains('3') && m.contains("bad"), "{m}"),
        other => panic!("{other:?}"),
    }
}

#[tokio::test]
async fn probe_command_output_parses_on_the_linux_test_server() {
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    let text = conn.exec(vcore::metrics::PROBE_COMMAND).await.unwrap();
    let sample = vcore::metrics::parse_sample(&text).expect("probe output should parse");
    assert!(sample.mem_total > 0 && sample.disk_total > 0);
}

#[tokio::test]
async fn shared_connection_serves_a_shell_and_exec_at_the_same_time() {
    if !server_up() { return; }
    let (_dir, conn) = connected().await;
    let conn = std::sync::Arc::new(conn);
    let mut shell = conn.open_shell(80, 24).await.unwrap();
    shell.write(b"echo shell-$((3+4))\n").await.unwrap();
    assert_eq!(conn.exec("echo side").await.unwrap(), "side\n");
    read_until(&mut shell, "shell-7").await;
}

#[tokio::test]
async fn connect_via_a_jump_host_reaches_the_target_and_runs_commands() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let h = hosts(&dir);
    let jump = Arc::new(SshConnection::connect(&session(Auth::Password), &secrets, h.clone(), TestPrompt::new(HostKeyDecision::Trust)).await.unwrap());
    // Hedef, atlama sunucusunun gördüğü adresle verilir (burada aynı sunucunun loopback'i).
    let mut target = session(Auth::Password);
    target.id = "target".into();
    target.host = "127.0.0.1".into();
    secrets.set("target", &Secret::new(PASSWORD)).unwrap();
    let inner = SshConnection::connect_via(&jump, &target, &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.unwrap();
    assert_eq!(inner.exec("echo through-the-jump").await.unwrap(), "through-the-jump\n");
    let mut shell = inner.open_shell(80, 24).await.unwrap();
    shell.write(b"echo shell-$((6*7))\n").await.unwrap();
    read_until(&mut shell, "shell-42").await;
}

#[tokio::test]
async fn a_dead_target_behind_the_jump_host_is_reported_as_unreachable() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    let jump = Arc::new(SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.unwrap());
    let mut target = session(Auth::Password);
    target.id = "target".into();
    target.host = "127.0.0.1".into();
    target.port = 1;
    let err = SshConnection::connect_via(&jump, &target, &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.err().unwrap();
    assert!(matches!(err, SshError::Unreachable(_)), "got {err:?}");
}

#[tokio::test]
async fn a_wrong_password_on_the_target_behind_the_jump_host_is_an_auth_failure() {
    if !server_up() { return; }
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new(PASSWORD)).unwrap();
    secrets.set("target", &Secret::new("yanlis-parola")).unwrap();
    let jump = Arc::new(SshConnection::connect(&session(Auth::Password), &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.unwrap());
    let mut target = session(Auth::Password);
    target.id = "target".into();
    target.host = "127.0.0.1".into();
    let err = SshConnection::connect_via(&jump, &target, &secrets, hosts(&dir), TestPrompt::new(HostKeyDecision::Trust)).await.err().unwrap();
    assert_eq!(err, SshError::AuthFailed);
}
