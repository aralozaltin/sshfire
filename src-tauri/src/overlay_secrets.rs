use std::sync::Arc;
use vcore::secrets::{MemorySecrets, Secret, SecretError, SecretStore};

/// Bu bağlantı için bellekte tutulan (Keychain'e yazılmayan) parolayı önceler; yoksa gerçek depoya düşer.
pub struct OverlaySecrets {
    base: Arc<dyn SecretStore>,
    temp: MemorySecrets,
}

impl OverlaySecrets {
    pub fn new(base: Arc<dyn SecretStore>) -> OverlaySecrets {
        OverlaySecrets { base, temp: MemorySecrets::default() }
    }
    pub fn remember_for_this_connection(&self, account: &str, secret: &Secret) {
        let _ = self.temp.set(account, secret);
    }
}

impl SecretStore for OverlaySecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.base.set(account, secret)
    }
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        match self.temp.get(account)? {
            Some(s) => Ok(Some(s)),
            None => self.base.get(account),
        }
    }
    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.base.delete(account)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_with(account: &str, pw: &str) -> Arc<dyn SecretStore> {
        let m = MemorySecrets::default();
        m.set(account, &Secret::new(pw)).unwrap();
        Arc::new(m)
    }

    #[test]
    fn falls_back_to_the_real_store_when_nothing_is_temporary() {
        let o = OverlaySecrets::new(base_with("a", "kalici"));
        assert_eq!(o.get("a").unwrap().unwrap().expose(), "kalici");
        assert!(o.get("yok").unwrap().is_none());
    }

    #[test]
    fn a_temporary_password_wins_and_never_reaches_the_real_store() {
        let base = base_with("a", "kalici");
        let o = OverlaySecrets::new(base.clone());
        o.remember_for_this_connection("a", &Secret::new("gecici"));
        assert_eq!(o.get("a").unwrap().unwrap().expose(), "gecici");
        assert_eq!(base.get("a").unwrap().unwrap().expose(), "kalici");
    }

    #[test]
    fn set_and_delete_go_to_the_real_store() {
        let base: Arc<dyn SecretStore> = Arc::new(MemorySecrets::default());
        let o = OverlaySecrets::new(base.clone());
        o.set("a", &Secret::new("x")).unwrap();
        assert_eq!(base.get("a").unwrap().unwrap().expose(), "x");
        o.delete("a").unwrap();
        assert!(base.get("a").unwrap().is_none());
    }
}
