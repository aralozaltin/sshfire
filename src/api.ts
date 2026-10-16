import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NewSession, Session } from "./types";

export const listSessions = () => invoke<Session[]>("sessions_list");
export const startupWarning = () => invoke<string | null>("startup_warning");

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
