import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { TransferEvent } from "./files/transfers";
import type { FileEntry } from "./files/types";
import type { Metrics } from "./metrics/types";
import type { NewSession, RunningTunnel, Session, TunnelSpec } from "./types";

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
export const sftpCopy = (tabId: string, from: string, to: string) => invoke<void>("sftp_copy", { tabId, from, to });
export const sftpReadText = (tabId: string, path: string) => invoke<string>("sftp_read_text", { tabId, path });
export const sftpWriteText = (tabId: string, path: string, content: string) =>
  invoke<void>("sftp_write_text", { tabId, path, content });
export const sftpUpload = (tabId: string, items: { local: string; remote: string }[]) =>
  invoke<string[]>("sftp_upload", { tabId, items });
export const sftpDownload = (tabId: string, remotePaths: string[]) =>
  invoke<string[]>("sftp_download", { tabId, remotePaths, localDir: null });
export const transferCancel = (transferId: string) => invoke<boolean>("transfer_cancel", { transferId });

export async function pickFiles(): Promise<string[]> {
  const picked = await openDialog({ multiple: true, directory: false });
  if (picked == null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export const onFilesDropped = async (cb: (paths: string[]) => void): Promise<() => void> =>
  getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === "drop") cb(e.payload.paths);
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

export const tunnelStart = (tabId: string, spec: TunnelSpec) => invoke<RunningTunnel>("tunnel_start", { tabId, spec });
export const tunnelStop = (tabId: string, id: string) => invoke<void>("tunnel_stop", { tabId, id });
export const tunnelList = (tabId: string) => invoke<RunningTunnel[]>("tunnel_list", { tabId });

export const answerPassword = (requestId: string, password: string | null, remember: boolean) =>
  invoke<void>("password_answer", { requestId, password, remember });

export interface PasswordPromptEvent {
  requestId: string;
  host: string;
  user: string;
}
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
  sftpCopy,
  sftpReadText,
  sftpWriteText,
  sftpUpload,
  sftpDownload,
  transferCancel,
  pickFiles,
  onFilesDropped,
  onTransferProgress,
  metricsStart,
  metricsStop,
  cwdStart,
  cwdStop,
  sshConfigHosts,
  tunnelStart,
  tunnelStop,
  tunnelList,
  answerPassword,
  onPasswordPrompt: async (cb: (e: PasswordPromptEvent) => void) => (await onPasswordPrompt(cb)) as () => void,
  answerHostKey,
  onHostKeyPrompt: async (cb: (e: HostKeyPromptEvent) => void) => (await onHostKeyPrompt(cb)) as () => void,
  onShellClosed: async (cb: (e: ShellClosedEvent) => void) => (await onShellClosed(cb)) as () => void,
};

export type AppApi = typeof realApi;
