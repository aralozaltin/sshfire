use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHost {
    pub alias: String,
    pub host_name: String,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
}

/// `~/.ssh/config` metnini çözer: her somut `Host` takma adı için bir kayıt döner.
/// ssh'ın kuralı gibi her seçenekte ilk eşleşen değer kazanır; `Host *` ve desenli bloklar varsayılan sağlar.
pub fn parse(text: &str) -> Vec<SshHost> {
    let blocks = blocks(text);
    let mut aliases: Vec<String> = Vec::new();
    for b in &blocks {
        if let Some(patterns) = &b.patterns {
            for p in patterns {
                if !p.starts_with('!') && !p.contains(['*', '?']) && !aliases.contains(p) {
                    aliases.push(p.clone());
                }
            }
        }
    }
    aliases
        .into_iter()
        .map(|alias| {
            let mut host = SshHost { host_name: alias.clone(), alias: alias.clone(), user: None, port: None, identity_file: None, proxy_jump: None };
            let mut host_name: Option<String> = None;
            for b in blocks.iter().filter(|b| b.applies_to(&alias)) {
                for (key, value) in &b.options {
                    match key.as_str() {
                        "hostname" if host_name.is_none() => host_name = Some(value.clone()),
                        "user" if host.user.is_none() => host.user = Some(value.clone()),
                        "port" if host.port.is_none() => host.port = value.parse::<u16>().ok().filter(|p| *p > 0),
                        "identityfile" if host.identity_file.is_none() => host.identity_file = Some(value.clone()),
                        "proxyjump" if host.proxy_jump.is_none() => host.proxy_jump = Some(value.clone()),
                        _ => {}
                    }
                }
            }
            if let Some(h) = host_name {
                host.host_name = h;
            }
            host
        })
        .collect()
}

struct Block {
    /// `None`: dosya başındaki genel seçenekler (her sunucuya uygulanır). `Some(vec![])`: yok sayılan Match bloğu.
    patterns: Option<Vec<String>>,
    is_match: bool,
    options: Vec<(String, String)>,
}

impl Block {
    fn applies_to(&self, alias: &str) -> bool {
        if self.is_match {
            return false;
        }
        let Some(patterns) = &self.patterns else { return true };
        let mut matched = false;
        for p in patterns {
            if let Some(neg) = p.strip_prefix('!') {
                if glob(neg, alias) {
                    return false;
                }
            } else if glob(p, alias) {
                matched = true;
            }
        }
        matched
    }
}

fn glob(pattern: &str, text: &str) -> bool {
    fn go(p: &[char], t: &[char]) -> bool {
        match (p.first(), t.first()) {
            (None, None) => true,
            (Some('*'), _) => go(&p[1..], t) || (!t.is_empty() && go(p, &t[1..])),
            (Some('?'), Some(_)) => go(&p[1..], &t[1..]),
            (Some(a), Some(b)) if a == b => go(&p[1..], &t[1..]),
            _ => false,
        }
    }
    go(&pattern.chars().collect::<Vec<_>>(), &text.chars().collect::<Vec<_>>())
}

fn unquote(v: &str) -> String {
    let v = v.trim();
    v.strip_prefix('"').and_then(|x| x.strip_suffix('"')).unwrap_or(v).to_string()
}

fn blocks(text: &str) -> Vec<Block> {
    let mut out = vec![Block { patterns: None, is_match: false, options: Vec::new() }];
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let split = line.find(|c: char| c.is_whitespace() || c == '=');
        let Some(i) = split else { continue };
        let key = line[..i].to_lowercase();
        let value = line[i..].trim_start_matches(|c: char| c.is_whitespace() || c == '=').trim();
        if value.is_empty() {
            continue;
        }
        match key.as_str() {
            "host" => out.push(Block {
                patterns: Some(value.split_whitespace().map(unquote).collect()),
                is_match: false,
                options: Vec::new(),
            }),
            "match" => out.push(Block { patterns: Some(Vec::new()), is_match: true, options: Vec::new() }),
            _ => {
                if let Some(b) = out.last_mut() {
                    b.options.push((key, unquote(value)));
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one(text: &str) -> SshHost {
        let hosts = parse(text);
        assert_eq!(hosts.len(), 1, "{hosts:?}");
        hosts.into_iter().next().unwrap()
    }

    #[test]
    fn a_simple_block_gives_all_fields() {
        let h = one("Host prod\n  HostName 10.0.0.5\n  User deploy\n  Port 2222\n  IdentityFile ~/.ssh/prod_key\n  ProxyJump bastion\n");
        assert_eq!(h.alias, "prod");
        assert_eq!(h.host_name, "10.0.0.5");
        assert_eq!(h.user.as_deref(), Some("deploy"));
        assert_eq!(h.port, Some(2222));
        assert_eq!(h.identity_file.as_deref(), Some("~/.ssh/prod_key"));
        assert_eq!(h.proxy_jump.as_deref(), Some("bastion"));
    }

    #[test]
    fn host_name_defaults_to_the_alias() {
        assert_eq!(one("Host db1.example.com\n  User x\n").host_name, "db1.example.com");
    }

    #[test]
    fn several_aliases_on_one_line_become_several_hosts() {
        let hosts = parse("Host a b\n  User u\n");
        assert_eq!(hosts.iter().map(|h| h.alias.as_str()).collect::<Vec<_>>(), vec!["a", "b"]);
        assert!(hosts.iter().all(|h| h.user.as_deref() == Some("u")));
    }

    #[test]
    fn wildcard_blocks_are_not_hosts_but_supply_defaults() {
        let hosts = parse("Host web\n  HostName w.example\nHost *\n  User fallback\n  Port 2200\n");
        assert_eq!(hosts.len(), 1);
        assert_eq!(hosts[0].user.as_deref(), Some("fallback"));
        assert_eq!(hosts[0].port, Some(2200));
    }

    #[test]
    fn the_first_value_wins_like_ssh() {
        let h = one("Host a\n  User one\nHost *\n  User two\n");
        assert_eq!(h.user.as_deref(), Some("one"));
        let h = one("User global\nHost a\n  User block\n");
        assert_eq!(h.user.as_deref(), Some("global"));
    }

    #[test]
    fn glob_blocks_apply_to_matching_aliases_only() {
        let hosts = parse("Host web-1 db-1\n  HostName x\nHost web-*\n  User www\n");
        let web = hosts.iter().find(|h| h.alias == "web-1").unwrap();
        let db = hosts.iter().find(|h| h.alias == "db-1").unwrap();
        assert_eq!(web.user.as_deref(), Some("www"));
        assert_eq!(db.user, None);
    }

    #[test]
    fn negated_patterns_exclude_hosts() {
        let hosts = parse("Host a b\n  HostName x\nHost * !b\n  User u\n");
        assert_eq!(hosts.iter().find(|h| h.alias == "a").unwrap().user.as_deref(), Some("u"));
        assert_eq!(hosts.iter().find(|h| h.alias == "b").unwrap().user, None);
    }

    #[test]
    fn syntax_variants_are_understood() {
        let h = one("# yorum\n\nhost   Prod\n\tHOSTNAME=\"10.1.1.1\"\n  user = alice\n  Port=22\n");
        assert_eq!((h.alias.as_str(), h.host_name.as_str(), h.user.as_deref(), h.port), ("Prod", "10.1.1.1", Some("alice"), Some(22)));
    }

    #[test]
    fn match_blocks_do_not_leak_their_options() {
        let h = one("Host a\n  HostName x\nMatch host b\n  User leaked\n");
        assert_eq!(h.user, None);
    }

    #[test]
    fn an_invalid_port_is_ignored() {
        assert_eq!(one("Host a\n  Port abc\n").port, None);
        assert_eq!(one("Host a\n  Port 99999\n").port, None);
    }

    #[test]
    fn empty_or_garbage_input_gives_nothing() {
        assert!(parse("").is_empty());
        assert!(parse("sadece gürültü\n???\n").is_empty());
    }

    #[test]
    fn only_the_first_identity_file_is_kept() {
        assert_eq!(one("Host a\n  IdentityFile k1\n  IdentityFile k2\n").identity_file.as_deref(), Some("k1"));
    }
}
