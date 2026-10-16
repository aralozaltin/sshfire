mod commands;
mod state;
mod stream;

use state::AppState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use vcore::known_hosts::{KnownHosts, KnownHostsError};
use vcore::secrets::KeyringSecrets;
use vcore::sessions::{SessionStore, StoreError};

const KEYCHAIN_SERVICE: &str = "ssh-istemci";

fn build_state(dir: &std::path::Path) -> Result<AppState, Box<dyn std::error::Error>> {
    let mut warnings: Vec<String> = Vec::new();
    let sessions_path = dir.join("sessions.json");
    let store = match SessionStore::open(&sessions_path) {
        Ok(s) => s,
        Err(StoreError::Corrupt { backup }) => {
            warnings.push(format!("Oturum dosyası bozuktu; yedeği: {}", backup.display()));
            SessionStore::open(&sessions_path)?
        }
        Err(e) => return Err(e.to_string().into()),
    };
    let hosts_path = dir.join("known_hosts.json");
    let hosts = match KnownHosts::open(&hosts_path) {
        Ok(h) => h,
        Err(KnownHostsError::Corrupt { backup }) => {
            warnings.push(format!("Bilinen sunucular dosyası bozuktu; yedeği: {}", backup.display()));
            KnownHosts::open(&hosts_path)?
        }
        Err(e) => return Err(e.to_string().into()),
    };
    Ok(AppState {
        store: Mutex::new(store),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        hosts: Arc::new(Mutex::new(hosts)),
        tabs: Mutex::new(HashMap::new()),
        pending_prompts: Arc::new(Mutex::new(HashMap::new())),
        startup_warning: if warnings.is_empty() { None } else { Some(warnings.join(" ")) },
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::connect,
            commands::hostkey_answer,
            commands::shell_write,
            commands::shell_resize,
            commands::shell_ack,
            commands::shell_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
