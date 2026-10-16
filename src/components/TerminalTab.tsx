import { useEffect, useReducer, useRef } from "react";
import { ShellSession, type ShellApi, type TermLike } from "../terminal/shellSession";
import { tr } from "../locales/tr";

export interface TerminalTabProps {
  sessionId: string;
  api: ShellApi;
  createTerm: (el: HTMLElement) => TermLike;
  visible?: boolean;
  onStatusChange?: (status: "connecting" | "open" | "closed") => void;
  onReconnect?: () => void;
}

export function TerminalTab({ sessionId, api, createTerm, visible = true, onStatusChange, onReconnect }: TerminalTabProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TermLike | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const sessionRef = useRef<ShellSession | null>(null);

  useEffect(() => {
    const term = createTerm(hostRef.current as HTMLElement);
    termRef.current = term;
    const session = new ShellSession(api, term, () => {
      onStatusChange?.(session.status);
      rerender();
    });
    sessionRef.current = session;
    void session.open(sessionId);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => term.fit()) : null;
    if (hostRef.current) observer?.observe(hostRef.current);
    return () => {
      observer?.disconnect();
      void session.close();
    };
    // sessionId yalnızca açılışta okunur; yeniden bağlanma sekmeyi yeniden oluşturur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) {
      termRef.current?.fit();
      termRef.current?.focus();
    }
  }, [visible]);

  const s = sessionRef.current;
  const status = s?.status ?? "connecting";
  return (
    <div className="terminal" hidden={!visible}>
      <div ref={hostRef} data-testid="terminal-host" className="terminal__host" />
      {status !== "closed" && (
        <span className="sr-only" data-status={status}>
          {status === "connecting" ? tr.terminal.connecting : tr.terminal.connected}
        </span>
      )}
      {status === "closed" && (
        <div role="status" className="terminal__banner">
          {s?.error ? <strong>{s.error}</strong> : <strong>{tr.terminal.disconnected}</strong>}
          {s?.closeReason && <span> {s.closeReason}</span>}
          {onReconnect && <button type="button" onClick={onReconnect}>{tr.terminal.reconnect}</button>}
        </div>
      )}
    </div>
  );
}
