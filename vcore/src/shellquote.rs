/// Uzak kabuğa güvenle verilecek tek tırnaklı metin üretir: `'` → `'\''`.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_and_empty_values_are_single_quoted() {
        assert_eq!(shell_quote("abc"), "'abc'");
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn single_quotes_are_closed_escaped_and_reopened() {
        assert_eq!(shell_quote("a'b"), r#"'a'\''b'"#);
        assert_eq!(shell_quote("'"), r#"''\'''"#);
    }

    #[test]
    fn metacharacters_stay_inside_the_quotes() {
        let q = shell_quote("a b\"; rm -rf ~ $(x) `y`\n");
        assert!(q.starts_with('\'') && q.ends_with('\''));
        assert!(!q[1..q.len() - 1].contains('\''));
    }
}
