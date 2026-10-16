use serde::Serialize;
use vcore::sshconfig::{parse, SshHost};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SshConfigImport {
    pub hosts: Vec<SshHost>,
    pub default_user: String,
}

/// `~` ya da `~/…` ile başlayan yolu ev dizinine açar; başka yollara dokunmaz.
pub fn expand_tilde(path: &str, home: &str) -> String {
    let home = home.trim_end_matches('/');
    if path == "~" {
        home.to_string()
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else {
        path.to_string()
    }
}

/// Dosya metninden içe aktarılacak sunucuları çıkarır (kimlik dosyası yolları açılmış olarak).
pub fn from_config_text(text: &str, home: &str, default_user: &str) -> SshConfigImport {
    let hosts = parse(text)
        .into_iter()
        .map(|mut h| {
            h.identity_file = h.identity_file.map(|p| expand_tilde(&p, home));
            h
        })
        .collect();
    SshConfigImport { hosts, default_user: default_user.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_is_expanded_only_at_the_start() {
        assert_eq!(expand_tilde("~/.ssh/id", "/Users/u"), "/Users/u/.ssh/id");
        assert_eq!(expand_tilde("~", "/Users/u"), "/Users/u");
        assert_eq!(expand_tilde("/etc/key", "/Users/u"), "/etc/key");
        assert_eq!(expand_tilde("a~b", "/Users/u"), "a~b");
        assert_eq!(expand_tilde("~/x", "/Users/u/"), "/Users/u/x");
    }

    #[test]
    fn identity_files_are_expanded_and_the_default_user_is_reported() {
        let r = from_config_text("Host a\n  HostName h\n  IdentityFile ~/.ssh/k\n", "/Users/u", "u");
        assert_eq!(r.default_user, "u");
        assert_eq!(r.hosts[0].identity_file.as_deref(), Some("/Users/u/.ssh/k"));
    }

    #[test]
    fn empty_config_gives_no_hosts() {
        assert!(from_config_text("", "/h", "u").hosts.is_empty());
    }
}
