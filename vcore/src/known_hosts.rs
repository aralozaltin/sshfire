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
            KnownHostsError::Changed => write!(f, "sunucu anahtarı değişmiş; açıkça değiştirilmeli"),
            KnownHostsError::Corrupt { backup } => {
                write!(f, "bilinen sunucular dosyası bozuk, yedeği: {}", backup.display())
            }
            KnownHostsError::Io(e) => write!(f, "dosya hatası: {e}"),
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
        let json = serde_json::to_vec_pretty(&FileData { hosts: self.hosts.clone() }).expect("hosts serialize");
        crate::fsutil::atomic_write(&self.path, &json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const FP1: &str = "SHA256:aaaa";
    const FP2: &str = "SHA256:bbbb";

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
