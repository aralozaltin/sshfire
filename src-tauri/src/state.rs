use crate::stream::Throttle;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use vcore::known_hosts::KnownHosts;
use vcore::secrets::SecretStore;
use vcore::sessions::SessionStore;
use vcore::sftp::SftpClient;
use vcore::ssh::{ShellWriter, SshConnection};

#[derive(Clone, serde::Serialize)]
pub struct StartupWarning {
    pub code: &'static str,
    pub backup: String,
}

pub struct PasswordReply {
    pub password: String,
    pub remember: bool,
}

pub struct Tab {
    pub log: Arc<crate::session_log::LogSink>,
    pub conn: Arc<SshConnection>,
    pub sftp: Arc<tokio::sync::OnceCell<Arc<SftpClient>>>,
    pub writer: ShellWriter,
    pub metrics_task: Option<tauri::async_runtime::JoinHandle<()>>,
    pub tty: Option<u32>,
    pub tunnels: std::collections::HashMap<String, (vcore::tunnel::TunnelSpec, vcore::tunnel::TunnelHandle)>,
    pub cwd_task: Option<tauri::async_runtime::JoinHandle<()>>,
    /// Enter'a basılınca terminal dizini yoklamasını erkene çeker.
    pub cwd_nudge: Arc<tokio::sync::Notify>,
    pub throttle: Arc<Throttle>,
    pub task: tauri::async_runtime::JoinHandle<()>,
}

pub struct LocalTab {
    pub log: Arc<crate::session_log::LogSink>,
    pub pty: Arc<crate::local_pty::LocalPty>,
    pub throttle: Arc<Throttle>,
    pub task: tauri::async_runtime::JoinHandle<()>,
}

pub struct AppState {
    pub secret_cache: Arc<vcore::secrets::MemorySecrets>,
    pub local_tabs: Mutex<HashMap<String, LocalTab>>,
    pub store: Mutex<SessionStore>,
    pub secrets: Arc<dyn SecretStore>,
    pub hosts: Arc<Mutex<KnownHosts>>,
    pub tabs: Mutex<HashMap<String, Tab>>,
    pub pending_prompts: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    pub pending_auth: Arc<Mutex<HashMap<String, oneshot::Sender<Option<Vec<String>>>>>>,
    pub pending_passwords: Arc<Mutex<HashMap<String, oneshot::Sender<Option<PasswordReply>>>>>,
    pub startup_warnings: Vec<StartupWarning>,
    pub transfers: Arc<crate::transfers::Registry>,
}
