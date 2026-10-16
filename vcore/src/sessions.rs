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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tunnels: Vec<crate::tunnel::TunnelSpec>,
    /// Bu sunucuya hangi kayıtlı sunucu üzerinden (atlama/bastion) bağlanılacağı.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jump: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewSession {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub folder: Option<String>,
    pub auth: Auth,
    #[serde(default)]
    pub tunnels: Vec<crate::tunnel::TunnelSpec>,
    #[serde(default)]
    pub jump: Option<String>,
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
            StoreError::Invalid(m) => write!(f, "invalid session: {m}"),
            StoreError::Corrupt { backup } => {
                write!(f, "sessions file is corrupt, backup: {}", backup.display())
            }
            StoreError::Io(e) => write!(f, "file error: {e}"),
        }
    }
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

#[derive(Debug, PartialEq)]
pub struct ImportReport {
    pub added: usize,
    pub skipped: usize,
}

#[derive(Serialize, Deserialize)]
struct ExportFile {
    version: u32,
    sessions: Vec<Session>,
}

const EXPORT_VERSION: u32 = 1;

pub fn parse_export(text: &str) -> Result<Vec<Session>, StoreError> {
    let file: ExportFile = serde_json::from_str(text).map_err(|e| StoreError::Invalid(format!("not a session export: {e}")))?;
    if file.version != EXPORT_VERSION {
        return Err(StoreError::Invalid(format!("unsupported export version {}", file.version)));
    }
    Ok(file.sessions)
}

pub struct SessionStore {
    path: PathBuf,
    sessions: Vec<Session>,
}

fn validate(name: &str, host: &str, port: u16, user: &str, tunnels: &[crate::tunnel::TunnelSpec]) -> Result<(), StoreError> {
    if name.trim().is_empty() {
        return Err(StoreError::Invalid("name is empty".into()));
    }
    if host.trim().is_empty() {
        return Err(StoreError::Invalid("host is empty".into()));
    }
    if port == 0 {
        return Err(StoreError::Invalid("port must not be 0".into()));
    }
    if user.trim().is_empty() {
        return Err(StoreError::Invalid("user is empty".into()));
    }
    for t in tunnels {
        t.validate().map_err(StoreError::Invalid)?;
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

    /// Oturum listesini taşınabilir bir dosya metnine çevirir (parolalar hiçbir zaman dahil değildir).
    pub fn export_json(&self) -> String {
        let file = ExportFile { version: EXPORT_VERSION, sessions: self.sessions.clone() };
        serde_json::to_string_pretty(&file).expect("sessions serialize")
    }

    /// Dışa aktarılmış oturumları ekler: aynı adres/port/kullanıcı olanları atlar, kimlikleri yeniler,
    /// atlama sunucusu bağlantılarını yeni kimliklere taşır (dosya dışına işaret edenleri siler).
    pub fn import(&mut self, incoming: Vec<Session>) -> Result<ImportReport, StoreError> {
        let mut report = ImportReport { added: 0, skipped: 0 };
        let mut remap: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut fresh: Vec<Session> = Vec::new();
        for s in incoming {
            validate(&s.name, &s.host, s.port, &s.user, &s.tunnels)?;
            let existing = self.sessions.iter().find(|x| x.host == s.host && x.port == s.port && x.user == s.user);
            if let Some(found) = existing {
                remap.insert(s.id.clone(), found.id.clone());
                report.skipped += 1;
                continue;
            }
            let new_id = uuid::Uuid::new_v4().to_string();
            remap.insert(s.id.clone(), new_id.clone());
            fresh.push(Session { id: new_id, ..s });
            report.added += 1;
        }
        for s in &mut fresh {
            s.jump = s.jump.as_ref().and_then(|old| remap.get(old).cloned());
        }
        self.sessions.extend(fresh);
        self.save()?;
        Ok(report)
    }

    pub fn list(&self) -> &[Session] {
        &self.sessions
    }

    fn check_jump(&self, id: Option<&str>, jump: &Option<String>) -> Result<(), StoreError> {
        let Some(first) = jump else { return Ok(()) };
        let mut seen = vec![first.clone()];
        let mut current = first.clone();
        loop {
            if Some(current.as_str()) == id {
                return Err(StoreError::Invalid("jump host loop".into()));
            }
            let Some(next) = self.sessions.iter().find(|x| x.id == current) else {
                return Err(StoreError::Invalid("jump host not found".into()));
            };
            match &next.jump {
                Some(n) if !seen.contains(n) => {
                    seen.push(n.clone());
                    current = n.clone();
                }
                Some(_) => return Err(StoreError::Invalid("jump host loop".into())),
                None => return Ok(()),
            }
            if seen.len() > 5 {
                return Err(StoreError::Invalid("jump chain is too long".into()));
            }
        }
    }

    /// Bağlantı sırasıyla atlama zinciri: önce ilk atlama, en sonda sunucunun kendisi.
    pub fn jump_chain(&self, id: &str) -> Option<Vec<&Session>> {
        let mut chain = vec![self.sessions.iter().find(|x| x.id == id)?];
        while let Some(next) = chain[0].jump.as_deref() {
            if chain.len() > 5 {
                return None;
            }
            chain.insert(0, self.sessions.iter().find(|x| x.id == next)?);
        }
        Some(chain)
    }

    pub fn add(&mut self, s: NewSession) -> Result<Session, StoreError> {
        validate(&s.name, &s.host, s.port, &s.user, &s.tunnels)?;
        self.check_jump(None, &s.jump)?;
        let session = Session {
            id: uuid::Uuid::new_v4().to_string(),
            name: s.name,
            host: s.host,
            port: s.port,
            user: s.user,
            folder: s.folder,
            auth: s.auth,
            tunnels: s.tunnels,
            jump: s.jump,
        };
        self.sessions.push(session.clone());
        self.save()?;
        Ok(session)
    }

    pub fn update(&mut self, s: Session) -> Result<(), StoreError> {
        validate(&s.name, &s.host, s.port, &s.user, &s.tunnels)?;
        self.check_jump(Some(&s.id), &s.jump)?;
        let slot = self
            .sessions
            .iter_mut()
            .find(|x| x.id == s.id)
            .ok_or_else(|| StoreError::Invalid("session not found".into()))?;
        *slot = s;
        self.save()
    }

    pub fn remove(&mut self, id: &str) -> Result<(), StoreError> {
        self.sessions.retain(|x| x.id != id);
        for s in self.sessions.iter_mut().filter(|s| s.jump.as_deref() == Some(id)) {
            s.jump = None;
        }
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
            tunnels: vec![],
            jump: None,
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
    fn tunnels_roundtrip_and_old_files_without_them_still_load() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("s.json");
        let mut store = SessionStore::open(&file).unwrap();
        let mut n = new("a", "h");
        n.tunnels = vec![crate::tunnel::TunnelSpec::Dynamic { listen_port: 1080 }];
        let added = store.add(n).unwrap();
        assert_eq!(SessionStore::open(&file).unwrap().list()[0].tunnels, added.tunnels);
        std::fs::write(&file, r#"{"sessions":[{"id":"1","name":"eski","host":"h","port":22,"user":"u","folder":null,"auth":{"type":"password"}}]}"#).unwrap();
        let old = SessionStore::open(&file).unwrap();
        assert!(old.list()[0].tunnels.is_empty());
    }

    #[test]
    fn invalid_tunnels_are_rejected_on_add_and_update() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        let mut bad = new("a", "h");
        bad.tunnels = vec![crate::tunnel::TunnelSpec::Dynamic { listen_port: 0 }];
        assert!(matches!(store.add(bad), Err(StoreError::Invalid(_))));
        let mut s = store.add(new("a", "h")).unwrap();
        s.tunnels = vec![crate::tunnel::TunnelSpec::Local { listen_port: 80, dest_host: "".into(), dest_port: 1 }];
        assert!(matches!(store.update(s), Err(StoreError::Invalid(_))));
    }

    #[test]
    fn a_jump_host_must_exist_and_cannot_form_a_loop() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        let mut dangling = new("a", "h");
        dangling.jump = Some("yok".into());
        assert!(matches!(store.add(dangling), Err(StoreError::Invalid(_))));
        let bastion = store.add(new("bastion", "b")).unwrap();
        let mut inner = new("inner", "i");
        inner.jump = Some(bastion.id.clone());
        let inner = store.add(inner).unwrap();
        let mut selfish = inner.clone();
        selfish.jump = Some(selfish.id.clone());
        assert!(matches!(store.update(selfish), Err(StoreError::Invalid(_))));
        let mut looped = bastion.clone();
        looped.jump = Some(inner.id.clone());
        assert!(matches!(store.update(looped), Err(StoreError::Invalid(_))));
    }

    #[test]
    fn jump_chain_lists_hops_in_connection_order() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("s.json")).unwrap();
        let a = store.add(new("a", "ha")).unwrap();
        let mut nb = new("b", "hb");
        nb.jump = Some(a.id.clone());
        let b = store.add(nb).unwrap();
        let mut nc = new("c", "hc");
        nc.jump = Some(b.id.clone());
        let c = store.add(nc).unwrap();
        let names: Vec<&str> = store.jump_chain(&c.id).unwrap().iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
        assert_eq!(store.jump_chain(&a.id).unwrap().len(), 1);
        assert!(store.jump_chain("yok").is_none());
    }

    #[test]
    fn removing_a_session_clears_the_jump_of_those_that_used_it() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("s.json");
        let mut store = SessionStore::open(&file).unwrap();
        let bastion = store.add(new("bastion", "b")).unwrap();
        let mut inner = new("inner", "i");
        inner.jump = Some(bastion.id.clone());
        let inner = store.add(inner).unwrap();
        store.remove(&bastion.id).unwrap();
        assert_eq!(SessionStore::open(&file).unwrap().list().iter().find(|s| s.id == inner.id).unwrap().jump, None);
    }

    #[test]
    fn export_contains_sessions_but_never_passwords_and_can_be_read_back() {
        let dir = tempdir().unwrap();
        let mut store = SessionStore::open(&dir.path().join("a.json")).unwrap();
        store.add(new("Prod", "10.0.0.1")).unwrap();
        let text = store.export_json();
        assert!(text.contains("Prod"));
        assert!(!text.to_lowercase().contains("\"password\":"));
        let parsed = parse_export(&text).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "Prod");
    }

    #[test]
    fn parse_export_rejects_garbage_and_unknown_versions() {
        assert!(parse_export("{bozuk").is_err());
        assert!(parse_export(r#"{"version":99,"sessions":[]}"#).is_err());
        assert!(parse_export(r#"{"sessions":[]}"#).is_err());
        assert_eq!(parse_export(r#"{"version":1,"sessions":[]}"#).unwrap().len(), 0);
    }

    #[test]
    fn import_adds_new_sessions_skips_duplicates_and_remaps_jump_hosts() {
        let dir = tempdir().unwrap();
        let mut source = SessionStore::open(&dir.path().join("src.json")).unwrap();
        let bastion = source.add(new("Bastion", "b.example.com")).unwrap();
        let mut inner = new("Inner", "10.1.1.1");
        inner.jump = Some(bastion.id.clone());
        source.add(inner).unwrap();
        source.add(new("Eski", "dup.example.com")).unwrap();
        let exported = parse_export(&source.export_json()).unwrap();

        let mut target = SessionStore::open(&dir.path().join("dst.json")).unwrap();
        target.add(new("Zaten var", "dup.example.com")).unwrap();
        let report = target.import(exported).unwrap();
        assert_eq!((report.added, report.skipped), (2, 1));
        let inner = target.list().iter().find(|s| s.name == "Inner").unwrap();
        let bastion = target.list().iter().find(|s| s.name == "Bastion").unwrap();
        assert_eq!(inner.jump.as_deref(), Some(bastion.id.as_str()));
        assert_ne!(bastion.id, source.list().iter().find(|s| s.name == "Bastion").unwrap().id, "ids must be regenerated");
        assert_eq!(target.list().len(), 3);
    }

    #[test]
    fn import_drops_jump_references_that_point_outside_the_file() {
        let dir = tempdir().unwrap();
        let mut target = SessionStore::open(&dir.path().join("dst.json")).unwrap();
        let orphan = Session { id: "x".into(), name: "Yetim".into(), host: "h".into(), port: 22, user: "u".into(), folder: None, auth: Auth::Password, tunnels: vec![], jump: Some("yok".into()) };
        let report = target.import(vec![orphan]).unwrap();
        assert_eq!(report.added, 1);
        assert_eq!(target.list()[0].jump, None);
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
