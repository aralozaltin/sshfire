import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { TransferEvent } from "./files/transfers";
import type { FileEntry } from "./files/types";
import type { Metrics } from "./metrics/types";
import { LOCAL_SESSION_ID, type NewSession, type RunningTunnel, type Session, type TunnelSpec } from "./types";

export const listSessions = () => invoke<Session[]>("sessions_list");
export interface StartupWarning {
  code: "sessions_corrupt" | "hosts_corrupt";
  backup: string;
}
export const startupWarning = () => invoke<StartupWarning[]>("startup_warning");

export const addSession = (session: NewSession, password?: string) =>
  invoke<Session>("session_add", { session, password: password ?? null });

export const updateSession = (session: Session, password?: string) =>
  invoke<void>("session_update", { session, password: password ?? null });

export const removeSession = (id: string) => invoke<void>("session_remove", { id });

export function connect(sessionId: string, cols: number, rows: number, onData: (bytes: Uint8Array) => void) {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = (buf) => onData(new Uint8Array(buf));
  if (sessionId === LOCAL_SESSION_ID) return invoke<string>("local_connect", { cols, rows, onData: channel });
  return invoke<string>("connect", { sessionId, cols, rows, onData: channel });
}

export const shellWrite = (tabId: string, data: Uint8Array) =>
  invoke<void>("shell_write", { tabId, data: Array.from(data) });
export const shellResize = (tabId: string, cols: number, rows: number) =>
  invoke<void>("shell_resize", { tabId, cols, rows });
export const shellAck = (tabId: string, bytes: number) => invoke<void>("shell_ack", { tabId, bytes });
export const shellClose = (tabId: string) => invoke<void>("shell_close", { tabId });
export const sftpHome = (tabId: string) => invoke<string>("sftp_home", { tabId });
export const sftpList = (tabId: string, path: string) => invoke<FileEntry[]>("sftp_list", { tabId, path });
export const sftpMkdir = (tabId: string, path: string) => invoke<void>("sftp_mkdir", { tabId, path });
export const sftpRename = (tabId: string, from: string, to: string) => invoke<void>("sftp_rename", { tabId, from, to });
export const sftpRemove = (tabId: string, path: string, recursive: boolean) =>
  invoke<void>("sftp_remove", { tabId, path, recursive });
export const sftpSearch = (tabId: string, root: string, query: string) => invoke<FileEntry[]>("sftp_search", { tabId, root, query });
export const sftpChmod = (tabId: string, path: string, mode: number) => invoke<void>("sftp_chmod", { tabId, path, mode });
export const sftpEditExternal = (tabId: string, path: string) => invoke<string>("sftp_edit_external", { tabId, path });
export const onExternalEditSync = (cb: (e: { path: string; ok: boolean }) => void) =>
  listen<{ path: string; ok: boolean }>("external-edit-sync", (e) => cb(e.payload));
export const sftpCopy = (tabId: string, from: string, to: string) => invoke<void>("sftp_copy", { tabId, from, to });
export const sftpReadText = (tabId: string, path: string) => invoke<string>("sftp_read_text", { tabId, path });
export const sftpWriteText = (tabId: string, path: string, content: string) =>
  invoke<void>("sftp_write_text", { tabId, path, content });
export const sftpUpload = (tabId: string, items: { local: string; remote: string }[]) =>
  invoke<string[]>("sftp_upload", { tabId, items });
export const sftpDownload = (tabId: string, remotePaths: string[], localDir?: string) =>
  invoke<string[]>("sftp_download", { tabId, remotePaths, localDir: localDir ?? null });
export async function pickFolder(startIn?: string): Promise<string | null> {
  const picked = await openDialog({ multiple: false, directory: true, defaultPath: startIn });
  return typeof picked === "string" ? picked : null;
}
export const transferCancel = (transferId: string) => invoke<boolean>("transfer_cancel", { transferId });

export async function pickFiles(): Promise<string[]> {
  const picked = await openDialog({ multiple: true, directory: false });
  if (picked == null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export const onFilesDropped = async (cb: (paths: string[], intoDir?: string | null) => void): Promise<() => void> =>
  getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type !== "drop") return;
    const { x, y } = e.payload.position;
    const target = document.elementFromPoint(x / window.devicePixelRatio, y / window.devicePixelRatio);
    cb(e.payload.paths, target?.closest("[data-drop-dir]")?.getAttribute("data-drop-dir") ?? null);
  });

export const onTransferProgress = async (cb: (e: TransferEvent) => void): Promise<() => void> =>
  listen<TransferEvent>("transfer-progress", (e) => cb(e.payload));

export function metricsStart(tabId: string, onMetrics: (m: Metrics | null) => void) {
  const channel = new Channel<Metrics | null>();
  channel.onmessage = onMetrics;
  return invoke<void>("metrics_start", { tabId, onMetrics: channel });
}
export function cwdStart(tabId: string, onCwd: (cwd: string) => void) {
  const channel = new Channel<string>();
  channel.onmessage = onCwd;
  return invoke<void>("cwd_start", { tabId, onCwd: channel });
}
export const cwdStop = (tabId: string) => invoke<void>("cwd_stop", { tabId });
export const metricsStop = (tabId: string) => invoke<void>("metrics_stop", { tabId });

export interface SshConfigHost {
  alias: string;
  hostName: string;
  user: string | null;
  port: number | null;
  identityFile: string | null;
  proxyJump: string | null;
}
export const sshConfigHosts = () => invoke<{ hosts: SshConfigHost[]; defaultUser: string }>("ssh_config_hosts");

/** Kayıt yerini sorar ve günlüğü başlatır; iptal edilirse `null`. */
export async function logStart(tabId: string, suggestedName: string): Promise<string | null> {
  const path = await saveDialog({ defaultPath: suggestedName, filters: [{ name: "Log", extensions: ["log", "txt"] }] });
  if (!path) return null;
  await invoke<void>("log_start", { tabId, path });
  return path;
}
export const logStop = (tabId: string) => invoke<void>("log_stop", { tabId });

export async function notify(title: string, body: string): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
}

export const knownHostsList = () => invoke<{ host: string; port: number; fingerprint: string }[]>("known_hosts_list");
export const knownHostsRemove = (host: string, port: number) => invoke<boolean>("known_hosts_remove", { host, port });

export const tunnelStart = (tabId: string, spec: TunnelSpec) => invoke<RunningTunnel>("tunnel_start", { tabId, spec });
export const tunnelStop = (tabId: string, id: string) => invoke<void>("tunnel_stop", { tabId, id });
export const tunnelList = (tabId: string) => invoke<RunningTunnel[]>("tunnel_list", { tabId });

/** Kayıt yerini sorar; iptal edilirse `null`, aksi halde yazılan dosyanın yolu. */
export async function exportSessions(): Promise<string | null> {
  const path = await saveDialog({ defaultPath: "sshfire-sunucular.json", filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return null;
  await invoke<void>("sessions_export", { path });
  return path;
}

export async function importSessions(): Promise<{ added: number; skipped: number } | null> {
  const picked = await openDialog({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!picked || Array.isArray(picked)) return null;
  return invoke<{ added: number; skipped: number }>("sessions_import", { path: picked });
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
  /** İndirir, imzasını doğrular, kurar ve uygulamayı yeniden başlatır. */
  install: (onProgress: (done: number, total: number | null) => void) => Promise<void>;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? null,
    install: async (onProgress) => {
      let done = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        else if (event.event === "Progress") {
          done += event.data.chunkLength;
          onProgress(done, total);
        }
      });
      await relaunch();
    },
  };
}

export const appVersion = () => getVersion();

export const answerPassword = (requestId: string, password: string | null, remember: boolean) =>
  invoke<void>("password_answer", { requestId, password, remember });

export interface PasswordPromptEvent {
  requestId: string;
  host: string;
  user: string;
  kind?: "password" | "passphrase";
}
export const answerAuth = (requestId: string, answers: string[] | null) => invoke<void>("auth_answer", { requestId, answers });

export interface AuthPromptEvent {
  requestId: string;
  host: string;
  user: string;
  name: string;
  instructions: string;
  prompts: { text: string; echo: boolean }[];
}
export const onAuthPrompt = (cb: (e: AuthPromptEvent) => void) => listen<AuthPromptEvent>("auth-prompt", (e) => cb(e.payload));

export const onPasswordPrompt = (cb: (e: PasswordPromptEvent) => void) =>
  listen<PasswordPromptEvent>("password-prompt", (e) => cb(e.payload));

export const answerHostKey = (requestId: string, trust: boolean) =>
  invoke<void>("hostkey_answer", { requestId, trust });

export interface HostKeyPromptEvent {
  requestId: string;
  host: string;
  port: number;
  fingerprint: string;
}
export interface ShellClosedEvent {
  tabId: string;
  reason: string | null;
}

export const onHostKeyPrompt = (cb: (e: HostKeyPromptEvent) => void) =>
  listen<HostKeyPromptEvent>("hostkey-prompt", (e) => cb(e.payload));
export const onShellClosed = (cb: (e: ShellClosedEvent) => void) =>
  listen<ShellClosedEvent>("shell-closed", (e) => cb(e.payload));

export const realApi = {
  listSessions,
  startupWarning,
  addSession,
  updateSession,
  removeSession,
  connect,
  shellWrite,
  shellResize,
  shellAck,
  shellClose,
  sftpHome,
  sftpList,
  sftpMkdir,
  sftpRename,
  sftpRemove,
  sftpChmod,
  sftpSearch,
  sftpEditExternal,
  onExternalEditSync: async (cb: (e: { path: string; ok: boolean }) => void) => (await onExternalEditSync(cb)) as () => void,
  sftpCopy,
  sftpReadText,
  sftpWriteText,
  sftpUpload,
  sftpDownload,
  transferCancel,
  pickFiles,
  pickFolder,
  onFilesDropped,
  onTransferProgress,
  metricsStart,
  metricsStop,
  cwdStart,
  cwdStop,
  logStart,
  logStop,
  checkForUpdate,
  appVersion,
  sshConfigHosts,
  exportSessions,
  importSessions,
  notify,
  knownHostsList,
  knownHostsRemove,
  tunnelStart,
  tunnelStop,
  tunnelList,
  answerAuth,
  onAuthPrompt: async (cb: (e: AuthPromptEvent) => void) => (await onAuthPrompt(cb)) as () => void,
  answerPassword,
  onPasswordPrompt: async (cb: (e: PasswordPromptEvent) => void) => (await onPasswordPrompt(cb)) as () => void,
  answerHostKey,
  onHostKeyPrompt: async (cb: (e: HostKeyPromptEvent) => void) => (await onHostKeyPrompt(cb)) as () => void,
  onShellClosed: async (cb: (e: ShellClosedEvent) => void) => (await onShellClosed(cb)) as () => void,
};

export type AppApi = typeof realApi;
