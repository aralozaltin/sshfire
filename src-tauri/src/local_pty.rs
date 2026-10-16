use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;
use tokio::sync::mpsc;

/// Yerel bir kabuk süreci ve sahte terminali (MobaXterm'deki "yerel terminal").
pub struct LocalPty {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    pub output: tokio::sync::Mutex<mpsc::Receiver<Vec<u8>>>,
}

/// Platformun varsayılan kabuğu: `$SHELL` ya da macOS/Linux'ta `/bin/sh`, Windows'ta PowerShell.
pub fn default_shell() -> String {
    if cfg!(windows) {
        return "powershell.exe".into();
    }
    std::env::var("SHELL").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "/bin/sh".into())
}

impl LocalPty {
    pub fn spawn(shell: &str, cols: u16, rows: u16) -> Result<LocalPty, String> {
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
        let mut cmd = CommandBuilder::new(shell);
        cmd.env("TERM", "xterm-256color");
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            cmd.cwd(home);
        }
        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let (tx, rx) = mpsc::channel::<Vec<u8>>(64);
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.blocking_send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });
        Ok(LocalPty {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
            output: tokio::sync::Mutex::new(rx),
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut w = self.writer.lock().unwrap();
        w.write_all(data).and_then(|_| w.flush()).map_err(|e| e.to_string())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .lock()
            .unwrap()
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&self) {
        let _ = self.child.lock().unwrap().kill();
    }
}

impl Drop for LocalPty {
    fn drop(&mut self) {
        self.kill();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::time::Duration;

    async fn read_until(pty: &LocalPty, needle: &str) -> String {
        let mut out = String::new();
        let mut rx = pty.output.lock().await;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        while !out.contains(needle) {
            let chunk = tokio::time::timeout_at(deadline, rx.recv()).await.expect("timeout").expect("pty closed");
            out.push_str(&String::from_utf8_lossy(&chunk));
        }
        out
    }

    #[test]
    fn the_default_shell_is_never_empty() {
        assert!(!default_shell().is_empty());
    }

    #[tokio::test]
    async fn a_local_shell_runs_commands_and_returns_output() {
        let pty = LocalPty::spawn("/bin/sh", 80, 24).unwrap();
        pty.write(b"echo local-$((6*7))\n").unwrap();
        assert!(read_until(&pty, "local-42").await.contains("local-42"));
        pty.kill();
    }

    #[tokio::test]
    async fn resizing_changes_the_terminal_size_the_shell_sees() {
        let pty = LocalPty::spawn("/bin/sh", 80, 24).unwrap();
        pty.resize(120, 40).unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;
        pty.write(b"stty size\n").unwrap();
        assert!(read_until(&pty, "40 120").await.contains("40 120"));
        pty.kill();
    }

    #[tokio::test]
    async fn the_output_channel_ends_when_the_shell_exits() {
        let pty = LocalPty::spawn("/bin/sh", 80, 24).unwrap();
        pty.write(b"exit\n").unwrap();
        let mut rx = pty.output.lock().await;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        loop {
            match tokio::time::timeout_at(deadline, rx.recv()).await.expect("timeout waiting for close") {
                Some(_) => continue,
                None => break,
            }
        }
    }

    #[test]
    fn spawning_a_missing_shell_is_an_error_not_a_panic() {
        assert!(LocalPty::spawn("/yok/boyle/kabuk", 80, 24).is_err());
    }
}
