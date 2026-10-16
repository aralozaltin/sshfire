use serde::Serialize;
use vcore::secrets::SecretError;
use vcore::sessions::StoreError;
use vcore::sftp::SftpError;
use vcore::ssh::SshError;
use vcore::tunnel::TunnelError;

#[derive(Debug, Serialize, PartialEq)]
pub struct AppError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<String>,
}

impl AppError {
    pub fn code(code: &'static str) -> AppError {
        AppError { code, detail: None, previous: None, current: None }
    }

    pub fn with_detail(code: &'static str, detail: impl Into<String>) -> AppError {
        AppError { code, detail: Some(detail.into()), previous: None, current: None }
    }
}

impl From<&SshError> for AppError {
    fn from(e: &SshError) -> AppError {
        match e {
            SshError::HostKeyRejected => AppError::code("host_key_rejected"),
            SshError::HostKeyChanged { previous, current } => AppError {
                code: "host_key_changed",
                detail: None,
                previous: Some(previous.clone()),
                current: Some(current.clone()),
            },
            SshError::AuthFailed => AppError::code("auth_failed"),
            SshError::Unreachable(m) => AppError::with_detail("unreachable", m.clone()),
            SshError::Secret(s) => AppError::from(s),
            SshError::Key(m) => AppError::with_detail("key_unreadable", m.clone()),
            SshError::Other(m) => AppError::with_detail("ssh_other", m.clone()),
        }
    }
}

impl From<&SecretError> for AppError {
    fn from(e: &SecretError) -> AppError {
        match e {
            SecretError::Denied => AppError::code("secret_denied"),
            SecretError::Unavailable(m) => AppError::with_detail("secret_unavailable", m.clone()),
            SecretError::Other(_) => AppError::code("secret_other"),
        }
    }
}

impl From<&SftpError> for AppError {
    fn from(e: &SftpError) -> AppError {
        match e {
            SftpError::NotFound => AppError::code("file_not_found"),
            SftpError::PermissionDenied => AppError::code("permission_denied"),
            SftpError::Exists => AppError::code("already_exists"),
            SftpError::Cancelled => AppError::code("cancelled"),
            SftpError::TooLarge => AppError::code("file_too_large"),
            SftpError::Other(m) => AppError::with_detail("sftp_other", m.clone()),
        }
    }
}

impl From<&TunnelError> for AppError {
    fn from(e: &TunnelError) -> AppError {
        match e {
            TunnelError::PortInUse => AppError::code("port_in_use"),
            TunnelError::Invalid(m) => AppError::with_detail("invalid_tunnel", m.clone()),
            TunnelError::Other(m) => AppError::with_detail("tunnel_other", m.clone()),
        }
    }
}

impl From<&StoreError> for AppError {
    fn from(e: &StoreError) -> AppError {
        match e {
            StoreError::Invalid(m) => AppError::with_detail("invalid_session", m.clone()),
            other => AppError::with_detail("store_error", other.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_errors_map_to_stable_codes() {
        assert_eq!(AppError::from(&SshError::HostKeyRejected).code, "host_key_rejected");
        assert_eq!(AppError::from(&SshError::AuthFailed).code, "auth_failed");
        let e = AppError::from(&SshError::Unreachable("timeout".into()));
        assert_eq!((e.code, e.detail.as_deref()), ("unreachable", Some("timeout")));
        let e = AppError::from(&SshError::Key("bad".into()));
        assert_eq!((e.code, e.detail.as_deref()), ("key_unreadable", Some("bad")));
    }

    #[test]
    fn changed_host_key_carries_both_fingerprints() {
        let e = AppError::from(&SshError::HostKeyChanged { previous: "SHA256:eski".into(), current: "SHA256:yeni".into() });
        assert_eq!(e.code, "host_key_changed");
        assert_eq!(e.previous.as_deref(), Some("SHA256:eski"));
        assert_eq!(e.current.as_deref(), Some("SHA256:yeni"));
    }

    #[test]
    fn secret_errors_map_without_leaking_values() {
        assert_eq!(AppError::from(&SecretError::Denied).code, "secret_denied");
        assert_eq!(AppError::from(&SecretError::Unavailable("x".into())).code, "secret_unavailable");
        assert_eq!(AppError::from(&SshError::Secret(SecretError::Denied)).code, "secret_denied");
    }

    #[test]
    fn store_errors_map_to_invalid_session_or_store_error() {
        let e = AppError::from(&StoreError::Invalid("host is empty".into()));
        assert_eq!((e.code, e.detail.as_deref()), ("invalid_session", Some("host is empty")));
        let e = AppError::from(&StoreError::Corrupt { backup: "/x.bak".into() });
        assert_eq!(e.code, "store_error");
    }

    #[test]
    fn sftp_errors_map_to_stable_codes() {
        assert_eq!(AppError::from(&SftpError::NotFound).code, "file_not_found");
        assert_eq!(AppError::from(&SftpError::PermissionDenied).code, "permission_denied");
        assert_eq!(AppError::from(&SftpError::Exists).code, "already_exists");
        assert_eq!(AppError::from(&SftpError::Cancelled).code, "cancelled");
        assert_eq!(AppError::from(&SftpError::TooLarge).code, "file_too_large");
        let e = AppError::from(&SftpError::Other("boom".into()));
        assert_eq!((e.code, e.detail.as_deref()), ("sftp_other", Some("boom")));
    }

    #[test]
    fn tunnel_errors_map_to_stable_codes() {
        assert_eq!(AppError::from(&TunnelError::PortInUse).code, "port_in_use");
        let e = AppError::from(&TunnelError::Invalid("x".into()));
        assert_eq!((e.code, e.detail.as_deref()), ("invalid_tunnel", Some("x")));
        assert_eq!(AppError::from(&TunnelError::Other("y".into())).code, "tunnel_other");
    }

    #[test]
    fn serializes_only_present_fields() {
        let json = serde_json::to_string(&AppError::code("auth_failed")).unwrap();
        assert_eq!(json, r#"{"code":"auth_failed"}"#);
        let json = serde_json::to_string(&AppError::with_detail("unreachable", "t")).unwrap();
        assert_eq!(json, r#"{"code":"unreachable","detail":"t"}"#);
    }
}
