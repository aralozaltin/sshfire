use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Auth {
    Password,
    KeyFile { path: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub folder: Option<String>,
    pub auth: Auth,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewSession {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub folder: Option<String>,
    pub auth: Auth,
}

#[derive(Debug)]
pub enum StoreError {
    Invalid(String),
    Corrupt { backup: PathBuf },
    Io(std::io::Error),
}

#[derive(Serialize, Deserialize, Default)]
struct FileData {
    sessions: Vec<Session>,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Invalid(m) => write!(f, "geçersiz oturum: {m}"),
            StoreError::Corrupt { backup } => {
                write!(f, "oturum dosyası bozuk, yedeği: {}", backup.display())
            }
            StoreError::Io(e) => write!(f, "dosya hatası: {e}"),
        }
    }
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

pub struct SessionStore {
    path: PathBuf,
    sessions: Vec<Session>,
}

fn validate(name: &str, host: &str, port: u16, user: &str) -> Result<(), StoreError> {
    if name.trim().is_empty() {
        return Err(StoreError::Invalid("ad boş".into()));
    }
    if host.trim().is_empty() {
        return Err(StoreError::Invalid("adres boş".into()));
    }
    if port == 0 {
        return Err(StoreError::Invalid("port 0 olamaz".into()));
    }
    if user.trim().is_empty() {
        return Err(StoreError::Invalid("kullanıcı boş".into()));
    }
    Ok(())
}

impl SessionStore {
    pub fn open(path: &Path) -> Result<SessionStore, StoreError> {
        let sessions = match std::fs::read(path) {
            Ok(bytes) => match serde_json::from_slice::<FileData>(&bytes) {
                Ok(data) => data.sessions,
                Err(_) => {
                    let backup = path.with_extension("json.bak");
                    std::fs::rename(path, &backup)?;
                    return Err(StoreError::Corrupt { backup });
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        Ok(SessionStore { path: path.to_path_buf(), sessions })
    }

    fn save(&self) -> Result<(), StoreError> {
        let data = FileData { sessions: self.sessions.clone() };
        let json = serde_json::to_vec_pretty(&data).expect("sessions serialize");
        crate::fsutil::atomic_write(&self.path, &json)?;
        Ok(())
    }

    pub fn list(&self) -> &[Session] {
        &self.sessions
    }

    pub fn add(&mut self, s: NewSession) -> Result<Session, StoreError> {
        validate(&s.name, &s.host, s.port, &s.user)?;
        let session = Session {
            id: uuid::Uuid::new_v4().to_string(),
            name: s.name,
            host: s.host,
            port: s.port,
            user: s.user,
            folder: s.folder,
            auth: s.auth,
        };
        self.sessions.push(session.clone());
        self.save()?;
        Ok(session)
    }

    pub fn update(&mut self, s: Session) -> Result<(), StoreError> {
        validate(&s.name, &s.host, s.port, &s.user)?;
        let slot = self
            .sessions
            .iter_mut()
            .find(|x| x.id == s.id)
            .ok_or_else(|| StoreError::Invalid("oturum bulunamadı".into()))?;
        *slot = s;
        self.save()
    }

    pub fn remove(&mut self, id: &str) -> Result<(), StoreError> {
        self.sessions.retain(|x| x.id != id);
        self.save()
    }

    pub fn search(&self, q: &str) -> Vec<&Session> {
        let q = q.trim().to_lowercase();
        self.sessions
            .iter()
            .filter(|s| {
                q.is_empty()
                    || s.name.to_lowercase().contains(&q)
                    || s.host.to_lowercase().contains(&q)
                    || s.folder.as_deref().is_some_and(|f| f.to_lowercase().contains(&q))
            })
            .collect()
    }
}

impl std::error::Error for StoreError {}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn new(name: &str, host: &str) -> NewSession {
        NewSession {
            name: name.into(),
            host: host.into(),
            port: 22,
            user: "root".into(),
            folder: None,
            auth: Auth::Password,
        }
    }

    #[test]
    fn add_then_list_roundtrips_through_disk() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("sessions.json");
        let mut store = SessionStore::open(&file).unwrap();
        let added = store.add(new("test 3.81", "192.168.3.81")).unwrap();
        let reopened = SessionStore::open(&file).unwrap();
        assert_eq!(reopened.list(), &[added]);
    }

    #[test]
    fn rejects_empty_host_and_port_zero() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        assert!(matches!(store.add(new("a", "  ")), Err(StoreError::Invalid(_))));
        let mut zero = new("a", "h");
        zero.port = 0;
        assert!(matches!(store.add(zero), Err(StoreError::Invalid(_))));
        assert!(store.list().is_empty());
    }

    #[test]
    fn duplicate_names_get_distinct_ids() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        let a = store.add(new("same", "h1")).unwrap();
        let b = store.add(new("same", "h2")).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(store.list().len(), 2);
    }

    #[test]
    fn search_matches_name_host_and_folder_case_insensitively() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        store.add(new("Prod Api", "10.0.0.1")).unwrap();
        let mut t = new("x", "192.168.3.81");
        t.folder = Some("Test Sunucular".into());
        store.add(t).unwrap();
        assert_eq!(store.search("prod").len(), 1);
        assert_eq!(store.search("3.81").len(), 1);
        assert_eq!(store.search("TEST sun").len(), 1);
        assert_eq!(store.search("").len(), 2);
        assert_eq!(store.search("yok").len(), 0);
    }

    #[test]
    fn update_and_remove_persist() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("s.json");
        let mut store = SessionStore::open(&file).unwrap();
        let mut s = store.add(new("a", "h")).unwrap();
        s.name = "b".into();
        store.update(s.clone()).unwrap();
        assert_eq!(SessionStore::open(&file).unwrap().list()[0].name, "b");
        store.remove(&s.id).unwrap();
        assert!(SessionStore::open(&file).unwrap().list().is_empty());
    }

    #[test]
    fn corrupt_file_is_moved_to_bak_and_returns_corrupt_error() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("sessions.json");
        std::fs::write(&file, "{bozuk").unwrap();
        match SessionStore::open(&file) {
            Err(StoreError::Corrupt { backup }) => {
                assert_eq!(std::fs::read_to_string(backup).unwrap(), "{bozuk");
            }
            _ => panic!("expected Corrupt"),
        }
        assert!(!file.exists());
    }

    #[test]
    fn saved_file_contains_no_password_field() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("s.json");
        let mut store = SessionStore::open(&file).unwrap();
        store.add(new("a", "h")).unwrap();
        let text = std::fs::read_to_string(&file).unwrap().to_lowercase();
        assert!(!text.contains("\"password\":"));
    }
}
