use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vcore::known_hosts::{HostKeyStatus, KnownHosts};
use vcore::secrets::{MemorySecrets, Secret, SecretStore};
use vcore::sessions::{Auth, Session};
use vcore::sftp::{copy_remote, CancelToken, SftpClient, SftpError};
use vcore::shellquote::shell_quote;
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, SshConnection};

const PORT: u16 = 2222;

struct Trust;
#[async_trait]
impl HostKeyPrompt for Trust {
    async fn decide(&self, _h: &str, _p: u16, _fp: &str, _s: &HostKeyStatus) -> HostKeyDecision {
        HostKeyDecision::Trust
    }
}

fn server_up() -> bool {
    let up = std::net::TcpStream::connect_timeout(&format!("127.0.0.1:{PORT}").parse().unwrap(), Duration::from_millis(500)).is_ok();
    if !up {
        eprintln!("SKIP: test sshd kapalı (vcore/tests/docker/up.sh)");
    }
    up
}

struct Env {
    _dir: tempfile::TempDir,
    conn: SshConnection,
    sftp: SftpClient,
    base: String,
}

async fn env() -> Env {
    let dir = tempfile::tempdir().unwrap();
    let secrets = MemorySecrets::default();
    secrets.set("s1", &Secret::new("test-pass-123")).unwrap();
    let session = Session {
        id: "s1".into(), name: "t".into(), host: "127.0.0.1".into(), port: PORT, user: "tester".into(), folder: None, auth: Auth::Password, tunnels: vec![], jump: None, startup: None, color: None,
    };
    let hosts = Arc::new(Mutex::new(KnownHosts::open(&dir.path().join("k.json")).unwrap()));
    let conn = SshConnection::connect(&session, &secrets, hosts, Arc::new(Trust)).await.unwrap();
    let sftp = SftpClient::open(&conn).await.unwrap();
    let home = sftp.home_dir().await.unwrap();
    let base = format!("{}/t-{}", home.trim_end_matches('/'), uuid::Uuid::new_v4().simple());
    sftp.mkdir(&base).await.unwrap();
    Env { _dir: dir, conn, sftp, base }
}

impl Env {
    async fn cleanup(self) {
        let _ = self.sftp.remove(&self.base, true).await;
    }
}

fn noop() -> impl FnMut(u64, u64) + Send {
    |_, _| {}
}

#[tokio::test]
async fn shell_quote_survives_a_real_remote_shell() {
    if !server_up() { return; }
    let e = env().await;
    for nasty in ["plain", "a b", "it's", "q\"uote", "semi; echo pwned", "$(echo pwned)", "`echo pwned`", "a\\b", "ünïcode ş"] {
        let out = e.conn.exec(&format!("printf %s {}", shell_quote(nasty))).await.unwrap();
        assert_eq!(out, nasty);
    }
    e.cleanup().await;
}

#[tokio::test]
async fn list_dir_sorts_dirs_first_then_name() {
    if !server_up() { return; }
    let e = env().await;
    e.conn.exec(&format!("cd {} && mkdir zdir adir && touch b.txt A.txt", shell_quote(&e.base))).await.unwrap();
    let names: Vec<(String, bool)> = e.sftp.list_dir(&e.base).await.unwrap().into_iter().map(|f| (f.name, f.is_dir)).collect();
    assert_eq!(names, vec![("adir".into(), true), ("zdir".into(), true), ("A.txt".into(), false), ("b.txt".into(), false)]);
    e.cleanup().await;
}

#[tokio::test]
async fn list_missing_dir_is_not_found() {
    if !server_up() { return; }
    let e = env().await;
    assert_eq!(e.sftp.list_dir(&format!("{}/yok", e.base)).await.unwrap_err(), SftpError::NotFound);
    e.cleanup().await;
}

#[tokio::test]
async fn mkdir_rename_remove_roundtrip_and_exists_error() {
    if !server_up() { return; }
    let e = env().await;
    let a = format!("{}/a", e.base);
    let b = format!("{}/b", e.base);
    e.sftp.mkdir(&a).await.unwrap();
    assert_eq!(e.sftp.mkdir(&a).await.unwrap_err(), SftpError::Exists);
    e.sftp.rename(&a, &b).await.unwrap();
    assert!(e.sftp.stat(&b).await.unwrap().is_dir);
    assert_eq!(e.sftp.stat(&a).await.unwrap_err(), SftpError::NotFound);
    e.sftp.remove(&b, false).await.unwrap();
    assert_eq!(e.sftp.stat(&b).await.unwrap_err(), SftpError::NotFound);
    e.cleanup().await;
}

#[tokio::test]
async fn remove_recursive_deletes_a_tree() {
    if !server_up() { return; }
    let e = env().await;
    e.conn.exec(&format!("cd {} && mkdir -p t/x/y && touch t/x/y/f t/g", shell_quote(&e.base))).await.unwrap();
    let t = format!("{}/t", e.base);
    assert!(e.sftp.remove(&t, false).await.is_err(), "non-empty dir needs recursive");
    e.sftp.remove(&t, true).await.unwrap();
    assert_eq!(e.sftp.stat(&t).await.unwrap_err(), SftpError::NotFound);
    e.cleanup().await;
}

#[tokio::test]
async fn upload_then_download_is_byte_identical_and_reports_progress() {
    if !server_up() { return; }
    let e = env().await;
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("big.bin");
    let data: Vec<u8> = (0..5_000_000u32).map(|i| (i.wrapping_mul(2654435761) >> 13) as u8).collect();
    std::fs::write(&src, &data).unwrap();
    let remote = format!("{}/big.bin", e.base);

    let mut seen: Vec<(u64, u64)> = Vec::new();
    let mut cb = |d: u64, t: u64| seen.push((d, t));
    e.sftp.upload(&src, &remote, &mut cb, &CancelToken::new()).await.unwrap();
    assert!(seen.windows(2).all(|w| w[0].0 <= w[1].0), "progress must not go backwards");
    assert_eq!(*seen.last().unwrap(), (5_000_000, 5_000_000));
    assert_eq!(e.sftp.stat(&remote).await.unwrap().size, 5_000_000);

    let dst = tmp.path().join("back.bin");
    e.sftp.download(&remote, &dst, &mut noop(), &CancelToken::new()).await.unwrap();
    assert_eq!(std::fs::read(&dst).unwrap(), data);
    e.cleanup().await;
}

#[tokio::test]
async fn directories_upload_and_download_recursively() {
    if !server_up() { return; }
    let e = env().await;
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("proj");
    std::fs::create_dir_all(src.join("sub/deep")).unwrap();
    std::fs::write(src.join("a.txt"), "A").unwrap();
    std::fs::write(src.join("sub/b.txt"), "BB").unwrap();
    std::fs::write(src.join("sub/deep/c.txt"), "CCC").unwrap();
    let remote = format!("{}/proj", e.base);
    let mut last = (0, 0);
    let mut cb = |d: u64, t: u64| last = (d, t);
    e.sftp.upload(&src, &remote, &mut cb, &CancelToken::new()).await.unwrap();
    assert_eq!(last, (6, 6));
    let dst = tmp.path().join("copy");
    e.sftp.download(&remote, &dst, &mut noop(), &CancelToken::new()).await.unwrap();
    assert_eq!(std::fs::read_to_string(dst.join("sub/deep/c.txt")).unwrap(), "CCC");
    assert_eq!(std::fs::read_to_string(dst.join("a.txt")).unwrap(), "A");
    e.cleanup().await;
}

#[tokio::test]
async fn cancel_removes_the_partial_file() {
    if !server_up() { return; }
    let e = env().await;
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("big.bin");
    std::fs::write(&src, vec![7u8; 20_000_000]).unwrap();
    let remote = format!("{}/big.bin", e.base);
    let token = CancelToken::new();
    let t2 = token.clone();
    let mut cb = move |d: u64, _t: u64| {
        if d > 1_000_000 {
            t2.cancel();
        }
    };
    let err = e.sftp.upload(&src, &remote, &mut cb, &token).await.unwrap_err();
    assert_eq!(err, SftpError::Cancelled);
    assert_eq!(e.sftp.stat(&remote).await.unwrap_err(), SftpError::NotFound);

    e.sftp.upload(&src, &remote, &mut noop(), &CancelToken::new()).await.unwrap();
    let dst = tmp.path().join("down.bin");
    let token = CancelToken::new();
    let t2 = token.clone();
    let mut cb = move |d: u64, _t: u64| {
        if d > 1_000_000 {
            t2.cancel();
        }
    };
    assert_eq!(e.sftp.download(&remote, &dst, &mut cb, &token).await.unwrap_err(), SftpError::Cancelled);
    assert!(!dst.exists(), "partial local file must be removed");
    e.cleanup().await;
}

#[tokio::test]
async fn copy_handles_names_with_quotes_and_spaces() {
    if !server_up() { return; }
    let e = env().await;
    let nasty = "a b'c\"; rm -rf ~ $(echo x).txt";
    let from = format!("{}/{}", e.base, nasty);
    let to = format!("{}/copy of {}", e.base, nasty);
    e.conn.exec(&format!("printf hello > {}", shell_quote(&from))).await.unwrap();
    copy_remote(&e.conn, &from, &to).await.unwrap();
    let names: Vec<String> = e.sftp.list_dir(&e.base).await.unwrap().into_iter().map(|f| f.name).collect();
    assert!(names.contains(&nasty.to_string()) && names.contains(&format!("copy of {nasty}")), "{names:?}");
    e.cleanup().await;
}

#[tokio::test]
async fn copy_of_a_directory_is_recursive() {
    if !server_up() { return; }
    let e = env().await;
    e.conn.exec(&format!("cd {} && mkdir -p d/e && echo hi > d/e/f", shell_quote(&e.base))).await.unwrap();
    copy_remote(&e.conn, &format!("{}/d", e.base), &format!("{}/d2", e.base)).await.unwrap();
    assert_eq!(e.conn.exec(&format!("cat {}/d2/e/f", shell_quote(&e.base))).await.unwrap(), "hi\n");
    e.cleanup().await;
}

#[tokio::test]
async fn listing_10k_files_completes_under_10_seconds() {
    if !server_up() { return; }
    let e = env().await;
    e.conn.exec(&format!("cd {} && seq 1 10000 | sed 's/^/f/' | xargs touch", shell_quote(&e.base))).await.unwrap();
    let started = std::time::Instant::now();
    let list = e.sftp.list_dir(&e.base).await.unwrap();
    assert_eq!(list.len(), 10000);
    assert!(started.elapsed() < Duration::from_secs(10), "{:?}", started.elapsed());
    e.cleanup().await;
}

#[tokio::test]
async fn read_file_returns_the_bytes_and_refuses_files_over_the_limit() {
    if !server_up() { return; }
    let e = env().await;
    let f = format!("{}/a.txt", e.base);
    e.conn.exec(&format!("printf 'merhaba\\ndünya' > {}", shell_quote(&f))).await.unwrap();
    assert_eq!(e.sftp.read_file(&f, 1024).await.unwrap(), "merhaba\ndünya".as_bytes());
    assert_eq!(e.sftp.read_file(&f, 5).await.unwrap_err(), SftpError::TooLarge);
    assert_eq!(e.sftp.read_file(&format!("{}/yok", e.base), 1024).await.unwrap_err(), SftpError::NotFound);
    e.cleanup().await;
}

#[tokio::test]
async fn write_file_replaces_content_creates_new_files_and_keeps_the_mode() {
    if !server_up() { return; }
    let e = env().await;
    let f = format!("{}/script.sh", e.base);
    e.conn.exec(&format!("printf 'eski içerik, daha uzun' > {f} && chmod 750 {f}", f = shell_quote(&f))).await.unwrap();
    e.sftp.write_file(&f, "yeni".as_bytes()).await.unwrap();
    assert_eq!(e.sftp.read_file(&f, 1024).await.unwrap(), b"yeni");
    assert_eq!(e.sftp.stat(&f).await.unwrap().permissions, Some(0o750));
    let created = format!("{}/yeni.txt", e.base);
    e.sftp.write_file(&created, b"ilk").await.unwrap();
    assert_eq!(e.sftp.read_file(&created, 1024).await.unwrap(), b"ilk");
    e.cleanup().await;
}

#[tokio::test]
async fn chmod_changes_the_permission_bits() {
    if !server_up() { return; }
    let e = env().await;
    let f = format!("{}/c.sh", e.base);
    e.sftp.write_file(&f, b"echo hi").await.unwrap();
    e.sftp.chmod(&f, 0o750).await.unwrap();
    assert_eq!(e.sftp.stat(&f).await.unwrap().permissions, Some(0o750));
    assert_eq!(e.sftp.chmod(&format!("{}/yok", e.base), 0o644).await.unwrap_err(), SftpError::NotFound);
    e.cleanup().await;
}
