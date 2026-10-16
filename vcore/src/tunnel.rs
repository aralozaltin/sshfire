use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TunnelSpec {
    /// ssh -L: yerel porta gelen bağlantıyı sunucu üzerinden hedefe iletir.
    Local { listen_port: u16, dest_host: String, dest_port: u16 },
    /// ssh -D: yerel porta SOCKS5 vekil sunucusu açar.
    Dynamic { listen_port: u16 },
}

impl TunnelSpec {
    pub fn listen_port(&self) -> u16 {
        match self {
            TunnelSpec::Local { listen_port, .. } | TunnelSpec::Dynamic { listen_port } => *listen_port,
        }
    }

    /// Kullanıcıdan gelen tanımı doğrular (port 0 yalnızca testlerde kullanılır ve burada reddedilir).
    pub fn validate(&self) -> Result<(), String> {
        if self.listen_port() == 0 {
            return Err("listen port must be between 1 and 65535".into());
        }
        if let TunnelSpec::Local { dest_host, dest_port, .. } = self {
            if dest_host.trim().is_empty() {
                return Err("destination host is empty".into());
            }
            if *dest_port == 0 {
                return Err("destination port must be between 1 and 65535".into());
            }
        }
        Ok(())
    }
}

#[derive(Debug, PartialEq)]
pub enum SocksError {
    BadVersion,
    UnsupportedCommand,
    UnsupportedAddress,
}

/// SOCKS5 karşılama (`05 n yöntemler…`) tamamsa tükettiği bayt sayısını ve "kimlik doğrulamasız" yönteminin
/// sunulup sunulmadığını döndürür; eksikse `Ok(None)`.
pub fn parse_socks_greeting(buf: &[u8]) -> Result<Option<(usize, bool)>, SocksError> {
    let Some(&version) = buf.first() else { return Ok(None) };
    if version != 5 {
        return Err(SocksError::BadVersion);
    }
    let Some(&n) = buf.get(1) else { return Ok(None) };
    let total = 2 + n as usize;
    if buf.len() < total {
        return Ok(None);
    }
    Ok(Some((total, buf[2..total].contains(&0))))
}

/// SOCKS5 CONNECT isteğini çözer: `(tüketilen bayt, hedef adres, hedef port)`; eksikse `Ok(None)`.
pub fn parse_socks_request(buf: &[u8]) -> Result<Option<(usize, String, u16)>, SocksError> {
    if buf.is_empty() {
        return Ok(None);
    }
    if buf[0] != 5 {
        return Err(SocksError::BadVersion);
    }
    if buf.len() >= 2 && buf[1] != 1 {
        return Err(SocksError::UnsupportedCommand);
    }
    if buf.len() < 4 {
        return Ok(None);
    }
    let (addr, addr_end) = match buf[3] {
        1 => {
            if buf.len() < 8 {
                return Ok(None);
            }
            (format!("{}.{}.{}.{}", buf[4], buf[5], buf[6], buf[7]), 8)
        }
        3 => {
            let Some(&len) = buf.get(4) else { return Ok(None) };
            let end = 5 + len as usize;
            if buf.len() < end {
                return Ok(None);
            }
            (String::from_utf8_lossy(&buf[5..end]).into_owned(), end)
        }
        4 => {
            if buf.len() < 20 {
                return Ok(None);
            }
            let mut octets = [0u8; 16];
            octets.copy_from_slice(&buf[4..20]);
            (std::net::Ipv6Addr::from(octets).to_string(), 20)
        }
        _ => return Err(SocksError::UnsupportedAddress),
    };
    if buf.len() < addr_end + 2 {
        return Ok(None);
    }
    let port = u16::from_be_bytes([buf[addr_end], buf[addr_end + 1]]);
    Ok(Some((addr_end + 2, addr, port)))
}

#[derive(Debug, PartialEq)]
pub enum TunnelError {
    PortInUse,
    Invalid(String),
    Other(String),
}

impl std::fmt::Display for TunnelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TunnelError::PortInUse => write!(f, "port is already in use"),
            TunnelError::Invalid(m) => write!(f, "invalid tunnel: {m}"),
            TunnelError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for TunnelError {}

pub struct TunnelHandle {
    task: tokio::task::JoinHandle<()>,
    pub local_port: u16,
    pub connections: Arc<AtomicU64>,
}

impl TunnelHandle {
    pub(crate) fn new(task: tokio::task::JoinHandle<()>, local_port: u16, connections: Arc<AtomicU64>) -> TunnelHandle {
        TunnelHandle { task, local_port, connections }
    }

    pub fn stop(&self) {
        self.task.abort();
    }
}

impl Drop for TunnelHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_sane_tunnels_and_rejects_bad_ones() {
        assert!(TunnelSpec::Local { listen_port: 8080, dest_host: "db.internal".into(), dest_port: 5432 }.validate().is_ok());
        assert!(TunnelSpec::Dynamic { listen_port: 1080 }.validate().is_ok());
        assert!(TunnelSpec::Dynamic { listen_port: 0 }.validate().is_err());
        assert!(TunnelSpec::Local { listen_port: 8080, dest_host: "  ".into(), dest_port: 5432 }.validate().is_err());
        assert!(TunnelSpec::Local { listen_port: 8080, dest_host: "h".into(), dest_port: 0 }.validate().is_err());
    }

    #[test]
    fn greeting_is_parsed_when_complete_and_reports_no_auth_support() {
        assert_eq!(parse_socks_greeting(&[5, 1, 0]).unwrap(), Some((3, true)));
        assert_eq!(parse_socks_greeting(&[5, 2, 2, 0, 9]).unwrap(), Some((4, true)));
        assert_eq!(parse_socks_greeting(&[5, 1, 2]).unwrap(), Some((3, false)));
        assert_eq!(parse_socks_greeting(&[5]).unwrap(), None);
        assert_eq!(parse_socks_greeting(&[5, 3, 0]).unwrap(), None);
        assert_eq!(parse_socks_greeting(&[4, 1, 0]), Err(SocksError::BadVersion));
    }

    #[test]
    fn requests_with_ipv4_domain_and_ipv6_addresses_are_parsed() {
        assert_eq!(parse_socks_request(&[5, 1, 0, 1, 10, 0, 0, 7, 0x1f, 0x90]).unwrap(), Some((10, "10.0.0.7".into(), 8080)));
        let mut domain = vec![5, 1, 0, 3, 11];
        domain.extend_from_slice(b"example.com");
        domain.extend_from_slice(&[0x01, 0xbb]);
        assert_eq!(parse_socks_request(&domain).unwrap(), Some((domain.len(), "example.com".into(), 443)));
        let mut v6 = vec![5, 1, 0, 4];
        v6.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        v6.extend_from_slice(&[0, 22]);
        assert_eq!(parse_socks_request(&v6).unwrap(), Some((v6.len(), "::1".into(), 22)));
    }

    #[test]
    fn incomplete_requests_ask_for_more_and_bad_ones_are_rejected() {
        assert_eq!(parse_socks_request(&[5, 1, 0, 1, 10, 0]).unwrap(), None);
        assert_eq!(parse_socks_request(&[5, 1, 0, 3, 11, b'e']).unwrap(), None);
        assert_eq!(parse_socks_request(&[4, 1, 0, 1, 1, 1, 1, 1, 0, 80]), Err(SocksError::BadVersion));
        assert_eq!(parse_socks_request(&[5, 2, 0, 1, 1, 1, 1, 1, 0, 80]), Err(SocksError::UnsupportedCommand));
        assert_eq!(parse_socks_request(&[5, 1, 0, 9, 1, 1, 1, 1, 0, 80]), Err(SocksError::UnsupportedAddress));
    }
}
