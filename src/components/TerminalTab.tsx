import { useEffect, useReducer, useRef, useState } from "react";
import { ShellSession, type ShellApi, type TermLike } from "../terminal/shellSession";
import { errorText, useT } from "../i18n";
import type { Messages } from "../locales/tr";
import type { Metrics } from "../metrics/types";
import { MetricsBar } from "./MetricsBar";
import { FindBar } from "./FindBar";
import type { MultiExecHub } from "../terminal/multiExec";

function closeReasonText(t: Messages, reason: string): string {
  const idle = /^idle:(\d+)$/.exec(reason);
  if (idle) return t.terminal.idleClosed(Number(idle[1]));
  const m = /^exit:(\d+)$/.exec(reason);
  return m ? t.terminal.exitCode(Number(m[1])) : reason;
}

export const MAX_RETRIES = 5;
/** Çıktı bu kadar süre kesilirse komut bitmiş sayılır. */
export const QUIET_MS = 6000;
const retryDelayMs = (attempt: number) => Math.min(30000, 3000 * 2 ** attempt);

export interface TerminalTabProps {
  sessionId: string;
  api: ShellApi;
  createTerm: (el: HTMLElement) => TermLike;
  visible?: boolean;
  dark?: boolean;
  onStatusChange?: (status: "connecting" | "open" | "closed") => void;
  onReconnect?: (auto?: boolean) => void;
  /** Kopma sonrası kaçıncı otomatik yeniden bağlanma serisinde olduğumuz (0 = seri yok). */
  retryAttempt?: number;
  /** Bu kadar dakika işlem yapılmazsa bağlantı kesilir; 0 = hiçbir zaman. */
  idleMinutes?: number;
  onTabId?: (tabId: string) => void;
  onCwd?: (cwd: string) => void;
  hub?: MultiExecHub;
  tabKey?: string;
  active?: boolean;
  onFocusPane?: () => void;
  local?: boolean;
  startupCommand?: string | null;
  name?: string;
}

export function TerminalTab({ sessionId, api, createTerm, visible = true, dark = true, onStatusChange, onReconnect, onTabId, onCwd, hub, tabKey, active = true, onFocusPane, local = false, startupCommand, name, retryAttempt = 0, idleMinutes = 0 }: TerminalTabProps) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TermLike | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [retryCancelled, setRetryCancelled] = useState(false);
  const [watching, setWatching] = useState(false);
  const lastOutput = useRef<number | null>(null);
  const wasOpen = useRef(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const sessionRef = useRef<ShellSession | null>(null);

  useEffect(() => {
    const term = createTerm(hostRef.current as HTMLElement);
    termRef.current = term;
    term.onFindRequest?.(() => setFindOpen(true));
    const session = new ShellSession(api, term, () => {
      if (session.status === "open") wasOpen.current = true;
      onStatusChange?.(session.status);
      rerender();
    });
    sessionRef.current = session;
    session.onActivity = () => {
      lastOutput.current = Date.now();
    };
    const unregister = hub && tabKey ? hub.register(tabKey, (text) => session.send(text)) : undefined;
    if (hub && tabKey) session.userInput = (text) => hub.userTyped(tabKey, text);
    let alive = true;
    void session.open(sessionId).then(() => {
      if (!alive || session.status !== "open" || !session.tabId) return;
      if (startupCommand) session.send(`${startupCommand}\r`);
      if (local) return;
      onTabId?.(session.tabId);
      void api.metricsStart?.(session.tabId, setMetrics);
      void api.cwdStart?.(session.tabId, (cwd) => onCwd?.(cwd));
    });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => term.fit()) : null;
    if (hostRef.current) observer?.observe(hostRef.current);
    return () => {
      alive = false;
      unregister?.();
      observer?.disconnect();
      if (session.tabId && !local) {
        void api.metricsStop?.(session.tabId);
        void api.cwdStop?.(session.tabId);
      }
      if (session.tabId) void api.logStop?.(session.tabId);
      void session.close();
    };
    // sessionId yalnızca açılışta okunur; yeniden bağlanma sekmeyi yeniden oluşturur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    termRef.current?.setTheme?.(dark);
  }, [dark]);

  useEffect(() => {
    if (visible) {
      termRef.current?.fit();
      termRef.current?.focus();
    }
  }, [visible]);

  function toggleWatching() {
    lastOutput.current = null;
    setWatching((v) => !v);
  }

  useEffect(() => {
    if (!watching) return;
    const timer = setInterval(() => {
      const last = lastOutput.current;
      if (last === null || Date.now() - last < QUIET_MS) return;
      lastOutput.current = null;
      setWatching(false);
      const present = visible && document.hasFocus();
      if (!present) void api.notify?.(name ?? "SSHFire", t.terminal.quietBody(Math.round(QUIET_MS / 1000)));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

  useEffect(() => {
    if (!idleMinutes) return;
    const timer = setInterval(() => {
      const session = sessionRef.current;
      if (session && session.status === "open" && Date.now() - session.lastActivity >= idleMinutes * 60_000) {
        void session.stop(`idle:${idleMinutes}`);
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [idleMinutes]);

  function onPaneKey(e: React.KeyboardEvent) {
    if (status !== "closed" || !onReconnect) return;
    if (e.key.toLowerCase() !== "r" || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    onReconnect();
  }

  async function toggleRecording() {
    const tabId = sessionRef.current?.tabId;
    if (!tabId) return;
    if (recording) {
      await api.logStop?.(tabId);
      setRecording(false);
      return;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const path = await api.logStart?.(tabId, `${(name ?? "session").replace(/[^\w.-]+/g, "_")}-${stamp}.log`);
    if (path) setRecording(true);
  }

  const s = sessionRef.current;
  const status = s?.status ?? "connecting";
  const errorCode = (s?.error as { code?: string } | null | undefined)?.code;
  const dropped = !!s && !s.error && !/^(exit|idle):/.test(s.closeReason ?? "exit:");
  const retrying =
    status === "closed" &&
    !local &&
    !!onReconnect &&
    !retryCancelled &&
    retryAttempt < MAX_RETRIES &&
    (dropped ? wasOpen.current || retryAttempt > 0 : retryAttempt > 0 && errorCode === "unreachable");

  useEffect(() => {
    if (!retrying) return;
    const timer = setTimeout(() => onReconnect?.(true), retryDelayMs(retryAttempt));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrying]);
  return (
    <div className={`shell-pane${active ? " shell-pane--active" : ""}`} hidden={!visible} onMouseDown={onFocusPane} onKeyDown={onPaneKey}>
      {findOpen && (
        <FindBar
          onFind={(q, forward) => termRef.current?.find?.(q, forward)}
          onClose={() => {
            setFindOpen(false);
            termRef.current?.clearFind?.();
            termRef.current?.focus();
          }}
        />
      )}
      {(api.logStart || api.notify) && status === "open" && (
        <div className="terminal__tools">
          {api.notify && (
            <button
              type="button"
              className={`terminal__rec${watching ? " terminal__rec--on" : ""}`}
              title={watching ? t.terminal.notifyOff : t.terminal.notifyOn}
              aria-label={watching ? t.terminal.notifyOff : t.terminal.notifyOn}
              aria-pressed={watching}
              onClick={toggleWatching}
            >
              🔔{watching && <span> …</span>}
            </button>
          )}
          {api.logStart && (
            <button
              type="button"
              className={`terminal__rec${recording ? " terminal__rec--on" : ""}`}
              title={recording ? t.terminal.stopLog : t.terminal.startLog}
              aria-label={recording ? t.terminal.stopLog : t.terminal.startLog}
              onClick={() => void toggleRecording()}
            >
              ●{recording && <span> REC</span>}
            </button>
          )}
        </div>
      )}
      <div ref={hostRef} data-testid="terminal-host" className="terminal__host" />
      {status !== "closed" && (
        <span className="sr-only" data-status={status}>
          {status === "connecting" ? t.terminal.connecting : t.terminal.connected}
        </span>
      )}
      {api.metricsStart && !local && status !== "closed" && <MetricsBar metrics={metrics} />}
      {status === "closed" && (
        <div role="status" className="terminal__banner">
          {s?.error ? <strong>{errorText(t, s.error)}</strong> : <strong>{t.terminal.disconnected}</strong>}
          {s?.closeReason && <span> {closeReasonText(t, s.closeReason)}</span>}
          {retrying ? (
            <>
              <span> {t.terminal.retrying(retryAttempt + 1, MAX_RETRIES)}</span>
              <button type="button" onClick={() => setRetryCancelled(true)}>{t.terminal.cancelRetry}</button>
            </>
          ) : (
            onReconnect && (
              <>
                <button type="button" onClick={() => onReconnect()}>{t.terminal.reconnect}</button>
                <span className="terminal__hint">{t.terminal.pressR}</span>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
