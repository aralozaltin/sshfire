use crate::shellquote::shell_quote;

/// `find` desenindeki özel karakterleri (`* ? [ ] \`) kaçırır; kullanıcı yazdığı metni olduğu gibi aratır.
pub fn escape_glob(query: &str) -> String {
    let mut out = String::with_capacity(query.len());
    for c in query.chars() {
        if matches!(c, '*' | '?' | '[' | ']' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// `root` altında adı `query` içeren dosya ve klasörleri arayan kabuk komutu (büyük/küçük harf duyarsız,
/// aynı dosya sisteminde kalır, en çok `limit` sonuç).
pub fn find_command(root: &str, query: &str, limit: usize) -> String {
    let pattern = format!("*{}*", escape_glob(query));
    format!("find {} -xdev -iname {} 2>/dev/null | head -n {}", shell_quote(root), shell_quote(&pattern), limit)
}

/// `find` çıktısından (satır başına bir yol) boş satırları ayıklar.
pub fn parse_paths(output: &str) -> Vec<String> {
    output.lines().map(str::trim_end).filter(|l| !l.is_empty()).map(String::from).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_characters_in_the_query_are_escaped() {
        assert_eq!(escape_glob("a*b?[c]\\d"), "a\\*b\\?\\[c\\]\\\\d");
        assert_eq!(escape_glob("plain.txt"), "plain.txt");
    }

    #[test]
    fn the_command_quotes_root_and_pattern_for_the_shell() {
        let cmd = find_command("/home/u/it's", "rapor", 50);
        assert_eq!(cmd, r#"find '/home/u/it'\''s' -xdev -iname '*rapor*' 2>/dev/null | head -n 50"#);
        let hostile = find_command("/", "x'; rm -rf / #", 5);
        assert!(hostile.contains(r#"'*x'\''; rm -rf / #*'"#), "{hostile}");
    }

    #[test]
    fn blank_lines_are_dropped_and_paths_kept_in_order() {
        assert_eq!(parse_paths("/a\n\n/b c\n  \n"), vec!["/a".to_string(), "/b c".to_string()]);
    }
}
