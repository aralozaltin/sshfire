use crate::app_error::AppError;
use crate::overlay_secrets::OverlaySecrets;
use crate::state::{AppState, PasswordReply, StartupWarning, Tab};
use crate::stream::{HIGH_WATER, LOW_WATER, Throttle};
use async_trait::async_trait;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};
use vcore::known_hosts::HostKeyStatus;
use vcore::secrets::{Secret, SecretStore};
use vcore::sessions::{NewSession, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, ShellEvent, SshConnection};

struct TauriPrompt {
    app: AppHandle,
    pending: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HostKeyPromptEvent {
    request_id: String,
    host: String,
    port: u16,
    fingerprint: String,
}

#[async_trait]
impl HostKeyPrompt for TauriPrompt {
    async fn decide(&self, host: &str, port: u16, fingerprint: &str, _status: &HostKeyStatus) -> HostKeyDecision {
        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.pending.lock().unwrap().insert(request_id.clone(), tx);
        let event = HostKeyPromptEvent {
            request_id: request_id.clone(),
            host: host.into(),
            port,
            fingerprint: fingerprint.into(),
        };
        if self.app.emit("hostkey-prompt", event).is_err() {
            self.pending.lock().unwrap().remove(&request_id);
            return HostKeyDecision::Reject;
        }
        let answer = tokio::time::timeout(Duration::from_secs(120), rx).await;
        self.pending.lock().unwrap().remove(&request_id);
        match answer {
            Ok(Ok(true)) => HostKeyDecision::Trust,
            _ => HostKeyDecision::Reject,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PasswordPromptEvent {
    request_id: String,
    host: String,
    user: String,
}

async fn ask_password(app: &AppHandle, state: &AppState, session: &Session) -> Option<PasswordReply> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.pending_passwords.lock().unwrap().insert(request_id.clone(), tx);
    let event = PasswordPromptEvent { request_id: request_id.clone(), host: session.host.clone(), user: session.user.clone() };
    if app.emit("password-prompt", event).is_err() {
        state.pending_passwords.lock().unwrap().remove(&request_id);
        return None;
    }
    let answer = tokio::time::timeout(Duration::from_secs(300), rx).await;
    state.pending_passwords.lock().unwrap().remove(&request_id);
    answer.ok().and_then(|r| r.ok()).flatten()
}

#[tauri::command]
pub fn password_answer(state: State<'_, AppState>, request_id: String, password: Option<String>, remember: bool) {
    if let Some(tx) = state.pending_passwords.lock().unwrap().remove(&request_id) {
        let _ = tx.send(password.filter(|p| !p.is_empty()).map(|password| PasswordReply { password, remember }));
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShellClosedEvent {
    tab_id: String,
    reason: Option<String>,
}

#[tauri::command]
pub fn startup_warning(state: State<'_, AppState>) -> Vec<StartupWarning> {
    state.startup_warnings.clone()
}

#[tauri::command]
pub fn sessions_list(state: State<'_, AppState>) -> Vec<Session> {
    state.store.lock().unwrap().list().to_vec()
}

#[tauri::command]
pub fn session_add(state: State<'_, AppState>, session: NewSession, password: Option<String>) -> Result<Session, AppError> {
    let added = state.store.lock().unwrap().add(session).map_err(|e| AppError::from(&e))?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        state.secrets.set(&added.id, &Secret::new(pw)).map_err(|e| AppError::from(&e))?;
    }
    Ok(added)
}

#[tauri::command]
pub fn session_update(state: State<'_, AppState>, session: Session, password: Option<String>) -> Result<(), AppError> {
    let id = session.id.clone();
    state.store.lock().unwrap().update(session).map_err(|e| AppError::from(&e))?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        state.secrets.set(&id, &Secret::new(pw)).map_err(|e| AppError::from(&e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn session_remove(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    state.store.lock().unwrap().remove(&id).map_err(|e| AppError::from(&e))?;
    let _ = state.secrets.delete(&id);
    Ok(())
}

#[tauri::command]
pub async fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Result<String, AppError> {
    let chain: Vec<Session> = state
        .store
        .lock()
        .unwrap()
        .jump_chain(&session_id)
        .map(|c| c.into_iter().cloned().collect())
        .ok_or_else(|| AppError::code("session_not_found"))?;
    let prompt = Arc::new(TauriPrompt { app: app.clone(), pending: state.pending_prompts.clone() });
    let secrets = OverlaySecrets::new(state.secrets.clone());
    let mut previous: Option<Arc<SshConnection>> = None;
    for hop in &chain {
        if matches!(hop.auth, vcore::sessions::Auth::Password) && !matches!(secrets.get(&hop.id), Ok(Some(_))) {
            match ask_password(&app, &state, hop).await {
                Some(reply) => {
                    let secret = Secret::new(reply.password);
                    if reply.remember {
                        state.secrets.set(&hop.id, &secret).map_err(|e| AppError::from(&e))?;
                    } else {
                        secrets.remember_for_this_connection(&hop.id, &secret);
                    }
                }
                None => return Err(AppError::code("password_cancelled")),
            }
        }
        let connected = match &previous {
            None => SshConnection::connect(hop, &secrets, state.hosts.clone(), prompt.clone()).await,
            Some(jump) => SshConnection::connect_via(jump, hop, &secrets, state.hosts.clone(), prompt.clone()).await,
        };
        previous = Some(Arc::new(connected.map_err(|e| AppError::from(&e))?));
    }
    let conn = previous.ok_or_else(|| AppError::code("session_not_found"))?;
    let ptys_before = conn.list_ptys().await.ok();
    let mut shell = conn.open_shell(cols, rows).await.map_err(|e| AppError::from(&e))?;
    let tty = match ptys_before {
        Some(before) => conn.detect_shell_pty(&before).await,
        None => None,
    };

    let tab_id = uuid::Uuid::new_v4().to_string();
    let throttle = Arc::new(Throttle::new(HIGH_WATER, LOW_WATER));
    let writer = shell.writer();
    let task = tauri::async_runtime::spawn({
        let (app, tab_id, throttle, conn) = (app.clone(), tab_id.clone(), throttle.clone(), conn.clone());
        async move {
            let _keep_alive = conn;
            let reason = loop {
                throttle.wait_ready().await;
                match shell.read().await {
                    Some(ShellEvent::Data(bytes)) => {
                        throttle.on_sent(bytes.len());
                        if on_data.send(InvokeResponseBody::Raw(bytes)).is_err() {
                            return;
                        }
                    }
                    Some(ShellEvent::Closed { reason }) => break reason,
                    None => break None,
                }
            };
            let _ = app.emit("shell-closed", ShellClosedEvent { tab_id, reason });
        }
    });
    state.tabs.lock().unwrap().insert(tab_id.clone(), Tab { conn, sftp: Arc::new(tokio::sync::OnceCell::new()), writer, metrics_task: None, tty, tunnels: Default::default(), cwd_task: None, throttle, task });
    Ok(tab_id)
}

#[tauri::command]
pub fn hostkey_answer(state: State<'_, AppState>, request_id: String, trust: bool) {
    if let Some(tx) = state.pending_prompts.lock().unwrap().remove(&request_id) {
        let _ = tx.send(trust);
    }
}

fn tab_writer(state: &AppState, tab_id: &str) -> Result<vcore::ssh::ShellWriter, AppError> {
    state.tabs.lock().unwrap().get(tab_id).map(|t| t.writer.clone()).ok_or_else(|| AppError::code("tab_not_found"))
}

#[tauri::command]
pub async fn shell_write(state: State<'_, AppState>, tab_id: String, data: Vec<u8>) -> Result<(), AppError> {
    let w = tab_writer(&state, &tab_id)?;
    w.write(&data).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn shell_resize(state: State<'_, AppState>, tab_id: String, cols: u16, rows: u16) -> Result<(), AppError> {
    let w = tab_writer(&state, &tab_id)?;
    w.resize(cols, rows).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub fn shell_ack(state: State<'_, AppState>, tab_id: String, bytes: usize) {
    if let Some(tab) = state.tabs.lock().unwrap().get(&tab_id) {
        tab.throttle.ack(bytes);
    }
}

#[tauri::command]
pub fn shell_close(state: State<'_, AppState>, tab_id: String) {
    if let Some(tab) = state.tabs.lock().unwrap().remove(&tab_id) {
        tab.task.abort();
        if let Some(m) = tab.metrics_task {
            m.abort();
        }
        if let Some(c) = tab.cwd_task {
            c.abort();
        }
    }
}

#[tauri::command]
pub fn metrics_start(state: State<'_, AppState>, tab_id: String, on_metrics: Channel<Option<vcore::metrics::Metrics>>) -> Result<(), AppError> {
    let mut tabs = state.tabs.lock().unwrap();
    let tab = tabs.get_mut(&tab_id).ok_or_else(|| AppError::code("tab_not_found"))?;
    if let Some(old) = tab.metrics_task.take() {
        old.abort();
    }
    let conn = tab.conn.clone();
    tab.metrics_task = Some(tauri::async_runtime::spawn(async move {
        let mut prev = None;
        let mut last = std::time::Instant::now();
        let mut first = true;
        loop {
            let output = conn.exec(vcore::metrics::PROBE_COMMAND).await.ok();
            let now = std::time::Instant::now();
            let dt = if first { 0.0 } else { now.duration_since(last).as_secs_f32() };
            first = false;
            last = now;
            let metrics = crate::metrics_task::step(&mut prev, output.as_deref(), dt);
            if on_metrics.send(metrics).is_err() {
                return;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }));
    Ok(())
}

#[tauri::command]
pub fn metrics_stop(state: State<'_, AppState>, tab_id: String) {
    if let Some(tab) = state.tabs.lock().unwrap().get_mut(&tab_id) {
        if let Some(m) = tab.metrics_task.take() {
            m.abort();
        }
    }
}

#[tauri::command]
pub fn cwd_start(state: State<'_, AppState>, tab_id: String, on_cwd: Channel<String>) -> Result<(), AppError> {
    let mut tabs = state.tabs.lock().unwrap();
    let tab = tabs.get_mut(&tab_id).ok_or_else(|| AppError::code("tab_not_found"))?;
    let Some(tty) = tab.tty else { return Ok(()) };
    if let Some(old) = tab.cwd_task.take() {
        old.abort();
    }
    let conn = tab.conn.clone();
    tab.cwd_task = Some(tauri::async_runtime::spawn(async move {
        let mut last: Option<String> = None;
        loop {
            let now = conn.shell_cwd(tty).await.ok().flatten();
            if let Some(changed) = crate::cwd_task::cwd_changed(&mut last, now) {
                if on_cwd.send(changed).is_err() {
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(1500)).await;
        }
    }));
    Ok(())
}

#[tauri::command]
pub fn cwd_stop(state: State<'_, AppState>, tab_id: String) {
    if let Some(tab) = state.tabs.lock().unwrap().get_mut(&tab_id) {
        if let Some(c) = tab.cwd_task.take() {
            c.abort();
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelInfo {
    pub id: String,
    pub spec: vcore::tunnel::TunnelSpec,
    pub local_port: u16,
    pub connections: u64,
}

#[tauri::command]
pub async fn tunnel_start(state: State<'_, AppState>, tab_id: String, spec: vcore::tunnel::TunnelSpec) -> Result<TunnelInfo, AppError> {
    spec.validate().map_err(|m| AppError::from(&vcore::tunnel::TunnelError::Invalid(m)))?;
    let conn = {
        let tabs = state.tabs.lock().unwrap();
        tabs.get(&tab_id).ok_or_else(|| AppError::code("tab_not_found"))?.conn.clone()
    };
    let handle = conn.start_tunnel(&spec).await.map_err(|e| AppError::from(&e))?;
    let id = uuid::Uuid::new_v4().to_string();
    let info = TunnelInfo { id: id.clone(), spec: spec.clone(), local_port: handle.local_port, connections: 0 };
    match state.tabs.lock().unwrap().get_mut(&tab_id) {
        Some(tab) => {
            tab.tunnels.insert(id, (spec, handle));
            Ok(info)
        }
        None => Err(AppError::code("tab_not_found")),
    }
}

#[tauri::command]
pub fn tunnel_stop(state: State<'_, AppState>, tab_id: String, id: String) {
    if let Some(tab) = state.tabs.lock().unwrap().get_mut(&tab_id) {
        tab.tunnels.remove(&id);
    }
}

#[tauri::command]
pub fn tunnel_list(state: State<'_, AppState>, tab_id: String) -> Vec<TunnelInfo> {
    let tabs = state.tabs.lock().unwrap();
    let Some(tab) = tabs.get(&tab_id) else { return Vec::new() };
    tab.tunnels
        .iter()
        .map(|(id, (spec, h))| TunnelInfo {
            id: id.clone(),
            spec: spec.clone(),
            local_port: h.local_port,
            connections: h.connections.load(std::sync::atomic::Ordering::SeqCst),
        })
        .collect()
}
