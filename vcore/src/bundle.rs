//! Parola korumalı taşıma paketi: oturum listesi + kasadaki parolalar + anahtar dosyası içerikleri.
//! Paket Argon2id ile türetilen anahtarla ChaCha20-Poly1305 kullanılarak şifrelenir; işletim sisteminden
//! bağımsızdır (yalnızca JSON + base64), bu yüzden macOS/Windows/Linux arasında olduğu gibi taşınır.

use crate::secrets::{Secret, SecretError, SecretStore, passphrase_account};
use crate::sessions::{Auth, ImportReport, Session, SessionStore, StoreError};
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit, aead::{Aead, Payload}};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

const FORMAT: &str = "sshfire-vault";
pub const BUNDLE_VERSION: u32 = 2;
const AAD: &[u8] = b"sshfire-vault-v2";
const MEM_KIB: u32 = 64 * 1024;
const ITERATIONS: u32 = 3;
const LANES: u32 = 1;

#[derive(Debug, PartialEq)]
pub enum BundleError {
    /// Parola yanlış ya da dosya bozulmuş/değiştirilmiş (ikisi birbirinden ayırt edilemez).
    WrongPassphrase,
    Invalid(String),
}

impl std::fmt::Display for BundleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BundleError::WrongPassphrase => f.write_str("wrong passphrase or damaged file"),
            BundleError::Invalid(m) => write!(f, "invalid bundle: {m}"),
        }
    }
}

/// Bir sunucuya ait gizli bilgiler (yeni bilgisayarda kasaya yazılır).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionSecrets {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_passphrase: Option<String>,
}

/// Paketin şifresi çözülmüş içeriği.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Payload2 {
    pub sessions: Vec<Session>,
    /// Anahtar: eski oturum kimliği.
    #[serde(default)]
    pub secrets: BTreeMap<String, SessionSecrets>,
    /// Anahtar: eski oturum kimliği; değer: özel anahtar dosyasının içeriği (base64).
    #[serde(default)]
    pub key_files: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize)]
struct Kdf {
    alg: String,
    m_kib: u32,
    t: u32,
    p: u32,
    salt: String,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    format: String,
    version: u32,
    kdf: Kdf,
    nonce: String,
    data: String,
}

fn derive(pass: &str, salt: &[u8], m: u32, t: u32, p: u32) -> Result<[u8; 32], BundleError> {
    let params = argon2::Params::new(m, t, p, Some(32)).map_err(|e| BundleError::Invalid(e.to_string()))?;
    let argon = argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut key = [0u8; 32];
    argon.hash_password_into(pass.as_bytes(), salt, &mut key).map_err(|e| BundleError::Invalid(e.to_string()))?;
    Ok(key)
}

pub fn seal(payload: &Payload2, pass: &str) -> Result<String, BundleError> {
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut salt).map_err(|e| BundleError::Invalid(e.to_string()))?;
    getrandom::fill(&mut nonce).map_err(|e| BundleError::Invalid(e.to_string()))?;
    let key = derive(pass, &salt, MEM_KIB, ITERATIONS, LANES)?;
    let plain = serde_json::to_vec(payload).map_err(|e| BundleError::Invalid(e.to_string()))?;
    let cipher = ChaCha20Poly1305::new((&key).into());
    let ct = cipher
        .encrypt((&nonce).into(), Payload { msg: &plain, aad: AAD })
        .map_err(|_| BundleError::Invalid("encryption failed".into()))?;
    let env = Envelope {
        format: FORMAT.into(),
        version: BUNDLE_VERSION,
        kdf: Kdf { alg: "argon2id".into(), m_kib: MEM_KIB, t: ITERATIONS, p: LANES, salt: B64.encode(salt) },
        nonce: B64.encode(nonce),
        data: B64.encode(ct),
    };
    serde_json::to_string_pretty(&env).map_err(|e| BundleError::Invalid(e.to_string()))
}

/// Metin şifreli bir paket mi (yoksa eski, parolasız dışa aktarma mı)?
pub fn is_sealed(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|v| v.get("format").and_then(|f| f.as_str().map(|s| s == FORMAT)))
        .unwrap_or(false)
}

pub fn open(text: &str, pass: &str) -> Result<Payload2, BundleError> {
    let env: Envelope = serde_json::from_str(text).map_err(|e| BundleError::Invalid(e.to_string()))?;
    if env.format != FORMAT {
        return Err(BundleError::Invalid("not a SSHFire vault".into()));
    }
    if env.version != BUNDLE_VERSION || env.kdf.alg != "argon2id" {
        return Err(BundleError::Invalid(format!("unsupported version {}", env.version)));
    }
    // Kötü niyetli dosyanın bellek/zaman bombası olmasın.
    if env.kdf.m_kib > 1024 * 1024 || env.kdf.t > 20 || env.kdf.p > 16 {
        return Err(BundleError::Invalid("unreasonable kdf cost".into()));
    }
    let dec = |s: &str| B64.decode(s).map_err(|_| BundleError::Invalid("bad base64".into()));
    let salt = dec(&env.kdf.salt)?;
    let nonce = dec(&env.nonce)?;
    let ct = dec(&env.data)?;
    let nonce: [u8; 12] = nonce.try_into().map_err(|_| BundleError::Invalid("bad nonce".into()))?;
    let key = derive(pass, &salt, env.kdf.m_kib, env.kdf.t, env.kdf.p)?;
    let cipher = ChaCha20Poly1305::new((&key).into());
    let plain = cipher
        .decrypt((&nonce).into(), Payload { msg: &ct, aad: AAD })
        .map_err(|_| BundleError::WrongPassphrase)?;
    serde_json::from_slice(&plain).map_err(|e| BundleError::Invalid(e.to_string()))
}

/// Anahtar dosyası içeriğini diğer işletim sisteminde de çalışacak hale getirir (Windows satır sonu → LF).
pub fn normalize_key_text(bytes: &[u8]) -> Vec<u8> {
    let Ok(text) = std::str::from_utf8(bytes) else { return bytes.to_vec() };
    if !text.contains("-----BEGIN") {
        return bytes.to_vec();
    }
    let mut out = text.replace("\r\n", "\n").replace('\r', "\n");
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.into_bytes()
}

/// Dışa aktarma sırasında okunamayan öğeler (kullanıcıya bildirilir, dışa aktarma yine de tamamlanır).
#[derive(Debug, Default, PartialEq)]
pub struct ExportWarnings {
    /// Anahtar dosyası okunamadığı için pakete giremeyen sunucu adları.
    pub unreadable_keys: Vec<String>,
}

/// Oturumlar + kasadaki parolalar + anahtar dosyası içeriklerinden paketin düz içeriğini kurar.
pub fn build_payload(sessions: &[Session], secrets: &dyn SecretStore) -> Result<(Payload2, ExportWarnings), SecretError> {
    let mut payload = Payload2 { sessions: sessions.to_vec(), ..Default::default() };
    let mut warnings = ExportWarnings::default();
    for s in sessions {
        let mut entry = SessionSecrets::default();
        match &s.auth {
            Auth::Password => entry.password = secrets.get(&s.id)?.map(|x| x.expose().to_string()),
            Auth::KeyFile { path } => {
                entry.key_passphrase = secrets.get(&passphrase_account(&s.id))?.map(|x| x.expose().to_string());
                match std::fs::read(path) {
                    Ok(bytes) => {
                        payload.key_files.insert(s.id.clone(), B64.encode(normalize_key_text(&bytes)));
                    }
                    Err(_) => warnings.unreadable_keys.push(s.name.clone()),
                }
            }
            Auth::Agent | Auth::Interactive => {}
        }
        if entry != SessionSecrets::default() {
            payload.secrets.insert(s.id.clone(), entry);
        }
    }
    Ok((payload, warnings))
}

#[derive(Debug)]
pub enum ApplyError {
    Store(StoreError),
    Secret(SecretError),
    Io(std::io::Error),
}

fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)?;
        f.write_all(bytes)
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, bytes)
    }
}

/// Paketi bu bilgisayara uygular: oturumları ekler, parolaları kasaya yazar, anahtar dosyalarını
/// `key_dir` altına (yalnızca kullanıcıya okunur) çıkarıp oturumun yolunu oraya çevirir.
/// Zaten kayıtlı (aynı adres/port/kullanıcı) sunucuların parolalarına dokunulmaz.
pub fn apply_payload(
    store: &mut SessionStore,
    secrets: &dyn SecretStore,
    payload: Payload2,
    key_dir: &Path,
) -> Result<ImportReport, ApplyError> {
    let Payload2 { sessions, secrets: bundle_secrets, key_files } = payload;
    let report = store.import(sessions).map_err(ApplyError::Store)?;
    for (old, new) in &report.new_ids {
        if let Some(entry) = bundle_secrets.get(old) {
            if let Some(pw) = &entry.password {
                secrets.set(new, &Secret::new(pw.clone())).map_err(ApplyError::Secret)?;
            }
            if let Some(pp) = &entry.key_passphrase {
                secrets.set(&passphrase_account(new), &Secret::new(pp.clone())).map_err(ApplyError::Secret)?;
            }
        }
        if let Some(b64) = key_files.get(old) {
            let bytes = B64.decode(b64).map_err(|_| ApplyError::Store(StoreError::Invalid("bad key data".into())))?;
            let target = key_dir.join(new);
            write_private(&target, &bytes).map_err(ApplyError::Io)?;
            if let Some(mut s) = store.list().iter().find(|s| &s.id == new).cloned() {
                s.auth = Auth::KeyFile { path: target.to_string_lossy().into_owned() };
                store.update(s).map_err(ApplyError::Store)?;
            }
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sessions::Auth;

    fn sample() -> Payload2 {
        let mut p = Payload2::default();
        p.sessions.push(Session {
            id: "a".into(), name: "n".into(), host: "h".into(), port: 22, user: "u".into(),
            folder: None, auth: Auth::Password, tunnels: vec![], jump: None, startup: None, color: None,
        });
        p.secrets.insert("a".into(), SessionSecrets { password: Some("hunter2".into()), key_passphrase: None });
        p.key_files.insert("a".into(), B64.encode(b"KEYDATA"));
        p
    }

    #[test]
    fn roundtrip() {
        let sealed = seal(&sample(), "yedek-parola").unwrap();
        assert_eq!(open(&sealed, "yedek-parola").unwrap(), sample());
    }

    #[test]
    fn file_contains_no_plaintext_secret() {
        let sealed = seal(&sample(), "yedek-parola").unwrap();
        assert!(!sealed.contains("hunter2"));
        assert!(!sealed.contains("KEYDATA"));
        assert!(!sealed.contains("\"host\""));
    }

    #[test]
    fn wrong_passphrase_is_reported() {
        let sealed = seal(&sample(), "dogru").unwrap();
        assert_eq!(open(&sealed, "yanlis"), Err(BundleError::WrongPassphrase));
    }

    #[test]
    fn tampering_is_detected() {
        let sealed = seal(&sample(), "p").unwrap();
        let mut v: serde_json::Value = serde_json::from_str(&sealed).unwrap();
        let d = v["data"].as_str().unwrap().to_string();
        let mut raw = B64.decode(d).unwrap();
        raw[0] ^= 1;
        v["data"] = B64.encode(raw).into();
        assert_eq!(open(&v.to_string(), "p"), Err(BundleError::WrongPassphrase));
    }

    #[test]
    fn same_input_gives_different_files() {
        assert_ne!(seal(&sample(), "p").unwrap(), seal(&sample(), "p").unwrap());
    }

    #[test]
    fn detects_sealed_vs_plain_export() {
        assert!(is_sealed(&seal(&sample(), "p").unwrap()));
        assert!(!is_sealed("{\"version\":1,\"sessions\":[]}"));
        assert!(!is_sealed("garbage"));
    }

    #[test]
    fn absurd_kdf_cost_is_refused() {
        let sealed = seal(&sample(), "p").unwrap();
        let mut v: serde_json::Value = serde_json::from_str(&sealed).unwrap();
        v["kdf"]["m_kib"] = 4_000_000u32.into();
        assert!(matches!(open(&v.to_string(), "p"), Err(BundleError::Invalid(_))));
    }

    #[test]
    fn crlf_keys_become_lf() {
        let k = b"-----BEGIN OPENSSH PRIVATE KEY-----\r\nabc\r\n-----END OPENSSH PRIVATE KEY-----";
        let n = normalize_key_text(k);
        assert!(!n.contains(&b'\r'));
        assert!(n.ends_with(b"\n"));
        assert_eq!(normalize_key_text(&[0, 159, 1]), vec![0, 159, 1]);
    }

    use crate::secrets::MemorySecrets;
    use tempfile::tempdir;

    fn sess(id: &str, host: &str, auth: Auth) -> Session {
        Session { id: id.into(), name: format!("s-{id}"), host: host.into(), port: 22, user: "u".into(), folder: None, auth, tunnels: vec![], jump: None, startup: None, color: None }
    }

    #[test]
    fn full_transfer_between_machines() {
        let dir = tempdir().unwrap();
        let key = dir.path().join("id_ed25519");
        std::fs::write(&key, "-----BEGIN OPENSSH PRIVATE KEY-----\r\nabc\r\n-----END OPENSSH PRIVATE KEY-----\r\n").unwrap();
        let src_secrets = MemorySecrets::default();
        src_secrets.set("p1", &Secret::new("pw1")).unwrap();
        src_secrets.set("k1:passphrase", &Secret::new("kp")).unwrap();
        let sessions = vec![
            sess("p1", "a.example.com", Auth::Password),
            sess("k1", "b.example.com", Auth::KeyFile { path: key.to_string_lossy().into_owned() }),
            sess("g1", "c.example.com", Auth::Agent),
        ];
        let (payload, warnings) = build_payload(&sessions, &src_secrets).unwrap();
        assert_eq!(warnings, ExportWarnings::default());
        let sealed = seal(&payload, "yedek").unwrap();

        // başka bilgisayar
        let opened = open(&sealed, "yedek").unwrap();
        let mut store = SessionStore::open(&dir.path().join("yeni.json")).unwrap();
        let dst_secrets = MemorySecrets::default();
        let keys = dir.path().join("keys");
        let report = apply_payload(&mut store, &dst_secrets, opened, &keys).unwrap();
        assert_eq!(report.added, 3);
        let find = |h: &str| store.list().iter().find(|s| s.host == h).unwrap().clone();
        let a = find("a.example.com");
        assert_eq!(dst_secrets.get(&a.id).unwrap().unwrap().expose(), "pw1");
        let b = find("b.example.com");
        assert_eq!(dst_secrets.get(&passphrase_account(&b.id)).unwrap().unwrap().expose(), "kp");
        let Auth::KeyFile { path } = &b.auth else { panic!("key auth expected") };
        assert!(path.starts_with(keys.to_str().unwrap()));
        let written = std::fs::read_to_string(path).unwrap();
        assert!(!written.contains('\r') && written.contains("abc"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(path).unwrap().permissions().mode() & 0o777, 0o600);
        }
    }

    #[test]
    fn existing_sessions_keep_their_own_secrets() {
        let dir = tempdir().unwrap();
        let src = MemorySecrets::default();
        src.set("p1", &Secret::new("eski-dosyadaki")).unwrap();
        let (payload, _) = build_payload(&[sess("p1", "a.example.com", Auth::Password)], &src).unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        let existing = store
            .add(crate::sessions::NewSession { name: "var".into(), host: "a.example.com".into(), port: 22, user: "u".into(), folder: None, auth: Auth::Password, tunnels: vec![], jump: None, startup: None, color: None })
            .unwrap();
        let dst = MemorySecrets::default();
        dst.set(&existing.id, &Secret::new("benim")).unwrap();
        let report = apply_payload(&mut store, &dst, payload, &dir.path().join("k")).unwrap();
        assert_eq!((report.added, report.skipped), (0, 1));
        assert_eq!(dst.get(&existing.id).unwrap().unwrap().expose(), "benim");
    }

    #[test]
    fn unreadable_key_file_is_warned_not_fatal() {
        let s = sess("k", "h", Auth::KeyFile { path: "/yok/yok".into() });
        let (payload, warnings) = build_payload(&[s], &MemorySecrets::default()).unwrap();
        assert_eq!(warnings.unreadable_keys, vec!["s-k".to_string()]);
        assert!(payload.key_files.is_empty());
    }
}
