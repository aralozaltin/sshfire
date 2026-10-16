use async_trait::async_trait;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::{passphrase_account, MemorySecrets, Secret, SecretStore};
use vcore::sessions::{Auth, Session};
use vcore::ssh::{key_needs_passphrase, AuthPromptItem, HostKeyDecision, HostKeyPrompt, SshConnection, SshError};

struct Prompt {
    answers: Option<Vec<String>>,
    asked: AtomicUsize,
    seen: Mutex<Vec<String>>,
}

impl Prompt {
    fn answering(answers: Option<Vec<&str>>) -> Arc<Prompt> {
        Arc::new(Prompt { answers: answers.map(|a| a.into_iter().map(String::from).collect()), asked: AtomicUsize::new(0), seen: Mutex::new(vec![]) })
    }
}

#[async_trait]
impl HostKeyPrompt for Prompt {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        HostKeyDecision::Trust
    }
    async fn interactive(&self, _name: &str, _instructions: &str, prompts: &[AuthPromptItem]) -> Option<Vec<String>> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        self.seen.lock().unwrap().extend(prompts.iter().map(|p| p.text.clone()));
        self.answers.clone().map(|a| a.into_iter().cycle().take(prompts.len()).collect())
    }
}

fn server_up() -> bool {
    let up = std::net::TcpStream::connect_timeout(&"127.0.0.1:2222".parse().unwrap(), Duration::from_millis(500)).is_ok();
    if !up {
        eprintln!("SKIP: test sshd kapalı (vcore/tests/docker/up.sh)");
    }
    up
}

fn key(name: &str) -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/docker/.keys").join(name).to_string_lossy().into()
}

fn session(auth: Auth) -> Session {
    Session { id: "s1".into(), name: "t".into(), host: "127.0.0.1".into(), port: 2222, user: "tester".into(), folder: None, auth, tunnels: vec![], jump: None, startup: None, color: None }
}

async fn connect(auth: Auth, secrets: &MemorySecrets, prompt: Arc<Prompt>) -> Result<SshConnection, SshError> {
    let dir = tempfile::tempdir().unwrap();
    let hosts = Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()));
    SshConnection::connect(&session(auth), secrets, hosts, prompt).await
}

#[test]
fn key_needs_passphrase_tells_encrypted_keys_from_plain_ones() {
    if !server_up() { return; }
    assert_eq!(key_needs_passphrase(&key("test_key_pass")).unwrap(), true);
    assert_eq!(key_needs_passphrase(&key("test_key")).unwrap(), false);
    assert!(key_needs_passphrase("/yok/boyle/anahtar").is_err());
}

#[tokio::test]
async fn a_passphrase_protected_key_logs_in_with_the_stored_passphrase() {
    if !server_up() { return; }
    let secrets = MemorySecrets::default();
    secrets.set(&passphrase_account("s1"), &Secret::new("key-pass-123")).unwrap();
    let conn = connect(Auth::KeyFile { path: key("test_key_pass") }, &secrets, Prompt::answering(None)).await.unwrap();
    assert_eq!(conn.exec("echo ok").await.unwrap(), "ok\n");
}

#[tokio::test]
async fn an_encrypted_key_without_a_passphrase_asks_for_one() {
    if !server_up() { return; }
    let err = connect(Auth::KeyFile { path: key("test_key_pass") }, &MemorySecrets::default(), Prompt::answering(None)).await.err().unwrap();
    assert_eq!(err, SshError::PassphraseRequired);
}

#[tokio::test]
async fn a_wrong_passphrase_is_reported_as_such_and_never_leaks() {
    if !server_up() { return; }
    let secrets = MemorySecrets::default();
    secrets.set(&passphrase_account("s1"), &Secret::new("yanlis-passphrase")).unwrap();
    let err = connect(Auth::KeyFile { path: key("test_key_pass") }, &secrets, Prompt::answering(None)).await.err().unwrap();
    assert_eq!(err, SshError::WrongPassphrase);
    assert!(!format!("{err:?}{err}").contains("yanlis-passphrase"));
}

#[tokio::test]
async fn a_plain_key_ignores_any_stored_passphrase() {
    if !server_up() { return; }
    let secrets = MemorySecrets::default();
    secrets.set(&passphrase_account("s1"), &Secret::new("gereksiz")).unwrap();
    assert!(connect(Auth::KeyFile { path: key("test_key") }, &secrets, Prompt::answering(None)).await.is_ok());
}

#[tokio::test]
async fn keyboard_interactive_asks_the_user_and_logs_in_with_the_answer() {
    if !server_up() { return; }
    let prompt = Prompt::answering(Some(vec!["test-pass-123"]));
    let conn = connect(Auth::Interactive, &MemorySecrets::default(), prompt.clone()).await.unwrap();
    assert_eq!(conn.exec("echo ki").await.unwrap(), "ki\n");
    assert!(prompt.asked.load(Ordering::SeqCst) >= 1);
    assert!(prompt.seen.lock().unwrap().iter().any(|p| p.to_lowercase().contains("password")), "{:?}", prompt.seen.lock().unwrap());
}

#[tokio::test]
async fn keyboard_interactive_with_a_wrong_answer_fails_and_cancelling_is_distinct() {
    if !server_up() { return; }
    let err = connect(Auth::Interactive, &MemorySecrets::default(), Prompt::answering(Some(vec!["yanlis"]))).await.err().unwrap();
    assert_eq!(err, SshError::AuthFailed);
    let err = connect(Auth::Interactive, &MemorySecrets::default(), Prompt::answering(None)).await.err().unwrap();
    assert_eq!(err, SshError::AuthCancelled);
}
