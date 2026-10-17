use crate::app_error::AppError;
use crate::state::AppState;
use crate::transfers::{unique_local_path, ProgressGate};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use vcore::sftp::{copy_remote, FileEntry, SftpClient, SftpError};

async fn client(state: &AppState, tab_id: &str) -> Result<Arc<SftpClient>, AppError> {
    let (conn, cell) = {
        let tabs = state.tabs.lock().unwrap();
        let tab = tabs.get(tab_id).ok_or_else(|| AppError::code("tab_not_found"))?;
        (tab.conn.clone(), tab.sftp.clone())
    };
    let c = cell
        .get_or_try_init(|| async { SftpClient::open(&conn).await.map(Arc::new) })
        .await
        .map_err(|e| AppError::from(&e))?;
    Ok(c.clone())
}

fn base_name(path: &str) -> String {
    path.trim_end_matches(['/', '\\']).rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

#[tauri::command]
pub async fn sftp_home(state: State<'_, AppState>, tab_id: String) -> Result<String, AppError> {
    client(&state, &tab_id).await?.home_dir().await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_list(state: State<'_, AppState>, tab_id: String, path: String) -> Result<Vec<FileEntry>, AppError> {
    client(&state, &tab_id).await?.list_dir(&path).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_stat(state: State<'_, AppState>, tab_id: String, path: String) -> Result<FileEntry, AppError> {
    client(&state, &tab_id).await?.stat(&path).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_mkdir(state: State<'_, AppState>, tab_id: String, path: String) -> Result<(), AppError> {
    client(&state, &tab_id).await?.mkdir(&path).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_rename(state: State<'_, AppState>, tab_id: String, from: String, to: String) -> Result<(), AppError> {
    client(&state, &tab_id).await?.rename(&from, &to).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_chmod(state: State<'_, AppState>, tab_id: String, path: String, mode: u32) -> Result<(), AppError> {
    client(&state, &tab_id).await?.chmod(&path, mode).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_remove(state: State<'_, AppState>, tab_id: String, path: String, recursive: bool) -> Result<(), AppError> {
    client(&state, &tab_id).await?.remove(&path, recursive).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn sftp_copy(state: State<'_, AppState>, tab_id: String, from: String, to: String) -> Result<(), AppError> {
    let conn = {
        let tabs = state.tabs.lock().unwrap();
        tabs.get(&tab_id).ok_or_else(|| AppError::code("tab_not_found"))?.conn.clone()
    };
    copy_remote(&conn, &from, &to).await.map_err(|e| AppError::from(&e))
}

const MAX_EDIT_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub async fn sftp_read_text(state: State<'_, AppState>, tab_id: String, path: String) -> Result<String, AppError> {
    let bytes = client(&state, &tab_id).await?.read_file(&path, MAX_EDIT_BYTES).await.map_err(|e| AppError::from(&e))?;
    vcore::text::decode_text(bytes).map_err(|_| AppError::code("not_text"))
}

#[tauri::command]
pub async fn sftp_write_text(state: State<'_, AppState>, tab_id: String, path: String, content: String) -> Result<(), AppError> {
    client(&state, &tab_id).await?.write_file(&path, content.as_bytes()).await.map_err(|e| AppError::from(&e))
}

#[derive(Deserialize)]
pub struct UploadItem {
    pub local: String,
    pub remote: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferEvent {
    transfer_id: String,
    direction: &'static str,
    name: String,
    done: u64,
    total: u64,
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<AppError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    local_path: Option<String>,
}

impl Clone for AppError {
    fn clone(&self) -> Self {
        AppError { code: self.code, detail: self.detail.clone(), previous: self.previous.clone(), current: self.current.clone() }
    }
}

fn finish_event(base: TransferEvent, result: Result<(), SftpError>) -> TransferEvent {
    match result {
        Ok(()) => TransferEvent { state: "done", done: base.total, ..base },
        Err(SftpError::Cancelled) => TransferEvent { state: "cancelled", ..base },
        Err(e) => TransferEvent { state: "error", error: Some(AppError::from(&e)), ..base },
    }
}

fn spawn_transfer(
    app: AppHandle,
    state: &AppState,
    client: Arc<SftpClient>,
    direction: &'static str,
    name: String,
    local_path: Option<String>,
    run: impl FnOnce(Arc<SftpClient>, vcore::sftp::CancelToken, Box<dyn FnMut(u64, u64) + Send>) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), SftpError>> + Send>> + Send + 'static,
) -> String {
    let (id, token) = state.transfers.start();
    let registry = state.transfers.clone();
    let base = TransferEvent { transfer_id: id.clone(), direction, name, done: 0, total: 0, state: "running", error: None, local_path };
    let task_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("transfer-progress", base.clone());
        let mut gate = ProgressGate::new(Duration::from_millis(100));
        let last = Arc::new(std::sync::Mutex::new((0u64, 0u64)));
        let progress: Box<dyn FnMut(u64, u64) + Send> = {
            let (app, base, last) = (app.clone(), base.clone(), last.clone());
            Box::new(move |done, total| {
                *last.lock().unwrap() = (done, total);
                if gate.should_emit(Instant::now(), done, total) {
                    let _ = app.emit("transfer-progress", TransferEvent { done, total, ..base.clone() });
                }
            })
        };
        let result = run(client, token, progress).await;
        let (done, total) = *last.lock().unwrap();
        let _ = app.emit("transfer-progress", finish_event(TransferEvent { done, total, ..base }, result));
        registry.finish(&task_id);
    });
    id
}

#[tauri::command]
pub async fn sftp_upload(app: AppHandle, state: State<'_, AppState>, tab_id: String, items: Vec<UploadItem>) -> Result<Vec<String>, AppError> {
    let client = client(&state, &tab_id).await?;
    let mut ids = Vec::new();
    for item in items {
        let name = base_name(&item.local);
        let (local, remote) = (PathBuf::from(&item.local), item.remote);
        let id = spawn_transfer(app.clone(), &state, client.clone(), "upload", name, None, move |c, token, mut progress| {
            Box::pin(async move { c.upload(&local, &remote, &mut *progress, &token).await })
        });
        ids.push(id);
    }
    Ok(ids)
}

#[tauri::command]
pub async fn sftp_download(app: AppHandle, state: State<'_, AppState>, tab_id: String, remote_paths: Vec<String>, local_dir: Option<String>) -> Result<Vec<String>, AppError> {
    let client = client(&state, &tab_id).await?;
    let dir = match local_dir {
        Some(d) => PathBuf::from(d),
        None => app.path().download_dir().map_err(|e| AppError::with_detail("sftp_other", e.to_string()))?,
    };
    let mut ids = Vec::new();
    for remote in remote_paths {
        let name = base_name(&remote);
        let target = unique_local_path(&dir, &name);
        let shown = target.display().to_string();
        let id = spawn_transfer(app.clone(), &state, client.clone(), "download", name, Some(shown), move |c, token, mut progress| {
            Box::pin(async move { c.download(&remote, &target, &mut *progress, &token).await })
        });
        ids.push(id);
    }
    Ok(ids)
}

#[tauri::command]
pub fn transfer_cancel(state: State<'_, AppState>, transfer_id: String) -> bool {
    state.transfers.cancel(&transfer_id)
}

#[tauri::command]
pub fn ssh_config_hosts(app: AppHandle) -> Result<crate::ssh_config_import::SshConfigImport, AppError> {
    let home = app.path().home_dir().map_err(|e| AppError::with_detail("store_error", e.to_string()))?;
    let user = std::env::var("USER").or_else(|_| std::env::var("USERNAME")).unwrap_or_default();
    let text = match std::fs::read_to_string(home.join(".ssh").join("config")) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(AppError::with_detail("store_error", e.to_string())),
    };
    Ok(crate::ssh_config_import::from_config_text(&text, &home.display().to_string(), &user))
}

const MAX_EXTERNAL_EDIT_BYTES: u64 = 50 * 1024 * 1024;
const EXTERNAL_EDIT_MAX_AGE: Duration = Duration::from_secs(8 * 60 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExternalEditSync {
    path: String,
    ok: bool,
}

/// Uzak dosyayı geçici klasöre indirip sistemin varsayılan uygulamasıyla açar; dosya kaydedildikçe sunucuya geri yükler.
#[tauri::command]
pub async fn sftp_edit_external(app: AppHandle, state: State<'_, AppState>, tab_id: String, path: String) -> Result<String, AppError> {
    use crate::external_edit::{changed_since, edit_path};
    use tauri_plugin_opener::OpenerExt;
    let sftp = client(&state, &tab_id).await?;
    let bytes = sftp.read_file(&path, MAX_EXTERNAL_EDIT_BYTES).await.map_err(|e| AppError::from(&e))?;
    let root = std::env::temp_dir().join("sshfire-edit");
    let local = edit_path(&root, &uuid::Uuid::new_v4().to_string(), &path);
    let io = |e: std::io::Error| AppError::with_detail("store_error", e.to_string());
    std::fs::create_dir_all(local.parent().expect("edit path has a parent")).map_err(io)?;
    std::fs::write(&local, &bytes).map_err(io)?;
    let mut last = std::fs::metadata(&local).and_then(|m| m.modified()).map_err(io)?;
    app.opener().open_path(local.to_string_lossy(), None::<&str>).map_err(|e| AppError::with_detail("store_error", e.to_string()))?;

    let (watch_app, watch_local, remote) = (app.clone(), local.clone(), path.clone());
    tokio::spawn(async move {
        let started = Instant::now();
        while started.elapsed() < EXTERNAL_EDIT_MAX_AGE {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let st = watch_app.state::<AppState>();
            if !st.tabs.lock().unwrap().contains_key(&tab_id) {
                break;
            }
            if !watch_local.exists() {
                break;
            }
            let Some(modified) = changed_since(&watch_local, last) else { continue };
            last = modified;
            // Editörler dosyayı yazarken kısa süre yarım bırakabilir; bir tur bekleyip tekrar kontrol et.
            tokio::time::sleep(Duration::from_millis(400)).await;
            let ok = match (std::fs::read(&watch_local), client(&st, &tab_id).await) {
                (Ok(data), Ok(c)) => c.write_file(&remote, &data).await.is_ok(),
                _ => false,
            };
            let _ = watch_app.emit("external-edit-sync", ExternalEditSync { path: remote.clone(), ok });
        }
        if let Some(dir) = watch_local.parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
    });
    Ok(local.to_string_lossy().into_owned())
}

const SEARCH_LIMIT: usize = 200;

/// `root` altında adı `query` içeren dosya ve klasörleri (alt klasörler dahil) bulur.
#[tauri::command]
pub async fn sftp_search(state: State<'_, AppState>, tab_id: String, root: String, query: String) -> Result<Vec<FileEntry>, AppError> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let conn = {
        let tabs = state.tabs.lock().unwrap();
        tabs.get(&tab_id).ok_or_else(|| AppError::code("tab_not_found"))?.conn.clone()
    };
    let sftp = client(&state, &tab_id).await?;
    let output = conn.exec(&vcore::search::find_command(&root, &query, SEARCH_LIMIT)).await.map_err(|e| AppError::from(&e))?;
    let mut found = Vec::new();
    for path in vcore::search::parse_paths(&output) {
        if let Ok(entry) = sftp.stat(&path).await {
            found.push(entry);
        }
    }
    Ok(found)
}
