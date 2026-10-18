/// Linux'ta /proc/<pid>/stat içindeki `tty_nr` değeri: /dev/pts/N için (136 << 8) | N (N ≥ 256 ise üst bitler kaydırılır).
pub fn pts_tty_nr(index: u32) -> u64 {
    34816 + u64::from(index & 0xff) + (u64::from(index >> 8) << 20)
}

/// `ls /dev/pts` çıktısındaki sayısal (pty) girdileri döndürür; `ptmx` gibi olanları atar.
pub fn parse_pts_list(output: &str) -> Vec<u32> {
    output.lines().filter_map(|l| l.trim().parse::<u32>().ok()).collect()
}

/// `after` içinde olup `before` içinde olmayan pty numaraları.
pub fn new_ptys(before: &[u32], after: &[u32]) -> Vec<u32> {
    after.iter().copied().filter(|p| !before.contains(p)).collect()
}

/// Verilen pty'nin oturum liderinin (kabuk) çalışma dizinini yazdıran, sh uyumlu tek satırlık komut.
pub fn cwd_command(index: u32) -> String {
    // /proc/<pid>/stat: `pid (comm) state ppid pgrp session tty_nr ...`; `) ` sonrası 4. alan oturum, 5. alan tty_nr.
    format!(
        "n={}; for d in /proc/[0-9]*; do p=${{d#/proc/}}; read -r s < $d/stat 2>/dev/null || continue; r=${{s##*) }}; set -- $r; if [ \"$5\" = \"$n\" ] && [ \"$4\" = \"$p\" ]; then readlink $d/cwd 2>/dev/null && break; fi; done",
        pts_tty_nr(index)
    )
}

/// Sunucudaki bir terminal: Linux'ta `/dev/pts/N`, macOS/BSD'de `ps`'in verdiği ad (`ttys003`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ShellTty {
    Pts(u32),
    Named(String),
}

/// `ps -axo tty=` çıktısındaki gerçek terminal adları (`??` ve `-` gibi terminalsizleri atar), tekrarsız.
pub fn parse_ps_ttys(output: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in output.lines().map(str::trim) {
        if line.is_empty() || !line.chars().any(|c| c.is_ascii_alphanumeric()) || line.starts_with('?') {
            continue;
        }
        if !out.iter().any(|x| x == line) {
            out.push(line.to_string());
        }
    }
    out
}

/// `after` içinde olup `before` içinde olmayan terminaller.
pub fn new_ttys(before: &[ShellTty], after: &[ShellTty]) -> Vec<ShellTty> {
    after.iter().filter(|t| !before.contains(t)).cloned().collect()
}

/// macOS/BSD: terminaldeki en eski süreç (giriş kabuğu) ve onun çalışma dizini (`lsof`). Terminal adı
/// yalnızca harf, rakam ve `/` içeriyorsa komuta girer.
pub fn bsd_cwd_command(tty: &str) -> Option<String> {
    if tty.is_empty() || !tty.chars().all(|c| c.is_ascii_alphanumeric() || c == '/') {
        return None;
    }
    Some(format!(
        "p=$(ps -t {tty} -o pid= 2>/dev/null | sort -n | head -n1); [ -n \"$p\" ] && lsof -a -d cwd -p $p -Fn 2>/dev/null"
    ))
}

/// `lsof -Fn` çıktısındaki `n` alanı (dizin yolu).
pub fn parse_lsof_cwd(output: &str) -> Option<String> {
    output.lines().find_map(|l| l.strip_prefix('n')).filter(|p| !p.is_empty()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tty_nr_follows_the_linux_encoding() {
        assert_eq!(pts_tty_nr(0), 34816);
        assert_eq!(pts_tty_nr(3), 34819);
        assert_eq!(pts_tty_nr(255), 34816 + 255);
        assert_eq!(pts_tty_nr(256), 34816 + (1 << 20));
        assert_eq!(pts_tty_nr(257), 34816 + 1 + (1 << 20));
    }

    #[test]
    fn pts_list_keeps_only_numbers() {
        assert_eq!(parse_pts_list("0\n1\nptmx\n12\n"), vec![0, 1, 12]);
        assert_eq!(parse_pts_list(""), Vec::<u32>::new());
        assert_eq!(parse_pts_list("ptmx\n"), Vec::<u32>::new());
        assert_eq!(parse_pts_list(" 3 \r\n4\r\n"), vec![3, 4]);
    }

    #[test]
    fn new_ptys_are_the_difference() {
        assert_eq!(new_ptys(&[0, 1], &[0, 1, 2]), vec![2]);
        assert_eq!(new_ptys(&[0, 1], &[0, 1]), Vec::<u32>::new());
        assert_eq!(new_ptys(&[], &[4, 5]), vec![4, 5]);
    }

    #[test]
    fn command_embeds_only_the_computed_number() {
        let c = cwd_command(3);
        assert!(c.contains("34819"), "{c}");
        assert!(c.contains("/proc/"), "{c}");
        assert!(!c.contains(';') || c.contains("for "), "{c}");
    }

    #[test]
    fn ps_output_lists_each_real_terminal_once() {
        assert_eq!(parse_ps_ttys("??\nttys000\n ttys001 \nttys000\n-\n\n"), vec!["ttys000", "ttys001"]);
        assert_eq!(parse_ps_ttys("pts/3\n?\n"), vec!["pts/3"]);
        assert_eq!(parse_ps_ttys(""), Vec::<String>::new());
    }

    #[test]
    fn the_bsd_command_names_the_terminal_and_refuses_anything_odd() {
        let c = bsd_cwd_command("ttys003").unwrap();
        assert!(c.contains("ttys003") && c.contains("lsof"), "{c}");
        assert!(bsd_cwd_command("ttys003; rm -rf /").is_none());
        assert!(bsd_cwd_command("").is_none());
        assert!(bsd_cwd_command("$(id)").is_none());
    }

    #[test]
    fn lsof_field_output_yields_the_directory() {
        assert_eq!(parse_lsof_cwd("p123\nfcwd\nn/Users/me/my dir\n"), Some("/Users/me/my dir".to_string()));
        assert_eq!(parse_lsof_cwd("p123\n"), None);
        assert_eq!(parse_lsof_cwd(""), None);
    }
}
