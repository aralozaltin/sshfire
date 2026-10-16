use crate::known_hosts::{HostKeyStatus, KnownHosts};
use crate::secrets::{SecretError, SecretStore};
use crate::sessions::Session;
use async_trait::async_trait;
use russh::client;
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::ChannelMsg;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum HostKeyDecision {
    Trust,
    Reject,
}

#[async_trait]
pub trait HostKeyPrompt: Send + Sync {
    async fn decide(&self, host: &str, port: u16, fingerprint: &str, status: &HostKeyStatus) -> HostKeyDecision;
}

#[derive(Debug, PartialEq)]
pub enum SshError {
    HostKeyRejected,
    HostKeyChanged { previous: String, current: String },
    AuthFailed,
    Unreachable(String),
    Secret(SecretError),
    Key(String),
    Other(String),
}

impl std::fmt::Display for SshError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SshError::HostKeyRejected => write!(f, "host key rejected"),
            SshError::HostKeyChanged { previous, current } => {
                write!(f, "host key changed (saved {previous}, received {current})")
            }
            SshError::AuthFailed => write!(f, "authentication failed"),
            SshError::Unreachable(m) => write!(f, "unreachable: {m}"),
            SshError::Secret(_) => write!(f, "key store error"),
            SshError::Key(m) => write!(f, "key file error: {m}"),
            SshError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for SshError {}

#[derive(Debug, PartialEq)]
pub enum ShellEvent {
    Data(Vec<u8>),
    Closed { reason: Option<String> },
}

enum Cmd {
    Write(Vec<u8>),
    Resize(u16, u16),
}

#[derive(Clone)]
pub struct ShellWriter {
    cmds: mpsc::Sender<Cmd>,
}

impl ShellWriter {
    pub async fn write(&self, data: &[u8]) -> Result<(), SshError> {
        self.send(Cmd::Write(data.to_vec())).await
    }

    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), SshError> {
        self.send(Cmd::Resize(cols, rows)).await
    }

    async fn send(&self, cmd: Cmd) -> Result<(), SshError> {
        self.cmds.send(cmd).await.map_err(|_| SshError::Other("shell is closed".into()))
    }
}

pub struct ShellChannel {
    writer: ShellWriter,
    events: mpsc::Receiver<ShellEvent>,
}

impl ShellChannel {
    pub fn writer(&self) -> ShellWriter {
        self.writer.clone()
    }

    pub async fn write(&self, data: &[u8]) -> Result<(), SshError> {
        self.writer.write(data).await
    }

    pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), SshError> {
        self.writer.resize(cols, rows).await
    }

    pub async fn read(&mut self) -> Option<ShellEvent> {
        self.events.recv().await
    }
}

struct Handler {
    host: String,
    port: u16,
    hosts: Arc<Mutex<KnownHosts>>,
    prompt: Arc<dyn HostKeyPrompt>,
    failure: Arc<Mutex<Option<SshError>>>,
}

impl Handler {
    fn fail(&self, e: SshError) -> Result<bool, russh::Error> {
        *self.failure.lock().unwrap() = Some(e);
        Ok(false)
    }
}

impl client::Handler for Handler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let PublicKeyOrCertificate::PublicKey { key, .. } = key else {
            return self.fail(SshError::Other("certificate host keys are not supported".into()));
        };
        let fingerprint = key.fingerprint(HashAlg::Sha256).to_string();
        let status = self.hosts.lock().unwrap().check(&self.host, self.port, &fingerprint);
        match status {
            HostKeyStatus::Trusted => Ok(true),
            HostKeyStatus::Changed { previous } => {
                self.fail(SshError::HostKeyChanged { previous, current: fingerprint })
            }
            HostKeyStatus::Unknown => {
                match self.prompt.decide(&self.host, self.port, &fingerprint, &status).await {
                    HostKeyDecision::Reject => self.fail(SshError::HostKeyRejected),
                    HostKeyDecision::Trust => {
                        let saved = self.hosts.lock().unwrap().trust(&self.host, self.port, &fingerprint);
                        match saved {
                            Ok(()) => Ok(true),
                            Err(e) => self.fail(SshError::Other(e.to_string())),
                        }
                    }
                }
            }
        }
    }
}

pub struct SshConnection {
    handle: client::Handle<Handler>,
}

impl SshConnection {
    pub async fn connect(
        session: &Session,
        secrets: &dyn SecretStore,
        hosts: Arc<Mutex<KnownHosts>>,
        prompt: Arc<dyn HostKeyPrompt>,
    ) -> Result<SshConnection, SshError> {
        let failure = Arc::new(Mutex::new(None));
        let handler = Handler {
            host: session.host.clone(),
            port: session.port,
            hosts,
            prompt,
            failure: failure.clone(),
        };
        let config = Arc::new(client::Config {
            keepalive_interval: Some(Duration::from_secs(30)),
            keepalive_max: 3,
            ..Default::default()
        });
        let connected = client::connect(config, (session.host.as_str(), session.port), handler).await;
        let mut handle = match connected {
            Ok(h) => h,
            Err(e) => {
                let recorded = failure.lock().unwrap().take();
                return Err(recorded.unwrap_or_else(|| SshError::Unreachable(e.to_string())));
            }
        };
        let authenticated = match &session.auth {
            crate::sessions::Auth::Password => {
                let secret = secrets
                    .get(&session.id)
                    .map_err(SshError::Secret)?
                    .ok_or_else(|| SshError::Secret(SecretError::Other("no password stored".into())))?;
                handle
                    .authenticate_password(session.user.clone(), secret.expose())
                    .await
                    .map_err(|e| SshError::Other(e.to_string()))?
            }
            crate::sessions::Auth::KeyFile { path } => {
                let key = russh::keys::load_secret_key(path, None).map_err(|e| SshError::Key(e.to_string()))?;
                let hash = handle
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| SshError::Other(e.to_string()))?
                    .flatten();
                handle
                    .authenticate_publickey(session.user.clone(), PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                    .await
                    .map_err(|e| SshError::Other(e.to_string()))?
            }
        };
        if !authenticated.success() {
            return Err(SshError::AuthFailed);
        }
        Ok(SshConnection { handle })
    }

    pub async fn exec(&self, command: &str) -> Result<String, SshError> {
        let other = |e: russh::Error| SshError::Other(e.to_string());
        let mut channel = self.handle.channel_open_session().await.map_err(other)?;
        channel.exec(true, command).await.map_err(other)?;
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let mut status: Option<u32> = None;
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => out.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => err.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status } => status = Some(exit_status),
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        match status {
            Some(0) => Ok(String::from_utf8_lossy(&out).into_owned()),
            Some(code) => Err(SshError::Other(format!(
                "command exited with {code}: {}",
                String::from_utf8_lossy(&err).trim()
            ))),
            None => Err(SshError::Other("connection closed before the command finished".into())),
        }
    }

    pub(crate) async fn open_sftp_channel(&self) -> Result<russh::Channel<client::Msg>, SshError> {
        let other = |e: russh::Error| SshError::Other(e.to_string());
        let channel = self.handle.channel_open_session().await.map_err(other)?;
        channel.request_subsystem(true, "sftp").await.map_err(other)?;
        Ok(channel)
    }

    pub async fn open_shell(&self, cols: u16, rows: u16) -> Result<ShellChannel, SshError> {
        let other = |e: russh::Error| SshError::Other(e.to_string());
        let mut channel = self.handle.channel_open_session().await.map_err(other)?;
        channel
            .request_pty(false, "xterm-256color", cols as u32, rows as u32, 0, 0, &[])
            .await
            .map_err(other)?;
        channel.request_shell(false).await.map_err(other)?;

        let (cmd_tx, mut cmd_rx) = mpsc::channel::<Cmd>(64);
        let (ev_tx, ev_rx) = mpsc::channel::<ShellEvent>(64);
        tokio::spawn(async move {
            let mut reason: Option<String> = None;
            loop {
                tokio::select! {
                    cmd = cmd_rx.recv() => match cmd {
                        Some(Cmd::Write(data)) => {
                            if channel.data(&data[..]).await.is_err() { break; }
                        }
                        Some(Cmd::Resize(c, r)) => {
                            if channel.window_change(c as u32, r as u32, 0, 0).await.is_err() { break; }
                        }
                        None => {
                            let _ = channel.close().await;
                            return;
                        }
                    },
                    msg = channel.wait() => match msg {
                        Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                            if ev_tx.send(ShellEvent::Data(data.to_vec())).await.is_err() { return; }
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            reason = Some(format!("exit:{exit_status}"));
                        }
                        // Eof ile Close arasında ExitStatus gelebilir; yalnızca Close'ta çıkılır.
                        Some(ChannelMsg::Close) | None => break,
                        _ => {}
                    },
                }
            }
            let _ = ev_tx.send(ShellEvent::Closed { reason }).await;
        });
        Ok(ShellChannel { writer: ShellWriter { cmds: cmd_tx }, events: ev_rx })
    }
}
