/// Yoklama sonucunu önceki değerle karşılaştırır: yalnızca değişen (ya da ilk) dizini döndürür.
/// Okunamayan yoklama (`None`) son bilinen değeri korur ve olay üretmez.
pub fn cwd_changed(last: &mut Option<String>, now: Option<String>) -> Option<String> {
    let now = now?;
    if last.as_deref() == Some(now.as_str()) {
        return None;
    }
    *last = Some(now.clone());
    Some(now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_value_and_every_change_are_reported() {
        let mut last = None;
        assert_eq!(cwd_changed(&mut last, Some("/home/u".into())), Some("/home/u".into()));
        assert_eq!(cwd_changed(&mut last, Some("/home/u".into())), None);
        assert_eq!(cwd_changed(&mut last, Some("/tmp".into())), Some("/tmp".into()));
        assert_eq!(cwd_changed(&mut last, Some("/tmp".into())), None);
    }

    #[test]
    fn a_failed_poll_keeps_the_last_value_and_reports_nothing() {
        let mut last = Some("/tmp".to_string());
        assert_eq!(cwd_changed(&mut last, None), None);
        assert_eq!(last.as_deref(), Some("/tmp"));
        assert_eq!(cwd_changed(&mut last, Some("/tmp".into())), None);
    }

    #[test]
    fn returning_to_an_earlier_directory_is_a_change() {
        let mut last = None;
        cwd_changed(&mut last, Some("/a".into()));
        cwd_changed(&mut last, Some("/b".into()));
        assert_eq!(cwd_changed(&mut last, Some("/a".into())), Some("/a".into()));
    }
}
