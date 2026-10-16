use std::collections::HashMap;
use std::sync::Mutex;

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
}
