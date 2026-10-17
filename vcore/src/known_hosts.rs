use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub enum HostKeyStatus {
    Unknown,
    Trusted,
    Changed { previous: String },
}

#[derive(Debug)]
pub enum KnownHostsError {
    Changed,
    Corrupt { backup: PathBuf },
    Io(std::io::Error),
}

impl std::fmt::Display for KnownHostsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KnownHostsError::Changed => write!(f, "host key changed; replace it explicitly"),
            KnownHostsError::Corrupt { backup } => {
                write!(f, "known hosts file is corrupt, backup: {}", backup.display())
            }
            KnownHostsError::Io(e) => write!(f, "file error: {e}"),
        }
    }
}

impl From<std::io::Error> for KnownHostsError {
    fn from(e: std::io::Error) -> Self {
        KnownHostsError::Io(e)
    }
}

#[derive(Serialize, Deserialize, Default)]
struct FileData {
    hosts: BTreeMap<String, String>,
}

/// Güvenilen bir sunucunun listede görünen kaydı.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KnownHostEntry {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
}

pub struct KnownHosts {
    path: PathBuf,
    hosts: BTreeMap<String, String>,
}

fn key(host: &str, port: u16) -> String {
    format!("{}:{}", host.to_lowercase(), port)
}

impl KnownHosts {
    pub fn open(path: &Path) -> Result<KnownHosts, KnownHostsError> {
        let hosts = match std::fs::read(path) {
            Ok(bytes) => match serde_json::from_slice::<FileData>(&bytes) {
                Ok(data) => data.hosts,
                Err(_) => {
                    let backup = path.with_extension("json.bak");
                    std::fs::rename(path, &backup)?;
                    return Err(KnownHostsError::Corrupt { backup });
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(e) => return Err(e.into()),
        };
        Ok(KnownHosts { path: path.to_path_buf(), hosts })
    }

    pub fn check(&self, host: &str, port: u16, fingerprint: &str) -> HostKeyStatus {
        match self.hosts.get(&key(host, port)) {
            None => HostKeyStatus::Unknown,
            Some(known) if known == fingerprint => HostKeyStatus::Trusted,
            Some(known) => HostKeyStatus::Changed { previous: known.clone() },
        }
    }

    pub fn trust(&mut self, host: &str, port: u16, fingerprint: &str) -> Result<(), KnownHostsError> {
        if let HostKeyStatus::Changed { .. } = self.check(host, port, fingerprint) {
            return Err(KnownHostsError::Changed);
        }
        self.replace(host, port, fingerprint)
    }

    pub fn replace(&mut self, host: &str, port: u16, fingerprint: &str) -> Result<(), KnownHostsError> {
        self.hosts.insert(key(host, port), fingerprint.to_string());
        self.save()
    }

    /// Kayıtlı tüm sunucuları ada göre sıralı verir.
    pub fn list(&self) -> Vec<KnownHostEntry> {
        self.hosts
            .iter()
            .filter_map(|(k, fp)| {
                let (host, port) = k.rsplit_once(':')?;
                Some(KnownHostEntry { host: host.to_string(), port: port.parse().ok()?, fingerprint: fp.clone() })
            })
            .collect()
    }

    /// Sunucuyu unutur; kayıt vardıysa `true` döner.
    pub fn remove(&mut self, host: &str, port: u16) -> Result<bool, KnownHostsError> {
        if self.hosts.remove(&key(host, port)).is_none() {
            return Ok(false);
        }
        self.save()?;
        Ok(true)
    }

    fn save(&self) -> Result<(), KnownHostsError> {
        let json = serde_json::to_vec_pretty(&FileData { hosts: self.hosts.clone() }).expect("hosts serialize");
        crate::fsutil::atomic_write(&self.path, &json)?;
        Ok(())
    }
}

impl std::error::Error for KnownHostsError {}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const FP1: &str = "SHA256:aaaa";
    const FP2: &str = "SHA256:bbbb";

    #[test]
    fn list_returns_entries_sorted_and_remove_forgets_one_of_them() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("k.json");
        let mut kh = KnownHosts::open(&file).unwrap();
        kh.trust("b.example", 22, FP2).unwrap();
        kh.trust("a.example", 2222, FP1).unwrap();
        assert_eq!(
            kh.list(),
            vec![
                KnownHostEntry { host: "a.example".into(), port: 2222, fingerprint: FP1.into() },
                KnownHostEntry { host: "b.example".into(), port: 22, fingerprint: FP2.into() },
            ]
        );
        assert!(kh.remove("A.example", 2222).unwrap());
        assert!(!kh.remove("a.example", 2222).unwrap(), "removing twice reports nothing was removed");
        assert_eq!(KnownHosts::open(&file).unwrap().list().len(), 1);
        assert_eq!(kh.check("a.example", 2222, FP1), HostKeyStatus::Unknown);
    }

    #[test]
    fn a_removed_host_can_be_trusted_again_with_a_new_key() {
        let dir = tempdir().unwrap();
        let mut kh = KnownHosts::open(&dir.path().join("k.json")).unwrap();
        kh.trust("h", 22, FP1).unwrap();
        assert!(kh.trust("h", 22, FP2).is_err());
        kh.remove("h", 22).unwrap();
        kh.trust("h", 22, FP2).unwrap();
        assert_eq!(kh.check("h", 22, FP2), HostKeyStatus::Trusted);
    }

    #[test]
    fn unknown_host_reports_unknown() {
        let dir = tempdir().unwrap();
        let kh = KnownHosts::open(&dir.path().join("k.json")).unwrap();
        assert_eq!(kh.check("h", 22, FP1), HostKeyStatus::Unknown);
    }

    #[test]
    fn trusted_after_trust_call_and_persisted_across_reopen() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("k.json");
        let mut kh = KnownHosts::open(&file).unwrap();
        kh.trust("h", 22, FP1).unwrap();
        assert_eq!(kh.check("h", 22, FP1), HostKeyStatus::Trusted);
        let again = KnownHosts::open(&file).unwrap();
        assert_eq!(again.check("h", 22, FP1), HostKeyStatus::Trusted);
    }

    #[test]
    fn different_fingerprint_reports_changed_with_previous() {
        let dir = tempdir().unwrap();
        let mut kh = KnownHosts::open(&dir.path().join("k.json")).unwrap();
        kh.trust("h", 22, FP1).unwrap();
        assert_eq!(kh.check("h", 22, FP2), HostKeyStatus::Changed { previous: FP1.into() });
    }

    #[test]
    fn same_host_different_port_is_a_different_entry() {
        let dir = tempdir().unwrap();
        let mut kh = KnownHosts::open(&dir.path().join("k.json")).unwrap();
        kh.trust("h", 22, FP1).unwrap();
        assert_eq!(kh.check("h", 2222, FP1), HostKeyStatus::Unknown);
    }

    #[test]
    fn trust_does_not_overwrite_silently_on_changed() {
        let dir = tempdir().unwrap();
        let mut kh = KnownHosts::open(&dir.path().join("k.json")).unwrap();
        kh.trust("h", 22, FP1).unwrap();
        assert!(matches!(kh.trust("h", 22, FP2), Err(KnownHostsError::Changed)));
        assert_eq!(kh.check("h", 22, FP1), HostKeyStatus::Trusted);
        kh.replace("h", 22, FP2).unwrap();
        assert_eq!(kh.check("h", 22, FP2), HostKeyStatus::Trusted);
    }

    #[test]
    fn corrupt_file_is_moved_to_bak_and_not_treated_as_empty() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("k.json");
        std::fs::write(&file, "{bozuk").unwrap();
        match KnownHosts::open(&file) {
            Err(KnownHostsError::Corrupt { backup }) => {
                assert_eq!(std::fs::read_to_string(backup).unwrap(), "{bozuk");
            }
            _ => panic!("expected Corrupt"),
        }
    }
}
