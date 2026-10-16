import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileEntry } from "./files/types";
import type { NewSession, Session } from "./types";

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
  answerHostKey,
  onHostKeyPrompt: async (cb: (e: HostKeyPromptEvent) => void) => (await onHostKeyPrompt(cb)) as () => void,
  onShellClosed: async (cb: (e: ShellClosedEvent) => void) => (await onShellClosed(cb)) as () => void,
};

export type AppApi = typeof realApi;
