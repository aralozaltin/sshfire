mod app_error;
mod commands;
mod cwd_task;
mod sftp_commands;
mod ssh_config_import;
mod local_pty;
mod metrics_task;
mod overlay_secrets;
mod session_log;
mod state;
mod stream;
mod transfers;

use state::{AppState, StartupWarning};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use vcore::known_hosts::{KnownHosts, KnownHostsError};
use vcore::secrets::{KeyringSecrets, VaultSecrets};
use vcore::sessions::{SessionStore, StoreError};

const KEYCHAIN_SERVICE: &str = "ssh-istemci";

fn build_state(dir: &std::path::Path) -> Result<AppState, Box<dyn std::error::Error>> {
    let mut warnings: Vec<StartupWarning> = Vec::new();
    let sessions_path = dir.join("sessions.json");
    let store = match SessionStore::open(&sessions_path) {
        Ok(s) => s,
        Err(StoreError::Corrupt { backup }) => {
            warnings.push(StartupWarning { code: "sessions_corrupt", backup: backup.display().to_string() });
            SessionStore::open(&sessions_path)?
        }
        Err(e) => return Err(e.to_string().into()),
    };
    let hosts_path = dir.join("known_hosts.json");
    let hosts = match KnownHosts::open(&hosts_path) {
        Ok(h) => h,
        Err(KnownHostsError::Corrupt { backup }) => {
            warnings.push(StartupWarning { code: "hosts_corrupt", backup: backup.display().to_string() });
            KnownHosts::open(&hosts_path)?
        }
        Err(e) => return Err(e.to_string().into()),
    };
    Ok(AppState {
        store: Mutex::new(store),
        // Tüm parolalar tek Keychain kaydında; eski sunucu-başına kayıtlar ilk kullanımda taşınır.
        secrets: Arc::new(VaultSecrets::new(
            Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
            Some(Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE))),
        )),
        secret_cache: Arc::new(vcore::secrets::MemorySecrets::default()),
        hosts: Arc::new(Mutex::new(hosts)),
        tabs: Mutex::new(HashMap::new()),
        local_tabs: Mutex::new(HashMap::new()),
        pending_prompts: Arc::new(Mutex::new(HashMap::new())),
        pending_passwords: Arc::new(Mutex::new(HashMap::new())),
        pending_auth: Arc::new(Mutex::new(HashMap::new())),
        startup_warnings: warnings,
        transfers: Arc::new(transfers::Registry::default()),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(build_state(&dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::startup_warning,
            commands::sessions_list,
            commands::session_add,
            commands::session_update,
            commands::session_remove,
            commands::sessions_export,
            commands::sessions_import,
            commands::connect,
            commands::local_connect,
            commands::log_start,
            commands::log_stop,
            commands::hostkey_answer,
            commands::password_answer,
            commands::auth_answer,
            commands::shell_write,
            commands::shell_resize,
            commands::shell_ack,
            commands::shell_close,
            commands::metrics_start,
            commands::metrics_stop,
            commands::cwd_start,
            commands::cwd_stop,
            commands::tunnel_start,
            commands::tunnel_stop,
            commands::tunnel_list,
            sftp_commands::sftp_home,
            sftp_commands::sftp_list,
            sftp_commands::sftp_stat,
            sftp_commands::sftp_mkdir,
            sftp_commands::sftp_rename,
            sftp_commands::sftp_remove,
            sftp_commands::sftp_copy,
            sftp_commands::sftp_read_text,
            sftp_commands::sftp_write_text,
            sftp_commands::sftp_upload,
            sftp_commands::sftp_download,
            sftp_commands::transfer_cancel,
            sftp_commands::ssh_config_hosts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
