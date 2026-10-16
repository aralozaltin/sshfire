use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, PartialEq)]
pub struct Secret(String);

impl Secret {
    pub fn new(value: impl Into<String>) -> Secret {
        Secret(value.into())
    }
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("***")
    }
}

impl std::fmt::Display for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("***")
    }
}

#[derive(Debug, PartialEq)]
pub enum SecretError {
    Unavailable(String),
    Denied,
    Other(String),
}

pub trait SecretStore: Send + Sync {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError>;
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError>;
    fn delete(&self, account: &str) -> Result<(), SecretError>;
}

#[derive(Default)]
pub struct MemorySecrets {
    items: Mutex<HashMap<String, Secret>>,
}

impl SecretStore for MemorySecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.items.lock().unwrap().insert(account.to_string(), secret.clone());
        Ok(())
    }
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        Ok(self.items.lock().unwrap().get(account).cloned())
    }
    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.items.lock().unwrap().remove(account);
        Ok(())
    }
}

/// Tüm parolaları tek bir kayıtta (`vault`) JSON olarak tutar. İşletim sistemi anahtar deposu her kayıt
/// için ayrı izin sorduğundan, sunucu sayısı kadar soru yerine uygulama başına en fazla bir okuma olur.
/// `legacy`: eski sürümün sunucu başına kayıtları; ilk kullanımda okunup kasaya taşınır.
pub struct VaultSecrets {
    store: Arc<dyn SecretStore>,
    legacy: Option<Arc<dyn SecretStore>>,
    cache: Mutex<Option<HashMap<String, String>>>,
}

const VAULT_ACCOUNT: &str = "vault";

impl VaultSecrets {
    pub fn new(store: Arc<dyn SecretStore>, legacy: Option<Arc<dyn SecretStore>>) -> VaultSecrets {
        VaultSecrets { store, legacy, cache: Mutex::new(None) }
    }

    fn with_map<R>(&self, f: impl FnOnce(&mut HashMap<String, String>) -> R) -> Result<R, SecretError> {
        let mut guard = self.cache.lock().unwrap();
        if guard.is_none() {
            let loaded = match self.store.get(VAULT_ACCOUNT)? {
                Some(s) => serde_json::from_str::<HashMap<String, String>>(s.expose())
                    .map_err(|_| SecretError::Other("password vault is unreadable".into()))?,
                None => HashMap::new(),
            };
            *guard = Some(loaded);
        }
        Ok(f(guard.as_mut().expect("loaded above")))
    }

    fn persist(&self) -> Result<(), SecretError> {
        let json = {
            let guard = self.cache.lock().unwrap();
            serde_json::to_string(guard.as_ref().expect("persist after load")).expect("map serializes")
        };
        self.store.set(VAULT_ACCOUNT, &Secret::new(json))
    }
}

impl SecretStore for VaultSecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        self.with_map(|m| {
            m.insert(account.to_string(), secret.expose().to_string());
        })?;
        self.persist()
    }

    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        if let Some(found) = self.with_map(|m| m.get(account).cloned())? {
            return Ok(Some(Secret::new(found)));
        }
        let Some(legacy) = &self.legacy else { return Ok(None) };
        match legacy.get(account)? {
            Some(old) => {
                self.with_map(|m| {
                    m.insert(account.to_string(), old.expose().to_string());
                })?;
                self.persist()?;
                Ok(Some(old))
            }
            None => Ok(None),
        }
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        let removed = self.with_map(|m| m.remove(account).is_some())?;
        if removed {
            self.persist()?;
        }
        if let Some(legacy) = &self.legacy {
            let _ = legacy.delete(account);
        }
        Ok(())
    }
}

pub struct KeyringSecrets {
    service: String,
}

impl KeyringSecrets {
    pub fn new(service: impl Into<String>) -> KeyringSecrets {
        KeyringSecrets { service: service.into() }
    }
}

fn map_keyring_error(e: &keyring::Error) -> SecretError {
    match e {
        keyring::Error::NoDefaultStore => SecretError::Unavailable("keyring could not be initialised".into()),
        keyring::Error::NoStorageAccess(_) => SecretError::Denied,
        keyring::Error::PlatformFailure(_) => SecretError::Unavailable("keyring platform failure".into()),
        // BadEncoding/BadDataFormat taşıdıkları baytları içerir; asla mesaja katılmaz.
        _ => SecretError::Other("keyring operation failed".into()),
    }
}

impl SecretStore for KeyringSecrets {
    fn set(&self, account: &str, secret: &Secret) -> Result<(), SecretError> {
        let entry = keyring::Entry::new(&self.service, account).map_err(|e| map_keyring_error(&e))?;
        entry.set_password(secret.expose()).map_err(|e| map_keyring_error(&e))
    }
    fn get(&self, account: &str) -> Result<Option<Secret>, SecretError> {
        let entry = keyring::Entry::new(&self.service, account).map_err(|e| map_keyring_error(&e))?;
        match entry.get_password() {
            Ok(v) => Ok(Some(Secret::new(v))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(map_keyring_error(&e)),
        }
    }
    fn delete(&self, account: &str) -> Result<(), SecretError> {
        let entry = keyring::Entry::new(&self.service, account).map_err(|e| map_keyring_error(&e))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(map_keyring_error(&e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_debug_never_prints_value() {
        let s = Secret::new("hunter2");
        assert!(!format!("{s:?}").contains("hunter2"));
        assert!(!format!("{s}").contains("hunter2"));
        assert!(!format!("{:?}", Some(s)).contains("hunter2"));
    }

    #[test]
    fn memory_store_set_get_delete() {
        let store = MemorySecrets::default();
        store.set("a", &Secret::new("pw")).unwrap();
        assert_eq!(store.get("a").unwrap().unwrap().expose(), "pw");
        store.delete("a").unwrap();
        assert!(store.get("a").unwrap().is_none());
    }

    #[test]
    fn get_missing_returns_none() {
        let store = MemorySecrets::default();
        assert_eq!(store.get("yok").unwrap(), None);
    }

    #[test]
    fn keyring_errors_never_carry_secret_bytes() {
        let leaky = keyring::Error::BadEncoding(b"hunter2".to_vec());
        let mapped = map_keyring_error(&leaky);
        assert!(!format!("{mapped:?}").contains("hunter2"));
        let leaky = keyring::Error::BadDataFormat(b"hunter2".to_vec(), "x".into());
        assert!(!format!("{:?}", map_keyring_error(&leaky)).contains("hunter2"));
    }

    #[test]
    fn keyring_access_problems_map_to_denied_and_unavailable() {
        assert_eq!(map_keyring_error(&keyring::Error::NoDefaultStore), SecretError::Unavailable("keyring could not be initialised".into()));
        let denied = keyring::Error::NoStorageAccess("kilitli".into());
        assert_eq!(map_keyring_error(&denied), SecretError::Denied);
    }

    struct Counting {
        inner: MemorySecrets,
        gets: std::sync::atomic::AtomicUsize,
        sets: std::sync::atomic::AtomicUsize,
    }
    impl Counting {
        fn new() -> Arc<Counting> {
            Arc::new(Counting { inner: MemorySecrets::default(), gets: 0.into(), sets: 0.into() })
        }
        fn gets(&self) -> usize {
            self.gets.load(std::sync::atomic::Ordering::SeqCst)
        }
        fn sets(&self) -> usize {
            self.sets.load(std::sync::atomic::Ordering::SeqCst)
        }
    }
    impl SecretStore for Counting {
        fn set(&self, a: &str, s: &Secret) -> Result<(), SecretError> {
            self.sets.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.inner.set(a, s)
        }
        fn get(&self, a: &str) -> Result<Option<Secret>, SecretError> {
            self.gets.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.inner.get(a)
        }
        fn delete(&self, a: &str) -> Result<(), SecretError> {
            self.inner.delete(a)
        }
    }

    #[test]
    fn the_vault_touches_the_real_store_once_for_any_number_of_passwords() {
        let backing = Counting::new();
        let vault = VaultSecrets::new(backing.clone(), None);
        vault.set("a", &Secret::new("1")).unwrap();
        vault.set("b", &Secret::new("2")).unwrap();
        let reopened = VaultSecrets::new(backing.clone(), None);
        let reads_before = backing.gets();
        for _ in 0..5 {
            assert_eq!(reopened.get("a").unwrap().unwrap().expose(), "1");
            assert_eq!(reopened.get("b").unwrap().unwrap().expose(), "2");
        }
        assert_eq!(backing.gets() - reads_before, 1, "one read of the single vault entry");
    }

    #[test]
    fn passwords_survive_a_restart_through_the_single_entry() {
        let backing = Counting::new();
        VaultSecrets::new(backing.clone(), None).set("a", &Secret::new("gizli")).unwrap();
        assert_eq!(VaultSecrets::new(backing, None).get("a").unwrap().unwrap().expose(), "gizli");
    }

    #[test]
    fn a_missing_password_is_none_and_delete_of_a_missing_one_is_ok() {
        let vault = VaultSecrets::new(Counting::new(), None);
        assert!(vault.get("yok").unwrap().is_none());
        assert_eq!(vault.delete("yok"), Ok(()));
    }

    #[test]
    fn old_per_server_entries_are_migrated_into_the_vault_on_first_use() {
        let backing = Counting::new();
        let legacy = Counting::new();
        legacy.set("eski", &Secret::new("eski-parola")).unwrap();
        let vault = VaultSecrets::new(backing.clone(), Some(legacy.clone()));
        assert_eq!(vault.get("eski").unwrap().unwrap().expose(), "eski-parola");
        assert_eq!(legacy.gets(), 1);
        let again = VaultSecrets::new(backing, Some(legacy.clone()));
        assert_eq!(again.get("eski").unwrap().unwrap().expose(), "eski-parola");
        assert_eq!(legacy.gets(), 1, "the legacy entry is read only once, then the vault answers");
    }

    #[test]
    fn deleting_removes_the_vault_entry_and_the_legacy_one_so_it_cannot_come_back() {
        let backing = Counting::new();
        let legacy = Counting::new();
        legacy.set("a", &Secret::new("x")).unwrap();
        let vault = VaultSecrets::new(backing, Some(legacy.clone()));
        vault.get("a").unwrap();
        vault.delete("a").unwrap();
        assert!(vault.get("a").unwrap().is_none());
        assert!(legacy.inner.get("a").unwrap().is_none());
    }

    #[test]
    fn an_unreadable_vault_is_an_error_and_is_never_overwritten() {
        let backing = Counting::new();
        backing.set("vault", &Secret::new("{bozuk")).unwrap();
        let vault = VaultSecrets::new(backing.clone(), None);
        assert!(vault.get("a").is_err());
        assert!(vault.set("a", &Secret::new("x")).is_err());
        assert_eq!(backing.inner.get("vault").unwrap().unwrap().expose(), "{bozuk");
        assert_eq!(backing.sets(), 1, "only the test's own setup wrote to it");
    }

    #[test]
    fn delete_missing_is_ok() {
        let store = MemorySecrets::default();
        assert_eq!(store.delete("yok"), Ok(()));
    }

    #[test]
    #[ignore = "gerçek anahtar deposuna dokunur; elle: cargo test -p vcore -- --ignored"]
    fn real_keyring_roundtrip() {
        let store = KeyringSecrets::new("ssh-istemci-test");
        store.set("roundtrip", &Secret::new("pw")).unwrap();
        assert_eq!(store.get("roundtrip").unwrap().unwrap().expose(), "pw");
        store.delete("roundtrip").unwrap();
        assert!(store.get("roundtrip").unwrap().is_none());
    }

    #[test]
    #[ignore = "gerçek anahtar deposuna dokunur; elle: cargo test -p vcore -- --ignored"]
    fn real_vault_roundtrip_with_two_passwords() {
        let service = "ssh-istemci-test-vault";
        let backing: Arc<dyn SecretStore> = Arc::new(KeyringSecrets::new(service));
        let vault = VaultSecrets::new(backing.clone(), None);
        vault.set("a", &Secret::new("bir")).unwrap();
        vault.set("b", &Secret::new("iki")).unwrap();
        let reopened = VaultSecrets::new(backing.clone(), None);
        assert_eq!(reopened.get("a").unwrap().unwrap().expose(), "bir");
        assert_eq!(reopened.get("b").unwrap().unwrap().expose(), "iki");
        reopened.delete("a").unwrap();
        reopened.delete("b").unwrap();
        backing.delete("vault").unwrap();
    }
}
