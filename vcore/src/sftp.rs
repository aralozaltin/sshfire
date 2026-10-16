use crate::shellquote::shell_quote;
use crate::ssh::SshConnection;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::StatusCode;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<i64>,
    pub permissions: Option<u32>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> CancelToken {
        CancelToken::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Debug, PartialEq)]
pub enum SftpError {
    NotFound,
    PermissionDenied,
    Exists,
    Cancelled,
    TooLarge,
    Other(String),
}

impl std::fmt::Display for SftpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SftpError::NotFound => write!(f, "not found"),
            SftpError::PermissionDenied => write!(f, "permission denied"),
            SftpError::Exists => write!(f, "already exists"),
            SftpError::Cancelled => write!(f, "cancelled"),
            SftpError::TooLarge => write!(f, "file is too large"),
            SftpError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for SftpError {}

pub type Progress<'a> = &'a mut (dyn FnMut(u64, u64) + Send);

pub struct SftpClient {
    session: SftpSession,
}

fn map_err(e: russh_sftp::client::error::Error) -> SftpError {
    use russh_sftp::client::error::Error;
    match &e {
        Error::Status(s) => match s.status_code {
            StatusCode::NoSuchFile => SftpError::NotFound,
            StatusCode::PermissionDenied => SftpError::PermissionDenied,
            _ => SftpError::Other(e.to_string()),
        },
        _ => SftpError::Other(e.to_string()),
    }
}

fn io_err(e: std::io::Error) -> SftpError {
    match e.kind() {
        std::io::ErrorKind::NotFound => SftpError::NotFound,
        std::io::ErrorKind::PermissionDenied => SftpError::PermissionDenied,
        std::io::ErrorKind::AlreadyExists => SftpError::Exists,
        _ => SftpError::Other(e.to_string()),
    }
}

fn base_name(path: &str) -> String {
    path.trim_end_matches('/').rsplit('/').next().unwrap_or(path).to_string()
}

fn entry_from(name: String, path: String, md: &russh_sftp::protocol::FileAttributes, target: Option<&russh_sftp::protocol::FileAttributes>) -> FileEntry {
    let shown = target.unwrap_or(md);
    FileEntry {
        name,
        path,
        is_dir: shown.is_dir(),
        is_symlink: md.is_symlink(),
        size: shown.len(),
        modified: shown.mtime.map(i64::from),
        permissions: shown.permissions.map(|p| p & 0o7777),
        owner: shown.user.clone().or(shown.uid.map(|u| u.to_string())),
        group: shown.group.clone().or(shown.gid.map(|g| g.to_string())),
    }
}

fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

struct PlanItem {
    local: PathBuf,
    remote: String,
    is_dir: bool,
    size: u64,
}

const CHUNK: usize = 256 * 1024;

impl SftpClient {
    pub async fn open(conn: &SshConnection) -> Result<SftpClient, SftpError> {
        let channel = conn.open_sftp_channel().await.map_err(|e| SftpError::Other(e.to_string()))?;
        let session = SftpSession::new(channel.into_stream()).await.map_err(map_err)?;
        Ok(SftpClient { session })
    }

    pub async fn home_dir(&self) -> Result<String, SftpError> {
        self.session.canonicalize(".").await.map_err(map_err)
    }

    pub async fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, SftpError> {
        let mut entries = Vec::new();
        for item in self.session.read_dir(path).await.map_err(map_err)? {
            let name = item.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let md = item.metadata();
            let full = item.path();
            let target = if md.is_symlink() { self.session.metadata(full.clone()).await.ok() } else { None };
            entries.push(entry_from(name, full, &md, target.as_ref()));
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }

    pub async fn stat(&self, path: &str) -> Result<FileEntry, SftpError> {
        let md = self.session.metadata(path.to_string()).await.map_err(map_err)?;
        Ok(entry_from(base_name(path), path.to_string(), &md, None))
    }

    pub async fn mkdir(&self, path: &str) -> Result<(), SftpError> {
        match self.session.create_dir(path.to_string()).await {
            Ok(()) => Ok(()),
            Err(e) => {
                if self.session.try_exists(path.to_string()).await.unwrap_or(false) {
                    Err(SftpError::Exists)
                } else {
                    Err(map_err(e))
                }
            }
        }
    }

    pub async fn rename(&self, from: &str, to: &str) -> Result<(), SftpError> {
        match self.session.rename(from.to_string(), to.to_string()).await {
            Ok(()) => Ok(()),
            Err(e) => {
                if self.session.try_exists(to.to_string()).await.unwrap_or(false) {
                    Err(SftpError::Exists)
                } else {
                    Err(map_err(e))
                }
            }
        }
    }

    pub async fn remove(&self, path: &str, recursive: bool) -> Result<(), SftpError> {
        let md = self.session.symlink_metadata(path.to_string()).await.map_err(map_err)?;
        if !md.is_dir() {
            return self.session.remove_file(path.to_string()).await.map_err(map_err);
        }
        if recursive {
            self.remove_tree(path.to_string()).await
        } else {
            self.session.remove_dir(path.to_string()).await.map_err(map_err)
        }
    }

    fn remove_tree<'a>(&'a self, dir: String) -> Pin<Box<dyn Future<Output = Result<(), SftpError>> + Send + 'a>> {
        Box::pin(async move {
            for item in self.session.read_dir(dir.clone()).await.map_err(map_err)? {
                let name = item.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let child = item.path();
                if item.metadata().is_dir() && !item.metadata().is_symlink() {
                    self.remove_tree(child).await?;
                } else {
                    self.session.remove_file(child).await.map_err(map_err)?;
                }
            }
            self.session.remove_dir(dir).await.map_err(map_err)
        })
    }

    pub async fn read_file(&self, path: &str, max_bytes: u64) -> Result<Vec<u8>, SftpError> {
        let md = self.session.metadata(path.to_string()).await.map_err(map_err)?;
        if md.len() > max_bytes {
            return Err(SftpError::TooLarge);
        }
        let mut file = self.session.open(path.to_string()).await.map_err(map_err)?;
        let mut out = Vec::new();
        // Boyut yalan söylemiş olabilir; sınırı okurken de uygula.
        (&mut file).take(max_bytes + 1).read_to_end(&mut out).await.map_err(io_err)?;
        if out.len() as u64 > max_bytes {
            return Err(SftpError::TooLarge);
        }
        Ok(out)
    }

    /// Mevcut dosyanın üzerine yazar (izin ve sahiplik korunur, çünkü dosya yeniden oluşturulmaz).
    pub async fn write_file(&self, path: &str, data: &[u8]) -> Result<(), SftpError> {
        let mut file = self.session.create(path.to_string()).await.map_err(map_err)?;
        file.write_all(data).await.map_err(io_err)?;
        file.shutdown().await.map_err(io_err)
    }

    pub async fn upload(&self, local: &Path, remote: &str, progress: Progress<'_>, cancel: &CancelToken) -> Result<(), SftpError> {
        let mut plan = Vec::new();
        plan_local(local, remote, &mut plan).map_err(io_err)?;
        let total: u64 = plan.iter().map(|p| p.size).sum();
        let mut done = 0u64;
        progress(0, total);
        for item in &plan {
            if cancel.is_cancelled() {
                return Err(SftpError::Cancelled);
            }
            if item.is_dir {
                match self.mkdir(&item.remote).await {
                    Ok(()) | Err(SftpError::Exists) => {}
                    Err(e) => return Err(e),
                }
                continue;
            }
            let mut src = tokio::fs::File::open(&item.local).await.map_err(io_err)?;
            let mut dst = self.session.create(item.remote.clone()).await.map_err(map_err)?;
            let mut buf = vec![0u8; CHUNK];
            let outcome: Result<(), SftpError> = async {
                loop {
                    if cancel.is_cancelled() {
                        return Err(SftpError::Cancelled);
                    }
                    let n = src.read(&mut buf).await.map_err(io_err)?;
                    if n == 0 {
                        break;
                    }
                    dst.write_all(&buf[..n]).await.map_err(io_err)?;
                    done += n as u64;
                    progress(done, total);
                }
                dst.shutdown().await.map_err(io_err)
            }
            .await;
            if let Err(e) = outcome {
                drop(dst);
                let _ = self.session.remove_file(item.remote.clone()).await;
                return Err(e);
            }
            progress(done, total);
        }
        Ok(())
    }

    pub async fn download(&self, remote: &str, local: &Path, progress: Progress<'_>, cancel: &CancelToken) -> Result<(), SftpError> {
        let mut plan = Vec::new();
        self.plan_remote(remote.to_string(), local.to_path_buf(), &mut plan).await?;
        let total: u64 = plan.iter().map(|p| p.size).sum();
        let mut done = 0u64;
        progress(0, total);
        for item in &plan {
            if cancel.is_cancelled() {
                return Err(SftpError::Cancelled);
            }
            if item.is_dir {
                tokio::fs::create_dir_all(&item.local).await.map_err(io_err)?;
                continue;
            }
            if let Some(parent) = item.local.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(io_err)?;
            }
            let mut src = self.session.open(item.remote.clone()).await.map_err(map_err)?;
            let mut dst = tokio::fs::File::create(&item.local).await.map_err(io_err)?;
            let mut buf = vec![0u8; CHUNK];
            let outcome: Result<(), SftpError> = async {
                loop {
                    if cancel.is_cancelled() {
                        return Err(SftpError::Cancelled);
                    }
                    let n = src.read(&mut buf).await.map_err(io_err)?;
                    if n == 0 {
                        break;
                    }
                    dst.write_all(&buf[..n]).await.map_err(io_err)?;
                    done += n as u64;
                    progress(done, total);
                }
                dst.flush().await.map_err(io_err)
            }
            .await;
            if let Err(e) = outcome {
                drop(dst);
                let _ = tokio::fs::remove_file(&item.local).await;
                return Err(e);
            }
            progress(done, total);
        }
        Ok(())
    }

    fn plan_remote<'a>(&'a self, remote: String, local: PathBuf, out: &'a mut Vec<PlanItem>) -> Pin<Box<dyn Future<Output = Result<(), SftpError>> + Send + 'a>> {
        Box::pin(async move {
            let md = self.session.metadata(remote.clone()).await.map_err(map_err)?;
            if !md.is_dir() {
                out.push(PlanItem { local, remote, is_dir: false, size: md.len() });
                return Ok(());
            }
            out.push(PlanItem { local: local.clone(), remote: remote.clone(), is_dir: true, size: 0 });
            for item in self.session.read_dir(remote.clone()).await.map_err(map_err)? {
                let name = item.file_name();
                if name == "." || name == ".." || item.metadata().is_symlink() {
                    continue;
                }
                self.plan_remote(item.path(), local.join(&name), out).await?;
            }
            Ok(())
        })
    }
}

fn plan_local(local: &Path, remote: &str, out: &mut Vec<PlanItem>) -> std::io::Result<()> {
    let md = std::fs::symlink_metadata(local)?;
    if md.is_dir() {
        out.push(PlanItem { local: local.to_path_buf(), remote: remote.to_string(), is_dir: true, size: 0 });
        let mut children: Vec<_> = std::fs::read_dir(local)?.collect::<Result<_, _>>()?;
        children.sort_by_key(|c| c.file_name());
        for child in children {
            plan_local(&child.path(), &join(remote, &child.file_name().to_string_lossy()), out)?;
        }
    } else if md.is_file() {
        out.push(PlanItem { local: local.to_path_buf(), remote: remote.to_string(), is_dir: false, size: md.len() });
    }
    Ok(())
}

pub async fn copy_remote(conn: &SshConnection, from: &str, to: &str) -> Result<(), SftpError> {
    let command = format!("cp -rp -- {} {}", shell_quote(from), shell_quote(to));
    conn.exec(&command).await.map(|_| ()).map_err(|e| SftpError::Other(e.to_string()))
}
