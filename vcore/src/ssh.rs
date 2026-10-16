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

/// Klavye etkileşimli doğrulamada sunucunun sorduğu tek bir soru.
#[derive(Debug, Clone, PartialEq)]
pub struct AuthPromptItem {
    pub text: String,
    /// `true` ise yazılan görünür olabilir (örn. kullanıcı adı); `false` ise gizlenmelidir (parola, kod).
    pub echo: bool,
}

#[async_trait]
pub trait HostKeyPrompt: Send + Sync {
    async fn decide(&self, host: &str, port: u16, fingerprint: &str, status: &HostKeyStatus) -> HostKeyDecision;

    /// Klavye etkileşimli doğrulama soruları; `None` kullanıcının vazgeçtiği anlamına gelir.
    async fn interactive(&self, _name: &str, _instructions: &str, _prompts: &[AuthPromptItem]) -> Option<Vec<String>> {
        None
    }
}

#[derive(Debug, PartialEq)]
pub enum SshError {
    HostKeyRejected,
    HostKeyChanged { previous: String, current: String },
    AuthFailed,
    Unreachable(String),
    Secret(SecretError),
    Key(String),
    PassphraseRequired,
    WrongPassphrase,
    AgentUnavailable(String),
    AuthCancelled,
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
            SshError::PassphraseRequired => write!(f, "the key is encrypted and needs a passphrase"),
            SshError::WrongPassphrase => write!(f, "the key passphrase is wrong"),
            SshError::AgentUnavailable(m) => write!(f, "ssh agent unavailable: {m}"),
            SshError::AuthCancelled => write!(f, "authentication was cancelled"),
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

/// Anahtar dosyasının parola (passphrase) ile korunup korunmadığını söyler.
pub fn key_needs_passphrase(path: &str) -> Result<bool, SshError> {
    match russh::keys::load_secret_key(path, None) {
        Ok(_) => Ok(false),
        Err(russh::keys::Error::KeyIsEncrypted) => Ok(true),
        Err(e) => Err(SshError::Key(e.to_string())),
    }
}

fn load_key(path: &str, passphrase: Option<&str>) -> Result<russh::keys::PrivateKey, SshError> {
    match russh::keys::load_secret_key(path, passphrase) {
        Ok(key) => Ok(key),
        Err(russh::keys::Error::KeyIsEncrypted) => Err(SshError::PassphraseRequired),
        Err(e) => {
            // Parola verildi ama anahtar açılmadıysa ve dosya gerçekten şifreliyse parola yanlıştır.
            if passphrase.is_some() && key_needs_passphrase(path) == Ok(true) {
                Err(SshError::WrongPassphrase)
            } else {
                Err(SshError::Key(e.to_string()))
            }
        }
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
    // Atlama sunucusu bağlantısı; bu bağlantı yaşadığı sürece açık kalmalı.
    _jump: Option<Arc<SshConnection>>,
}

impl SshConnection {
    pub async fn connect(
        session: &Session,
        secrets: &dyn SecretStore,
        hosts: Arc<Mutex<KnownHosts>>,
        prompt: Arc<dyn HostKeyPrompt>,
    ) -> Result<SshConnection, SshError> {
        let auth_prompt = prompt.clone();
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
        Self::authenticate(&mut handle, session, secrets, &*auth_prompt).await?;
        Ok(SshConnection { handle, _jump: None })
    }

    async fn authenticate(
        handle: &mut client::Handle<Handler>,
        session: &Session,
        secrets: &dyn SecretStore,
        prompt: &dyn HostKeyPrompt,
    ) -> Result<(), SshError> {
        use crate::sessions::Auth;
        let other = |e: russh::Error| SshError::Other(e.to_string());
        let user = session.user.clone();
        let result = match &session.auth {
            Auth::Password => {
                let secret = secrets
                    .get(&session.id)
                    .map_err(SshError::Secret)?
                    .ok_or_else(|| SshError::Secret(SecretError::Other("no password stored".into())))?;
                handle.authenticate_password(user.clone(), secret.expose()).await.map_err(other)?
            }
            Auth::KeyFile { path } => {
                let passphrase = secrets.get(&crate::secrets::passphrase_account(&session.id)).map_err(SshError::Secret)?;
                let key = load_key(path, passphrase.as_ref().map(|p| p.expose()))?;
                let hash = handle.best_supported_rsa_hash().await.map_err(other)?.flatten();
                handle
                    .authenticate_publickey(user.clone(), PrivateKeyWithHashAlg::new(Arc::new(key), hash))
                    .await
                    .map_err(other)?
            }
            Auth::Agent => return Self::authenticate_with_agent(handle, &user).await,
            Auth::Interactive => return Self::keyboard_interactive(handle, &user, prompt).await,
        };
        match result {
            russh::client::AuthResult::Success => Ok(()),
            // İki aşamalı doğrulama: ilk adım kabul edildi, sunucu ikinci adım olarak soru-cevap istiyor.
            russh::client::AuthResult::Failure { remaining_methods, partial_success: true }
                if remaining_methods.contains(&russh::MethodKind::KeyboardInteractive) =>
            {
                Self::keyboard_interactive(handle, &user, prompt).await
            }
            russh::client::AuthResult::Failure { .. } => Err(SshError::AuthFailed),
        }
    }

    async fn keyboard_interactive(handle: &mut client::Handle<Handler>, user: &str, prompt: &dyn HostKeyPrompt) -> Result<(), SshError> {
        use russh::client::KeyboardInteractiveAuthResponse as R;
        let other = |e: russh::Error| SshError::Other(e.to_string());
        let mut response = handle.authenticate_keyboard_interactive_start(user.to_string(), None).await.map_err(other)?;
        for _ in 0..8 {
            match response {
                R::Success => return Ok(()),
                R::Failure { .. } => return Err(SshError::AuthFailed),
                R::InfoRequest { name, instructions, prompts } => {
                    let answers = if prompts.is_empty() {
                        Vec::new()
                    } else {
                        let items: Vec<AuthPromptItem> = prompts.iter().map(|p| AuthPromptItem { text: p.prompt.clone(), echo: p.echo }).collect();
                        match prompt.interactive(&name, &instructions, &items).await {
                            Some(a) => a,
                            None => return Err(SshError::AuthCancelled),
                        }
                    };
                    response = handle.authenticate_keyboard_interactive_respond(answers).await.map_err(other)?;
                }
            }
        }
        Err(SshError::AuthFailed)
    }

    async fn authenticate_with_agent(handle: &mut client::Handle<Handler>, user: &str) -> Result<(), SshError> {
        use russh::keys::agent::{client::AgentClient, AgentIdentity};
        let unavailable = |e: russh::keys::Error| SshError::AgentUnavailable(e.to_string());
        #[cfg(unix)]
        let mut agent = AgentClient::connect_env().await.map_err(unavailable)?;
        #[cfg(windows)]
        let mut agent = AgentClient::connect_named_pipe(r"\\.\pipe\openssh-ssh-agent").await.map_err(unavailable)?;
        let identities = agent.request_identities().await.map_err(unavailable)?;
        let hash = handle.best_supported_rsa_hash().await.map_err(|e| SshError::Other(e.to_string()))?.flatten();
        for identity in identities {
            if let AgentIdentity::PublicKey { key, .. } = identity {
                if let Ok(result) = handle.authenticate_publickey_with(user.to_string(), key, hash, &mut agent).await {
                    if result.success() {
                        return Ok(());
                    }
                }
            }
        }
        Err(SshError::AuthFailed)
    }

    /// `jump` bağlantısı üzerinden (direct-tcpip) hedefe ikinci bir SSH oturumu kurar.
    pub async fn connect_via(
        jump: &Arc<SshConnection>,
        session: &Session,
        secrets: &dyn SecretStore,
        hosts: Arc<Mutex<KnownHosts>>,
        prompt: Arc<dyn HostKeyPrompt>,
    ) -> Result<SshConnection, SshError> {
        let channel = jump
            .handle
            .channel_open_direct_tcpip(session.host.clone(), u32::from(session.port), "127.0.0.1", 0)
            .await
            .map_err(|e| SshError::Unreachable(e.to_string()))?;
        let auth_prompt = prompt.clone();
        let failure = Arc::new(Mutex::new(None));
        let handler = Handler { host: session.host.clone(), port: session.port, hosts, prompt, failure: failure.clone() };
        let config = Arc::new(client::Config {
            keepalive_interval: Some(Duration::from_secs(30)),
            keepalive_max: 3,
            ..Default::default()
        });
        let mut handle = match client::connect_stream(config, channel.into_stream(), handler).await {
            Ok(h) => h,
            Err(e) => {
                let recorded = failure.lock().unwrap().take();
                return Err(recorded.unwrap_or_else(|| SshError::Unreachable(e.to_string())));
            }
        };
        Self::authenticate(&mut handle, session, secrets, &*auth_prompt).await?;
        Ok(SshConnection { handle, _jump: Some(jump.clone()) })
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

    pub async fn list_ptys(&self) -> Result<Vec<u32>, SshError> {
        Ok(crate::cwd::parse_pts_list(&self.exec("ls /dev/pts").await?))
    }

    /// Kabuk açıldıktan sonra yeni ortaya çıkan pty'yi bulur; birden fazla aday varsa (aynı anda başka
    /// biri pty açtıysa) hangisinin bizim olduğu bilinemez ve `None` döner.
    pub async fn detect_shell_pty(&self, before: &[u32]) -> Option<u32> {
        for _ in 0..8 {
            if let Ok(after) = self.list_ptys().await {
                let fresh = crate::cwd::new_ptys(before, &after);
                match fresh.as_slice() {
                    [one] => return Some(*one),
                    [] => {}
                    _ => return None,
                }
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        None
    }

    /// Verilen pty'nin kabuğunun çalışma dizini; kabuk bulunamazsa `None`.
    pub async fn shell_cwd(&self, pty: u32) -> Result<Option<String>, SshError> {
        let out = self.exec(&crate::cwd::cwd_command(pty)).await?;
        let cwd = out.trim_end_matches(['\n', '\r']);
        Ok(if cwd.is_empty() { None } else { Some(cwd.to_string()) })
    }

    pub async fn start_tunnel(self: &Arc<Self>, spec: &crate::tunnel::TunnelSpec) -> Result<crate::tunnel::TunnelHandle, crate::tunnel::TunnelError> {
        use crate::tunnel::{TunnelError, TunnelHandle};
        use std::sync::atomic::{AtomicU64, Ordering};
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", spec.listen_port())).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                TunnelError::PortInUse
            } else {
                TunnelError::Other(e.to_string())
            }
        })?;
        let local_port = listener.local_addr().map_err(|e| TunnelError::Other(e.to_string()))?.port();
        let connections = Arc::new(AtomicU64::new(0));
        let (conn, spec, counter) = (self.clone(), spec.clone(), connections.clone());
        let task = tokio::spawn(async move {
            while let Ok((socket, peer)) = listener.accept().await {
                counter.fetch_add(1, Ordering::SeqCst);
                let (conn, spec) = (conn.clone(), spec.clone());
                tokio::spawn(async move {
                    let _ = conn.serve_tunnel_client(&spec, socket, peer).await;
                });
            }
        });
        Ok(TunnelHandle::new(task, local_port, connections))
    }

    async fn open_direct(&self, host: &str, port: u16, peer: std::net::SocketAddr) -> Result<russh::ChannelStream<client::Msg>, russh::Error> {
        let channel = self
            .handle
            .channel_open_direct_tcpip(host.to_string(), u32::from(port), peer.ip().to_string(), u32::from(peer.port()))
            .await?;
        Ok(channel.into_stream())
    }

    async fn serve_tunnel_client(&self, spec: &crate::tunnel::TunnelSpec, mut socket: tokio::net::TcpStream, peer: std::net::SocketAddr) -> std::io::Result<()> {
        use crate::tunnel::{parse_socks_greeting, parse_socks_request, SocksError, TunnelSpec};
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        match spec {
            TunnelSpec::Local { dest_host, dest_port, .. } => {
                let mut stream = self.open_direct(dest_host, *dest_port, peer).await.map_err(std::io::Error::other)?;
                tokio::io::copy_bidirectional(&mut socket, &mut stream).await?;
            }
            TunnelSpec::Dynamic { .. } => {
                let mut buf: Vec<u8> = Vec::new();
                let mut chunk = [0u8; 256];
                let greeting_len = loop {
                    match parse_socks_greeting(&buf) {
                        Ok(Some((len, no_auth))) => {
                            if !no_auth {
                                socket.write_all(&[5, 0xff]).await?;
                                return Ok(());
                            }
                            break len;
                        }
                        Ok(None) => {}
                        Err(_) => return Ok(()),
                    }
                    let n = tokio::time::timeout(Duration::from_secs(10), socket.read(&mut chunk)).await??;
                    if n == 0 || buf.len() > 512 {
                        return Ok(());
                    }
                    buf.extend_from_slice(&chunk[..n]);
                };
                socket.write_all(&[5, 0]).await?;
                buf.drain(..greeting_len);
                let (host, port) = loop {
                    match parse_socks_request(&buf) {
                        Ok(Some((_, host, port))) => break (host, port),
                        Ok(None) => {}
                        Err(e) => {
                            let code = if e == SocksError::UnsupportedCommand { 7 } else { 8 };
                            socket.write_all(&[5, code, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
                            return Ok(());
                        }
                    }
                    let n = tokio::time::timeout(Duration::from_secs(10), socket.read(&mut chunk)).await??;
                    if n == 0 || buf.len() > 512 {
                        return Ok(());
                    }
                    buf.extend_from_slice(&chunk[..n]);
                };
                match self.open_direct(&host, port, peer).await {
                    Ok(mut stream) => {
                        socket.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
                        tokio::io::copy_bidirectional(&mut socket, &mut stream).await?;
                    }
                    Err(_) => {
                        socket.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
                    }
                }
            }
        }
        Ok(())
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
