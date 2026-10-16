use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use vcore::sftp::CancelToken;

#[derive(Default)]
pub struct Registry {
    items: Mutex<HashMap<String, CancelToken>>,
}

impl Registry {
    pub fn start(&self) -> (String, CancelToken) {
        let id = uuid::Uuid::new_v4().to_string();
        let token = CancelToken::new();
        self.items.lock().unwrap().insert(id.clone(), token.clone());
        (id, token)
    }
    pub fn cancel(&self, id: &str) -> bool {
        match self.items.lock().unwrap().get(id) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }
    pub fn finish(&self, id: &str) {
        self.items.lock().unwrap().remove(id);
    }
    #[cfg(test)]
    pub fn active(&self) -> usize {
        self.items.lock().unwrap().len()
    }
}

/// İlerleme olaylarını saniyede en fazla ~10 ile sınırlar; bitiş olayı her zaman geçer.
pub struct ProgressGate {
    min_interval: Duration,
    last: Option<Instant>,
}

impl ProgressGate {
    pub fn new(min_interval: Duration) -> ProgressGate {
        ProgressGate { min_interval, last: None }
    }
    pub fn should_emit(&mut self, now: Instant, done: u64, total: u64) -> bool {
        let due = match self.last {
            None => true,
            Some(last) => now.duration_since(last) >= self.min_interval,
        };
        if due || done >= total {
            self.last = Some(now);
            return true;
        }
        false
    }
}

/// `dir/name` doluysa `name (2)`, `name (3)` … biçiminde boş bir yol bulur (uzantı korunur).
pub fn unique_local_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let dot = name.rfind('.').filter(|i| *i > 0);
    let (stem, ext) = match dot {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("an unused name exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_flips_the_token_and_reports_unknown_ids() {
        let reg = Registry::default();
        let (id, token) = reg.start();
        assert!(!token.is_cancelled());
        assert!(reg.cancel(&id));
        assert!(token.is_cancelled());
        assert!(!reg.cancel("yok"));
    }

    #[test]
    fn ids_are_unique_and_finish_removes_the_entry() {
        let reg = Registry::default();
        let (a, _) = reg.start();
        let (b, _) = reg.start();
        assert_ne!(a, b);
        assert_eq!(reg.active(), 2);
        reg.finish(&a);
        assert_eq!(reg.active(), 1);
        assert!(!reg.cancel(&a));
    }

    #[test]
    fn progress_is_throttled_but_completion_always_passes() {
        let mut gate = ProgressGate::new(Duration::from_millis(100));
        let t0 = Instant::now();
        assert!(gate.should_emit(t0, 1, 100), "first event passes");
        assert!(!gate.should_emit(t0 + Duration::from_millis(10), 2, 100));
        assert!(!gate.should_emit(t0 + Duration::from_millis(99), 3, 100));
        assert!(gate.should_emit(t0 + Duration::from_millis(100), 4, 100));
        assert!(gate.should_emit(t0 + Duration::from_millis(101), 100, 100), "completion is never dropped");
    }

    #[test]
    fn unique_local_path_numbers_existing_files_and_keeps_extension() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(unique_local_path(dir.path(), "a.txt"), dir.path().join("a.txt"));
        std::fs::write(dir.path().join("a.txt"), "x").unwrap();
        assert_eq!(unique_local_path(dir.path(), "a.txt"), dir.path().join("a (2).txt"));
        std::fs::write(dir.path().join("a (2).txt"), "x").unwrap();
        assert_eq!(unique_local_path(dir.path(), "a.txt"), dir.path().join("a (3).txt"));
        std::fs::create_dir(dir.path().join("folder")).unwrap();
        assert_eq!(unique_local_path(dir.path(), "folder"), dir.path().join("folder (2)"));
    }
}
