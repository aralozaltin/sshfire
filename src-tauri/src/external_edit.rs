use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Uzak dosya adından yerel geçici dosya adı üretir: yol ayırıcıları ve boş adlar zararsızlaştırılır.
pub fn safe_file_name(remote: &str) -> String {
    let base = remote.trim_end_matches('/').rsplit('/').next().unwrap_or("");
    let cleaned: String = base.chars().map(|c| if matches!(c, '\\' | '/' | ':' | '\0') { '_' } else { c }).collect();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        "file".to_string()
    } else {
        cleaned
    }
}

pub fn edit_path(root: &Path, id: &str, remote: &str) -> PathBuf {
    root.join(id).join(safe_file_name(remote))
}

/// Dosya `last` anından sonra değiştiyse yeni değişiklik zamanını verir; silinmiş ya da değişmemişse `None`.
pub fn changed_since(path: &Path, last: SystemTime) -> Option<SystemTime> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    (modified > last).then_some(modified)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn remote_names_become_plain_local_file_names() {
        assert_eq!(safe_file_name("/etc/nginx/nginx.conf"), "nginx.conf");
        assert_eq!(safe_file_name("/var/log/"), "log");
        assert_eq!(safe_file_name("/"), "file");
        assert_eq!(safe_file_name(".."), "file");
        assert_eq!(safe_file_name("/tmp/a:b\\c"), "a_b_c");
    }

    #[test]
    fn the_edit_path_stays_inside_its_own_folder() {
        let p = edit_path(Path::new("/tmp/root"), "abc", "/../../etc/passwd");
        assert_eq!(p, Path::new("/tmp/root/abc/passwd"));
    }

    #[test]
    fn only_a_newer_modification_counts_as_a_change() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("x.txt");
        std::fs::write(&f, "a").unwrap();
        let first = std::fs::metadata(&f).unwrap().modified().unwrap();
        assert_eq!(changed_since(&f, first), None);
        let file = std::fs::OpenOptions::new().write(true).open(&f).unwrap();
        file.set_modified(first + Duration::from_secs(5)).unwrap();
        assert_eq!(changed_since(&f, first), Some(first + Duration::from_secs(5)));
        std::fs::remove_file(&f).unwrap();
        assert_eq!(changed_since(&f, first), None);
    }
}
