use crate::app_error::AppError;
use crate::state::AppState;
use clipboard_rs::{Clipboard, ClipboardContext};
use std::path::{Path, PathBuf};
use tauri::State;

/// Panoya koyduğumuz geçici kopyaların kökü; buradaki dosyalar Finder'dan gelmiş sayılmaz.
fn staging_root() -> PathBuf {
    std::env::temp_dir().join("sshfire-clip")
}

/// En fazla bu kadar bayt sistem panosuna hazırlanır; fazlası yalnızca panelin kendi içinde yapıştırılır.
const MAX_CLIPBOARD_BYTES: u64 = 100 * 1024 * 1024;

/// Panodaki dosya yollarından kendi geçici kopyalarımızı ayıklar.
pub fn external_only(paths: Vec<String>, staging: &Path) -> Vec<String> {
    paths.into_iter().filter(|p| !Path::new(p).starts_with(staging)).collect()
}

/// Sistem panosundaki dosyalar (Finder/Gezgin'de kopyalananlar); okunamazsa boş liste.
#[tauri::command]
pub fn clipboard_files() -> Vec<String> {
    let Ok(ctx) = ClipboardContext::new() else { return Vec::new() };
    external_only(ctx.get_files().unwrap_or_default(), &staging_root())
}

/// Seçilen uzak dosya/klasörleri geçici klasöre indirip sistem panosuna koyar; `Cmd+V` ile Finder'a yapıştırılır.
#[tauri::command]
pub async fn sftp_copy_to_clipboard(state: State<'_, AppState>, tab_id: String, remote_paths: Vec<String>) -> Result<usize, AppError> {
    let client = crate::sftp_commands::client(&state, &tab_id).await?;
    let root = staging_root();
    let _ = std::fs::remove_dir_all(&root);
    let dir = root.join(uuid::Uuid::new_v4().to_string());
    let local = client.download_to_dir(&remote_paths, &dir, MAX_CLIPBOARD_BYTES).await.map_err(|e| AppError::from(&e))?;
    let files: Vec<String> = local.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let count = files.len();
    let ctx = ClipboardContext::new().map_err(|e| AppError::with_detail("clipboard", e.to_string()))?;
    ctx.set_files(files).map_err(|e| AppError::with_detail("clipboard", e.to_string()))?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn our_own_staged_copies_are_not_mistaken_for_files_copied_in_finder() {
        let staging = Path::new("/tmp/sshfire-clip");
        let kept = external_only(
            vec!["/tmp/sshfire-clip/abc/a.txt".into(), "/Users/u/Desktop/b.txt".into(), "/tmp/sshfire-clip2/c.txt".into()],
            staging,
        );
        assert_eq!(kept, vec!["/Users/u/Desktop/b.txt".to_string(), "/tmp/sshfire-clip2/c.txt".to_string()]);
    }

    /// Gerçek sistem panosunu kullanır (panodaki içeriği değiştirir): `cargo test -p ssh-istemci -- --ignored`.
    #[test]
    #[ignore]
    fn files_survive_a_round_trip_through_the_real_clipboard() {
        let dir = std::env::temp_dir().join("sshfire-clip-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("hello world.txt");
        std::fs::write(&file, "hi").unwrap();
        let ctx = ClipboardContext::new().unwrap();
        ctx.set_files(vec![file.to_string_lossy().into_owned()]).unwrap();
        let got = clipboard_files();
        assert_eq!(got.len(), 1);
        assert!(got[0].ends_with("hello world.txt"), "{got:?}");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_size_limit_is_a_hundred_megabytes() {
        assert_eq!(MAX_CLIPBOARD_BYTES, 104_857_600);
    }
}
