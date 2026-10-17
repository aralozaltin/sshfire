<p align="center"><img src="assets/icon-256.png" alt="SSHFire" width="128"></p>

<h1 align="center">SSHFire</h1>

A fast, lightweight desktop SSH client in the spirit of MobaXterm: saved servers, tabbed terminals, an SFTP file panel that follows your shell, and live server metrics, all in one small app.

Built with Tauri 2, React and xterm.js on top of a Rust core ([`russh`](https://github.com/Eugeny/russh)).

![SSHFire: terminal, file panel and live server metrics](docs/screenshots/main.png)

## Features

**Connections**
- Saved server list with folders and search; double-click to connect, or type `user@host:port` in Quick connect (⌘K, Ctrl+Shift+K)
- Password, key file (including passphrase-protected keys), SSH agent and keyboard-interactive (two-factor) authentication
- Jump hosts (bastions), host key verification (trust on first use, refuses changed keys)
- Passwords and key passphrases live in the OS key store (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in files
- Import hosts from `~/.ssh/config` (including `ProxyJump`), export and import the server list as JSON (passwords are never exported)
- Optional command to run on connect, color labels for servers (shown in the list and on tabs), local terminal tab

**Terminal**
- Tabs plus side-by-side, stacked and grid layouts, with keyboard shortcuts (macOS: ⌘T new local terminal, ⌘W close, ⌘1-9 jump, ⌘⇧[ ⌘⇧] cycle; Windows/Linux: Ctrl+Shift+T / Ctrl+Shift+W, Alt+1-9, Ctrl+Tab)
- Copy/paste, zoom, search, clickable links (Cmd/Ctrl + click, http/https only)
- MultiExec (type once, send to several tabs), macros you can write or record
- Live metrics bar: CPU, memory, disk, load, uptime, network (Linux servers)
- Record a session to a plain-text log file
- Color schemes: Dracula, Nord, Solarized Dark, Tokyo Night, Gruvbox

**Files**
- SFTP panel that follows the shell's working directory
- Copy, cut, paste, drag-and-drop move/copy, inline rename, upload/download with progress and cancel, drag files in from the OS
- Built-in text editor for remote files (Ctrl/Cmd+S saves), or open a file in your default editor and have it uploaded back on every save
- Change permissions (rwx boxes or octal), filter the listing by name

**Tunnels**
- Local (`-L`), SOCKS5 dynamic (`-D`) and remote (`-R`) port forwarding, saved per server

**Interface**
- Light and dark theme, English and Turkish, resizable sidebar and columns

## Screenshots

**Servers organised in folders, with a live metrics bar under the terminal**

![Server list with folders next to a terminal](docs/screenshots/servers.png)

**Side-by-side terminals**

![Side-by-side terminals with live metrics](docs/screenshots/split.png)

## Platforms

macOS, Windows and Linux. Release builds for all three are produced by GitHub Actions.

## Install

Pick the line that matches your computer. These links always point to the newest version.

| Your system | Download |
|---|---|
| **macOS**, Apple Silicon (M1 or newer) | [SSHFire-macOS-AppleSilicon.dmg](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-macOS-AppleSilicon.dmg) |
| **macOS**, Intel | [SSHFire-macOS-Intel.dmg](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-macOS-Intel.dmg) |
| **Windows** 10/11 | [SSHFire-Windows-x64-setup.exe](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-Windows-x64-setup.exe) |
| **Linux** | [SSHFire-Linux-x64.AppImage](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-Linux-x64.AppImage) (runs on any distribution) |

<details>
<summary>Other formats</summary>

- Ubuntu / Debian package: [SSHFire-Linux-x64.deb](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-Linux-x64.deb) (`sudo apt install ./SSHFire-Linux-x64.deb`)
- Fedora / RHEL package: [SSHFire-Linux-x64.rpm](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-Linux-x64.rpm)
- Windows MSI for IT deployment: [SSHFire-Windows-x64.msi](https://github.com/aralozaltin/sshfire/releases/latest/download/SSHFire-Windows-x64.msi)

</details>

Not sure which Mac you have? Apple menu → *About This Mac*: a chip named M1, M2 or similar means Apple Silicon, otherwise Intel. Everything else on the [releases page](https://github.com/aralozaltin/sshfire/releases/latest) (`.sig`, `.tar.gz`, `.json`) is used by the in-app updater; you do not need it.

On macOS you can also use Homebrew, which skips the first-launch confirmation:

```bash
brew tap aralozaltin/sshfire https://github.com/aralozaltin/sshfire && brew install --cask aralozaltin/sshfire/sshfire
```

On first launch your system may ask you to confirm an app downloaded from the internet:

- **macOS:** open *System Settings → Privacy & Security* and choose *Open Anyway*, or run `xattr -dr com.apple.quarantine /Applications/SSHFire.app` once.
- **Windows:** in the SmartScreen dialog choose *More info → Run anyway*.

From then on SSHFire keeps itself up to date: it checks for new releases on startup (switch this off or check manually in *Settings*). Updates are downloaded over HTTPS and verified against a built-in public key before they are installed.

## Getting started

Requirements: Node.js, Rust (`rustup`) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
npm install            # .npmrc enables legacy-peer-deps
npm run tauri dev      # run in development
npm run tauri build    # production bundle
```

## Tests

```bash
cargo test --workspace             # Rust core and Tauri layer
npm test                           # interface tests (Vitest)
vcore/tests/docker/up.sh           # local OpenSSH test server on 127.0.0.1:2222
cargo test -p vcore -- --ignored   # tests that touch the real OS key store (manual)
```

The SSH, SFTP, tunnel and authentication integration tests run against a throwaway OpenSSH container and are skipped when it is not running. The test credentials in `vcore/tests/docker/` belong to that container only.

## Project layout

- `vcore/`: UI-independent Rust library (sessions, secrets, known hosts, SSH, SFTP, tunnels, metrics, `~/.ssh/config` parser)
- `src-tauri/`: Tauri commands, local terminal, transfer and streaming back-pressure
- `src/`: React interface

## License

[MIT](LICENSE)
