use crate::app_error::AppError;
use crate::overlay_secrets::OverlaySecrets;
use crate::state::{AppState, LocalTab, PasswordReply, StartupWarning, Tab};
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
use vcore::ssh::{AuthPromptItem, HostKeyDecision, HostKeyPrompt, ShellEvent, SshConnection};

struct TauriPrompt {
    app: AppHandle,
    pending: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pending_auth: Arc<std::sync::Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<Option<Vec<String>>>>>>,
    host: String,
    user: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AuthPromptEvent {
    request_id: String,
    host: String,
    user: String,
    name: String,
    instructions: String,
    prompts: Vec<AuthPromptView>,
}

#[derive(Serialize, Clone)]
struct AuthPromptView {
    text: String,
    echo: bool,
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

    async fn interactive(&self, name: &str, instructions: &str, prompts: &[AuthPromptItem]) -> Option<Vec<String>> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.pending_auth.lock().unwrap().insert(request_id.clone(), tx);
        let event = AuthPromptEvent {
            request_id: request_id.clone(),
            host: self.host.clone(),
            user: self.user.clone(),
            name: name.into(),
            instructions: instructions.into(),
            prompts: prompts.iter().map(|p| AuthPromptView { text: p.text.clone(), echo: p.echo }).collect(),
        };
        if self.app.emit("auth-prompt", event).is_err() {
            self.pending_auth.lock().unwrap().remove(&request_id);
            return None;
        }
        let answer = tokio::time::timeout(Duration::from_secs(300), rx).await;
        self.pending_auth.lock().unwrap().remove(&request_id);
        answer.ok().and_then(|r| r.ok()).flatten()
    }
}

#[tauri::command]
pub fn auth_answer(state: State<'_, AppState>, request_id: String, answers: Option<Vec<String>>) {
    if let Some(tx) = state.pending_auth.lock().unwrap().remove(&request_id) {
        let _ = tx.send(answers);
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PasswordPromptEvent {
    request_id: String,
    host: String,
    user: String,
    kind: &'static str,
}

async fn ask_password(app: &AppHandle, state: &AppState, session: &Session, kind: &'static str) -> Option<PasswordReply> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.pending_passwords.lock().unwrap().insert(request_id.clone(), tx);
    let event = PasswordPromptEvent { request_id: request_id.clone(), host: session.host.clone(), user: session.user.clone(), kind };
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
    let secrets = OverlaySecrets::new(state.secrets.clone(), state.secret_cache.clone());
    let added = state.store.lock().unwrap().add(session).map_err(|e| AppError::from(&e))?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        secrets.set(&added.id, &Secret::new(pw)).map_err(|e| AppError::from(&e))?;
    }
    Ok(added)
}

#[tauri::command]
pub fn session_update(state: State<'_, AppState>, session: Session, password: Option<String>) -> Result<(), AppError> {
    let secrets = OverlaySecrets::new(state.secrets.clone(), state.secret_cache.clone());
    let id = session.id.clone();
    state.store.lock().unwrap().update(session).map_err(|e| AppError::from(&e))?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        secrets.set(&id, &Secret::new(pw)).map_err(|e| AppError::from(&e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn session_remove(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    state.store.lock().unwrap().remove(&id).map_err(|e| AppError::from(&e))?;
    let _ = OverlaySecrets::new(state.secrets.clone(), state.secret_cache.clone()).delete(&id);
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
    let secrets = OverlaySecrets::new(state.secrets.clone(), state.secret_cache.clone());
    let mut previous: Option<Arc<SshConnection>> = None;
    for hop in &chain {
        let prompt = Arc::new(TauriPrompt {
            app: app.clone(),
            pending: state.pending_prompts.clone(),
            pending_auth: state.pending_auth.clone(),
            host: hop.host.clone(),
            user: hop.user.clone(),
        });
        // Anahtar dosyası parolayla korunuyorsa ve kayıtlı değilse bağlanmadan önce sor.
        if let vcore::sessions::Auth::KeyFile { path } = &hop.auth {
            let account = vcore::secrets::passphrase_account(&hop.id);
            if vcore::ssh::key_needs_passphrase(path) == Ok(true) && !matches!(secrets.load_once(&account), Ok(true)) {
                match ask_password(&app, &state, hop, "passphrase").await {
                    Some(reply) => {
                        let secret = Secret::new(reply.password);
                        secrets.remember_in_memory(&account, &secret);
                        if reply.remember {
                            state.secrets.set(&account, &secret).map_err(|e| AppError::from(&e))?;
                        }
                    }
                    None => return Err(AppError::code("password_cancelled")),
                }
            }
        }
        // Keychain'e parola başına yalnızca bir kez dokunulur; sonrası bellekten gelir.
        if matches!(hop.auth, vcore::sessions::Auth::Password) && !matches!(secrets.load_once(&hop.id), Ok(true)) {
            match ask_password(&app, &state, hop, "password").await {
                Some(reply) => {
                    let secret = Secret::new(reply.password);
                    secrets.remember_in_memory(&hop.id, &secret);
                    if reply.remember {
                        state.secrets.set(&hop.id, &secret).map_err(|e| AppError::from(&e))?;
                    }
                }
                None => return Err(AppError::code("password_cancelled")),
            }
        }
        let connected = match &previous {
            None => SshConnection::connect(hop, &secrets, state.hosts.clone(), prompt.clone()).await,
            Some(jump) => SshConnection::connect_via(jump, hop, &secrets, state.hosts.clone(), prompt.clone()).await,
        };
        match &connected {
            Err(vcore::ssh::SshError::AuthFailed) => secrets.forget(&hop.id),
            // Yanlış anahtar parolası kayıtlı kalırsa her bağlantı başarısız olur; sil ki yeniden sorulsun.
            Err(vcore::ssh::SshError::WrongPassphrase) => {
                let _ = secrets.delete(&vcore::secrets::passphrase_account(&hop.id));
            }
            _ => {}
        }
        previous = Some(Arc::new(connected.map_err(|e| AppError::from(&e))?));
    }
    let conn = previous.ok_or_else(|| AppError::code("session_not_found"))?;
    let _opening = state.shell_open.lock().await;
    let ptys_before = conn.list_ttys().await.ok();
    let mut shell = conn.open_shell(cols, rows).await.map_err(|e| AppError::from(&e))?;
    let tty = match ptys_before {
        Some(before) => conn.detect_shell_tty(&before).await,
        None => None,
    };

    drop(_opening);
    let tab_id = uuid::Uuid::new_v4().to_string();
    let throttle = Arc::new(Throttle::new(HIGH_WATER, LOW_WATER));
    let log = Arc::new(crate::session_log::LogSink::default());
    let writer = shell.writer();
    let task = tauri::async_runtime::spawn({
        let (app, tab_id, throttle, conn, log) = (app.clone(), tab_id.clone(), throttle.clone(), conn.clone(), log.clone());
        async move {
            let _keep_alive = conn;
            let reason = loop {
                throttle.wait_ready().await;
                match shell.read().await {
                    Some(ShellEvent::Data(bytes)) => {
                        log.write(&bytes);
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
    state.tabs.lock().unwrap().insert(tab_id.clone(), Tab { log, conn, sftp: Arc::new(tokio::sync::OnceCell::new()), writer, metrics_task: None, tty, tunnels: Default::default(), cwd_task: None, cwd_nudge: Default::default(), throttle, task });
    Ok(tab_id)
}

#[tauri::command]
pub async fn local_connect(app: AppHandle, state: State<'_, AppState>, cols: u16, rows: u16, on_data: Channel<InvokeResponseBody>) -> Result<String, AppError> {
    let pty = Arc::new(
        crate::local_pty::LocalPty::spawn(&crate::local_pty::default_shell(), cols, rows).map_err(|m| AppError::with_detail("local_shell", m))?,
    );
    let tab_id = uuid::Uuid::new_v4().to_string();
    let throttle = Arc::new(Throttle::new(HIGH_WATER, LOW_WATER));
    let log = Arc::new(crate::session_log::LogSink::default());
    let task = tauri::async_runtime::spawn({
        let (app, tab_id, throttle, pty, log) = (app.clone(), tab_id.clone(), throttle.clone(), pty.clone(), log.clone());
        async move {
            loop {
                throttle.wait_ready().await;
                let chunk = pty.output.lock().await.recv().await;
                match chunk {
                    Some(bytes) => {
                        log.write(&bytes);
                        throttle.on_sent(bytes.len());
                        if on_data.send(InvokeResponseBody::Raw(bytes)).is_err() {
                            return;
                        }
                    }
                    None => break,
                }
            }
            let _ = app.emit("shell-closed", ShellClosedEvent { tab_id, reason: None });
        }
    });
    state.local_tabs.lock().unwrap().insert(tab_id.clone(), LocalTab { log, pty, throttle, task });
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
    let local = state.local_tabs.lock().unwrap().get(&tab_id).map(|t| t.pty.clone());
    if let Some(pty) = local {
        return pty.write(&data).map_err(|m| AppError::with_detail("local_shell", m));
    }
    if crate::cwd_task::wants_nudge(&data) {
        if let Some(tab) = state.tabs.lock().unwrap().get(&tab_id) {
            tab.cwd_nudge.notify_one();
        }
    }
    let w = tab_writer(&state, &tab_id)?;
    w.write(&data).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub async fn shell_resize(state: State<'_, AppState>, tab_id: String, cols: u16, rows: u16) -> Result<(), AppError> {
    let local = state.local_tabs.lock().unwrap().get(&tab_id).map(|t| t.pty.clone());
    if let Some(pty) = local {
        return pty.resize(cols, rows).map_err(|m| AppError::with_detail("local_shell", m));
    }
    let w = tab_writer(&state, &tab_id)?;
    w.resize(cols, rows).await.map_err(|e| AppError::from(&e))
}

#[tauri::command]
pub fn shell_ack(state: State<'_, AppState>, tab_id: String, bytes: usize) {
    if let Some(tab) = state.local_tabs.lock().unwrap().get(&tab_id) {
        tab.throttle.ack(bytes);
        return;
    }
    if let Some(tab) = state.tabs.lock().unwrap().get(&tab_id) {
        tab.throttle.ack(bytes);
    }
}

#[tauri::command]
pub fn shell_close(state: State<'_, AppState>, tab_id: String) {
    if let Some(tab) = state.local_tabs.lock().unwrap().remove(&tab_id) {
        tab.task.abort();
        tab.pty.kill();
        return;
    }
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
            tokio::time::sleep(crate::metrics_task::METRICS_INTERVAL).await;
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
    let Some(tty) = tab.tty.clone() else { return Ok(()) };
    if let Some(old) = tab.cwd_task.take() {
        old.abort();
    }
    let conn = tab.conn.clone();
    let nudge = tab.cwd_nudge.clone();
    tab.cwd_task = Some(tauri::async_runtime::spawn(async move {
        let mut last: Option<String> = None;
        loop {
            let now = conn.tty_cwd(&tty).await.ok().flatten();
            if let Some(changed) = crate::cwd_task::cwd_changed(&mut last, now) {
                if on_cwd.send(changed).is_err() {
                    return;
                }
            }
            tokio::select! {
                _ = tokio::time::sleep(crate::cwd_task::CWD_INTERVAL) => {}
                _ = nudge.notified() => tokio::time::sleep(crate::cwd_task::CWD_NUDGE_DELAY).await,
            }
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

#[derive(Serialize)]
pub struct ImportSummary {
    pub added: usize,
    pub skipped: usize,
}

#[tauri::command]
pub fn sessions_export(state: State<'_, AppState>, path: String) -> Result<(), AppError> {
    let text = state.store.lock().unwrap().export_json();
    std::fs::write(&path, text).map_err(|e| AppError::with_detail("store_error", e.to_string()))
}

#[tauri::command]
pub fn sessions_import(state: State<'_, AppState>, path: String) -> Result<ImportSummary, AppError> {
    let text = std::fs::read_to_string(&path).map_err(|e| AppError::with_detail("store_error", e.to_string()))?;
    let sessions = vcore::sessions::parse_export(&text).map_err(|e| AppError::from(&e))?;
    let report = state.store.lock().unwrap().import(sessions).map_err(|e| AppError::from(&e))?;
    Ok(ImportSummary { added: report.added, skipped: report.skipped })
}

fn log_for(state: &AppState, tab_id: &str) -> Option<Arc<crate::session_log::LogSink>> {
    if let Some(t) = state.local_tabs.lock().unwrap().get(tab_id) {
        return Some(t.log.clone());
    }
    state.tabs.lock().unwrap().get(tab_id).map(|t| t.log.clone())
}

#[tauri::command]
pub fn log_start(state: State<'_, AppState>, tab_id: String, path: String) -> Result<(), AppError> {
    let log = log_for(&state, &tab_id).ok_or_else(|| AppError::code("tab_not_found"))?;
    log.start(std::path::Path::new(&path)).map_err(|e| AppError::with_detail("store_error", e.to_string()))
}

#[tauri::command]
pub fn log_stop(state: State<'_, AppState>, tab_id: String) {
    if let Some(log) = log_for(&state, &tab_id) {
        log.stop();
    }
}

#[tauri::command]
pub fn known_hosts_list(state: State<'_, AppState>) -> Vec<vcore::known_hosts::KnownHostEntry> {
    state.hosts.lock().unwrap().list()
}

#[tauri::command]
pub fn known_hosts_remove(state: State<'_, AppState>, host: String, port: u16) -> Result<bool, AppError> {
    state.hosts.lock().unwrap().remove(&host, port).map_err(|e| AppError::with_detail("store_error", e.to_string()))
}
