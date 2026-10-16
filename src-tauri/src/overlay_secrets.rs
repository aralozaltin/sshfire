use std::sync::Arc;
use vcore::secrets::{MemorySecrets, Secret, SecretError, SecretStore};

/// Parolaları uygulama açık kaldığı sürece bellekte (önbellekte) tutar; gerçek anahtar deposuna
/// (macOS Keychain) yalnızca bir parola ilk kez gerektiğinde dokunur. Böylece her bağlantıda
/// işletim sisteminin yeniden izin/parola sormasının önüne geçilir.
pub struct OverlaySecrets {
    base: Arc<dyn SecretStore>,
    cache: Arc<MemorySecrets>,
}

impl OverlaySecrets {
    pub fn new(base: Arc<dyn SecretStore>, cache: Arc<MemorySecrets>) -> OverlaySecrets {
        OverlaySecrets { base, cache }
    }

    /// Parola önbellekte yoksa gerçek depodan **bir kez** okuyup önbelleğe alır. Bulunduysa `true`.
    pub fn load_once(&self, account: &str) -> Result<bool, SecretError> {
        if self.cache.get(account)?.is_some() {
            return Ok(true);
        }
        match self.base.get(account)? {
            Some(secret) => {
                self.cache.set(account, &secret)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    /// Kullanıcının bağlantı sırasında girdiği (Keychain'e kaydedilmeyen) parolayı oturum boyunca saklar.
    pub fn remember_in_memory(&self, account: &str, secret: &Secret) {
        let _ = self.cache.set(account, secret);
    }

    /// Yanlış çıkan parolayı önbellekten atar ki bir sonraki denemede yeniden sorulsun/okunsun.
    pub fn forget(&self, account: &str) {
        let _ = self.cache.delete(account);
    }
}

impl SecretStore for OverlaySecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.base.set(account, secret)?;
        self.cache.set(account, secret)
    }
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        match self.cache.get(account)? {
            Some(s) => Ok(Some(s)),
            None => self.base.get(account),
        }
    }
    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.base.delete(account)?;
        self.cache.delete(account)
    }
}

#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};

/// Testlerde gerçek depoya kaç kez dokunulduğunu sayar.
#[cfg(test)]
pub struct CountingSecrets {
    inner: MemorySecrets,
    pub reads: AtomicUsize,
}

#[cfg(test)]
impl CountingSecrets {
    pub fn new() -> CountingSecrets {
        CountingSecrets { inner: MemorySecrets::default(), reads: AtomicUsize::new(0) }
    }
    pub fn reads(&self) -> usize {
        self.reads.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
impl SecretStore for CountingSecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.inner.set(account, secret)
    }
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        self.inner.get(account)
    }
    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.inner.delete(account)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with(account: &str, pw: &str) -> Arc<CountingSecrets> {
        let s = Arc::new(CountingSecrets::new());
        s.set(account, &Secret::new(pw)).unwrap();
        s
    }

    fn overlay(base: &Arc<CountingSecrets>) -> OverlaySecrets {
        OverlaySecrets::new(base.clone(), Arc::new(MemorySecrets::default()))
    }

    #[test]
    fn the_real_store_is_read_once_no_matter_how_often_the_password_is_needed() {
        let base = store_with("a", "kalici");
        let o = overlay(&base);
        assert!(o.load_once("a").unwrap());
        assert!(o.load_once("a").unwrap());
        for _ in 0..3 {
            assert_eq!(o.get("a").unwrap().unwrap().expose(), "kalici");
        }
        assert_eq!(base.reads(), 1, "Keychain must be touched only once per password");
    }

    #[test]
    fn the_cache_is_shared_between_connections() {
        let base = store_with("a", "kalici");
        let cache = Arc::new(MemorySecrets::default());
        OverlaySecrets::new(base.clone(), cache.clone()).load_once("a").unwrap();
        let second = OverlaySecrets::new(base.clone(), cache);
        assert!(second.load_once("a").unwrap());
        assert_eq!(base.reads(), 1);
    }

    #[test]
    fn a_missing_password_is_reported_and_not_cached() {
        let base = store_with("a", "x");
        let o = overlay(&base);
        assert!(!o.load_once("yok").unwrap());
        assert!(o.get("yok").unwrap().is_none());
    }

    #[test]
    fn a_password_typed_for_this_session_is_kept_in_memory_only() {
        let base = store_with("a", "kalici");
        let o = overlay(&base);
        o.remember_in_memory("b", &Secret::new("gecici"));
        assert!(o.load_once("b").unwrap());
        assert_eq!(o.get("b").unwrap().unwrap().expose(), "gecici");
        assert!(base.get("b").unwrap().is_none(), "must never reach the real store");
    }

    #[test]
    fn forgetting_a_wrong_password_makes_the_next_load_read_the_real_store_again() {
        let base = store_with("a", "kalici");
        let o = overlay(&base);
        o.load_once("a").unwrap();
        o.forget("a");
        o.load_once("a").unwrap();
        assert_eq!(base.reads(), 2);
    }

    #[test]
    fn set_updates_both_stores_and_delete_clears_both() {
        let base = store_with("a", "eski");
        let o = overlay(&base);
        o.load_once("a").unwrap();
        o.set("a", &Secret::new("yeni")).unwrap();
        assert_eq!(o.get("a").unwrap().unwrap().expose(), "yeni");
        assert_eq!(base.inner.get("a").unwrap().unwrap().expose(), "yeni");
        o.delete("a").unwrap();
        assert!(o.get("a").unwrap().is_none());
        assert!(base.inner.get("a").unwrap().is_none());
    }

    struct Denied;
    impl SecretStore for Denied {
        fn set(&self, _: &str, _: &Secret) -> Result<(), SecretError> {
            Err(SecretError::Denied)
        }
        fn get(&self, _: &str) -> Result<Option<Secret>, SecretError> {
            Err(SecretError::Denied)
        }
        fn delete(&self, _: &str) -> Result<(), SecretError> {
            Err(SecretError::Denied)
        }
    }

    #[test]
    fn a_denied_keychain_is_an_error_and_caches_nothing() {
        let o = OverlaySecrets::new(Arc::new(Denied), Arc::new(MemorySecrets::default()));
        assert_eq!(o.load_once("a"), Err(SecretError::Denied));
        o.remember_in_memory("a", &Secret::new("elle girilen"));
        assert!(o.load_once("a").unwrap(), "a typed password still works when the keychain is denied");
    }
}
