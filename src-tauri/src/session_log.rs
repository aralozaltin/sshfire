use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

/// Terminal çıktısından renk/imleç gibi kaçış dizilerini ayıklar; dizi iki parçaya bölünse bile çalışır.
#[derive(Default)]
pub struct AnsiStripper {
    state: State,
}

#[derive(Default, Clone, Copy, PartialEq)]
enum State {
    #[default]
    Text,
    Esc,
    Csi,
    Osc,
    OscEsc,
    CrPending,
}

impl AnsiStripper {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(bytes.len());
        for &b in bytes {
            // Bekleyen \r: ardından \n gelirse tek satır sonu, aksi halde satır sonu sayılır.
            if self.state == State::CrPending {
                self.state = State::Text;
                out.push(b'\n');
                if b == b'\n' {
                    continue;
                }
            }
            match self.state {
                State::Text => match b {
                    0x1b => self.state = State::Esc,
                    b'\r' => self.state = State::CrPending,
                    0x07 => {}
                    _ => out.push(b),
                },
                State::Esc => {
                    self.state = match b {
                        b'[' => State::Csi,
                        b']' => State::Osc,
                        // İki baytlık diziler (ESC = , ESC > …) burada biter.
                        _ => State::Text,
                    };
                }
                State::Csi => {
                    if (0x40..=0x7e).contains(&b) {
                        self.state = State::Text;
                    }
                }
                State::Osc => match b {
                    0x07 => self.state = State::Text,
                    0x1b => self.state = State::OscEsc,
                    _ => {}
                },
                State::OscEsc => self.state = State::Text,
                State::CrPending => unreachable!("handled above"),
            }
        }
        out
    }
}

/// Bir sekmenin günlük dosyası; kapalıyken yazılanlar yok sayılır.
#[derive(Default)]
pub struct LogSink {
    inner: Mutex<Option<(File, AnsiStripper)>>,
}

impl LogSink {
    /// Günlüğü başlatır (dosya yoksa oluşturulur, varsa sonuna eklenir).
    pub fn start(&self, path: &Path) -> std::io::Result<()> {
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        *self.inner.lock().unwrap() = Some((file, AnsiStripper::default()));
        Ok(())
    }

    pub fn write(&self, bytes: &[u8]) {
        let mut guard = self.inner.lock().unwrap();
        if let Some((file, stripper)) = guard.as_mut() {
            let clean = stripper.feed(bytes);
            if !clean.is_empty() && file.write_all(&clean).is_err() {
                // Disk dolu ya da dosya kaldırıldı: günlük sessizce kapanır, terminal etkilenmez.
                *guard = None;
            }
        }
    }

    pub fn stop(&self) {
        if let Some((mut file, mut stripper)) = self.inner.lock().unwrap().take() {
            let _ = file.write_all(&stripper.feed(b""));
            let _ = file.flush();
        }
    }

    pub fn is_active(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strip(chunks: &[&[u8]]) -> String {
        let mut s = AnsiStripper::default();
        let mut out = Vec::new();
        for c in chunks {
            out.extend(s.feed(c));
        }
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn plain_text_passes_through_and_crlf_becomes_lf() {
        assert_eq!(strip(&[b"merhaba\r\ndunya\r\n"]), "merhaba\ndunya\n");
        assert_eq!(strip(&["şğü ı\n".as_bytes()]), "şğü ı\n");
    }

    #[test]
    fn colors_and_cursor_sequences_are_removed() {
        assert_eq!(strip(&[b"\x1b[31mhata\x1b[0m ok"]), "hata ok");
        assert_eq!(strip(&[b"a\x1b[2K\x1b[1;32mb\x1b[Hc"]), "abc");
        assert_eq!(strip(&[b"\x1b[?2004hprompt$ \x1b[?2004l"]), "prompt$ ");
    }

    #[test]
    fn title_sequences_ending_with_bel_or_st_are_removed() {
        assert_eq!(strip(&[b"\x1b]0;user@host: ~\x07$ ls"]), "$ ls");
        assert_eq!(strip(&[b"\x1b]7;file:///tmp\x1b\\x"]), "x");
    }

    #[test]
    fn sequences_split_across_chunks_are_still_removed() {
        assert_eq!(strip(&[b"ab\x1b", b"[3", b"1mcd"]), "abcd");
        assert_eq!(strip(&[b"x\x1b]0;ti", b"tle\x07y"]), "xy");
        assert_eq!(strip(&[b"line\r", b"\nnext"]), "line\nnext");
    }

    #[test]
    fn two_byte_escapes_and_bells_are_dropped_but_tabs_and_newlines_stay() {
        assert_eq!(strip(&[b"a\x1b=b\x1b>c\x07d\te\n"]), "abcd\te\n");
    }

    #[test]
    fn a_lone_carriage_return_is_kept_as_a_line_break_so_progress_output_stays_readable() {
        assert_eq!(strip(&[b"10%\r20%\r30%\n"]), "10%\n20%\n30%\n");
    }

    #[test]
    fn the_sink_writes_stripped_text_only_while_active() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.log");
        let sink = LogSink::default();
        sink.write(b"ignored");
        assert!(!sink.is_active());
        sink.start(&path).unwrap();
        assert!(sink.is_active());
        sink.write(b"\x1b[32mtamam\x1b[0m\r\n");
        sink.stop();
        sink.write(b"after stop");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "tamam\n");
    }

    #[test]
    fn restarting_appends_to_the_same_file_and_a_bad_path_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.log");
        let sink = LogSink::default();
        sink.start(&path).unwrap();
        sink.write(b"bir\n");
        sink.stop();
        sink.start(&path).unwrap();
        sink.write(b"iki\n");
        sink.stop();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "bir\niki\n");
        assert!(sink.start(&dir.path().join("yok/boyle/dizin/a.log")).is_err());
        assert!(!sink.is_active());
    }
}
