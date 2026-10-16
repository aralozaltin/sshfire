use crate::stream::Throttle;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use vcore::known_hosts::KnownHosts;
use vcore::secrets::SecretStore;
use vcore::sessions::SessionStore;
use vcore::ssh::ShellWriter;

#[derive(Clone, serde::Serialize)]
pub struct StartupWarning {
    pub code: &'static str,
    pub backup: String,
}

pub struct Tab {
    pub writer: ShellWriter,
    pub throttle: Arc<Throttle>,
    pub task: tauri::async_runtime::JoinHandle<()>,
}

pub struct AppState {
    pub store: Mutex<SessionStore>,
    pub secrets: Arc<dyn SecretStore>,
    pub hosts: Arc<Mutex<KnownHosts>>,
    pub tabs: Mutex<HashMap<String, Tab>>,
    pub pending_prompts: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    pub startup_warnings: Vec<StartupWarning>,
}
