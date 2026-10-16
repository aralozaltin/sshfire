use crate::state::{AppState, Tab};
use crate::stream::{HIGH_WATER, LOW_WATER, Throttle};
use async_trait::async_trait;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};
use vcore::known_hosts::HostKeyStatus;
use vcore::secrets::{Secret, SecretError};
use vcore::sessions::{NewSession, Session};
use vcore::ssh::{HostKeyDecision, HostKeyPrompt, ShellEvent, SshConnection, SshError};

pub fn describe(e: &SshError) -> String {
    match e {
        SshError::HostKeyRejected => "Sunucu anahtarı reddedildi.".into(),
        SshError::HostKeyChanged { previous, current } => format!(
            "Sunucu anahtarı değişmiş! Kayıtlı: {previous} — Gelen: {current}. Bağlantı reddedildi."
        ),
        SshError::AuthFailed => "Kimlik doğrulama başarısız.".into(),
        SshError::Unreachable(m) => format!("Sunucuya ulaşılamadı: {m}"),
        SshError::Secret(SecretError::Denied) => "Anahtar deposuna erişim reddedildi.".into(),
        SshError::Secret(SecretError::Unavailable(m)) => format!("Anahtar deposu kullanılamıyor: {m}"),
        SshError::Secret(SecretError::Other(m)) => m.clone(),
        SshError::Key(m) => format!("Anahtar dosyası okunamadı: {m}"),
        SshError::Other(m) => m.clone(),
    }
}

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
struct ShellClosedEvent {
    tab_id: String,
    reason: Option<String>,
}

#[tauri::command]
pub fn startup_warning(state: State<'_, AppState>) -> Option<String> {
    state.startup_warning.clone()
}

#[tauri::command]
pub fn sessions_list(state: State<'_, AppState>) -> Vec<Session> {
    state.store.lock().unwrap().list().to_vec()
}

#[tauri::command]
pub fn session_add(state: State<'_, AppState>, session: NewSession, password: Option<String>) -> Result<Session, String> {
    let added = state.store.lock().unwrap().add(session).map_err(|e| e.to_string())?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        state.secrets.set(&added.id, &Secret::new(pw)).map_err(|e| format!("{e:?}"))?;
    }
    Ok(added)
}

#[tauri::command]
pub fn session_update(state: State<'_, AppState>, session: Session, password: Option<String>) -> Result<(), String> {
    let id = session.id.clone();
    state.store.lock().unwrap().update(session).map_err(|e| e.to_string())?;
    if let Some(pw) = password.filter(|p| !p.is_empty()) {
        state.secrets.set(&id, &Secret::new(pw)).map_err(|e| format!("{e:?}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn session_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.store.lock().unwrap().remove(&id).map_err(|e| e.to_string())?;
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
) -> Result<String, String> {
    let session = state
        .store
        .lock()
        .unwrap()
        .list()
        .iter()
        .find(|s| s.id == session_id)
        .cloned()
        .ok_or_else(|| "Oturum bulunamadı.".to_string())?;
    let prompt = Arc::new(TauriPrompt { app: app.clone(), pending: state.pending_prompts.clone() });
    let conn = SshConnection::connect(&session, state.secrets.as_ref(), state.hosts.clone(), prompt)
        .await
        .map_err(|e| describe(&e))?;
    let mut shell = conn.open_shell(cols, rows).await.map_err(|e| describe(&e))?;

    let tab_id = uuid::Uuid::new_v4().to_string();
    let throttle = Arc::new(Throttle::new(HIGH_WATER, LOW_WATER));
    let writer = shell.writer();
    let task = tauri::async_runtime::spawn({
        let (app, tab_id, throttle) = (app.clone(), tab_id.clone(), throttle.clone());
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
    state.tabs.lock().unwrap().insert(tab_id.clone(), Tab { writer, throttle, task });
    Ok(tab_id)
}

#[tauri::command]
pub fn hostkey_answer(state: State<'_, AppState>, request_id: String, trust: bool) {
    if let Some(tx) = state.pending_prompts.lock().unwrap().remove(&request_id) {
        let _ = tx.send(trust);
    }
}

fn tab_writer(state: &AppState, tab_id: &str) -> Result<vcore::ssh::ShellWriter, String> {
    state.tabs.lock().unwrap().get(tab_id).map(|t| t.writer.clone()).ok_or_else(|| "Sekme bulunamadı.".to_string())
}

#[tauri::command]
pub async fn shell_write(state: State<'_, AppState>, tab_id: String, data: Vec<u8>) -> Result<(), String> {
    let w = tab_writer(&state, &tab_id)?;
    w.write(&data).await.map_err(|e| describe(&e))
}

#[tauri::command]
pub async fn shell_resize(state: State<'_, AppState>, tab_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let w = tab_writer(&state, &tab_id)?;
    w.resize(cols, rows).await.map_err(|e| describe(&e))
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changed_host_key_message_shows_both_fingerprints() {
        let m = describe(&SshError::HostKeyChanged { previous: "SHA256:eski".into(), current: "SHA256:yeni".into() });
        assert!(m.contains("SHA256:eski") && m.contains("SHA256:yeni"));
    }

    #[test]
    fn auth_failure_message_never_mentions_the_password_field_value() {
        assert_eq!(describe(&SshError::AuthFailed), "Kimlik doğrulama başarısız.");
    }
}
