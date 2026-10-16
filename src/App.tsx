import { useCallback, useEffect, useState } from "react";
import { realApi, type AppApi } from "./api";
import { ServerList } from "./components/ServerList";
import { ServerDialog } from "./components/ServerDialog";
import { Tabs, type TabInfo } from "./components/Tabs";
import { TerminalTab } from "./components/TerminalTab";
import { HostKeyDialog, type HostKeyRequest } from "./components/HostKeyDialog";
import { createXterm } from "./terminal/xterm";
import type { TermLike } from "./terminal/shellSession";
import type { NewSession, Session } from "./types";
import { tr } from "./locales/tr";
import "./App.css";

interface OpenTab {
  key: string;
  sessionId: string;
  title: string;
  status: TabInfo["status"];
}

type DialogState = { mode: "add" } | { mode: "edit"; id: string } | null;

export interface AppProps {
  api?: AppApi;
  createTerm?: (el: HTMLElement) => TermLike;
}

let counter = 0;
const nextKey = () => `tab-${Date.now()}-${counter++}`;

export default function App({ api = realApi, createTerm = createXterm }: AppProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [hostKey, setHostKey] = useState<HostKeyRequest | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setSessions(await api.listSessions()), [api]);

  useEffect(() => {
    void reload();
    void api.startupWarning().then(setWarning);
    let off: (() => void) | undefined;
    let cancelled = false;
    void api.onHostKeyPrompt((e) => setHostKey(e)).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [api, reload]);

  function openTab(sessionId: string) {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const key = nextKey();
    setTabs((t) => [...t, { key, sessionId, title: s.name, status: "connecting" }]);
    setActiveKey(key);
  }

  function closeTab(key: string) {
    setTabs((t) => {
      const next = t.filter((x) => x.key !== key);
      setActiveKey((cur) => (cur === key ? next[next.length - 1]?.key ?? null : cur));
      return next;
    });
  }

  function reconnect(key: string) {
    const old = tabs.find((x) => x.key === key);
    if (!old) return;
    const fresh = { ...old, key: nextKey(), status: "connecting" as const };
    setTabs((t) => t.map((x) => (x.key === key ? fresh : x)));
    setActiveKey(fresh.key);
  }

  function setStatus(key: string, status: TabInfo["status"]) {
    setTabs((t) => t.map((x) => (x.key === key && x.status !== status ? { ...x, status } : x)));
  }

  async function save(session: NewSession | Session, password?: string) {
    try {
      if ("id" in session) await api.updateSession(session, password);
      else await api.addSession(session, password);
      setDialog(null);
      setError(null);
      await reload();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  }

  async function remove(id: string) {
    const s = sessions.find((x) => x.id === id);
    if (!s || !window.confirm(`${s.name} silinsin mi?`)) return;
    await api.removeSession(id);
    await reload();
  }

  function answer(requestId: string, trust: boolean) {
    void api.answerHostKey(requestId, trust);
    setHostKey(null);
  }

  const editing = dialog?.mode === "edit" ? sessions.find((s) => s.id === dialog.id) : undefined;

  return (
    <div className="app">
      <nav aria-label={tr.servers} className="app__sidebar">
        <ServerList
          sessions={sessions}
          onConnect={openTab}
          onEdit={(id) => setDialog({ mode: "edit", id })}
          onDelete={remove}
          onAdd={() => setDialog({ mode: "add" })}
        />
      </nav>
      <main className="app__main">
        {warning && <div role="alert" className="banner banner--warn"><strong>{tr.startupWarning}:</strong> {warning}</div>}
        {error && <div role="alert" className="banner banner--error">{error}</div>}
        <Tabs
          tabs={tabs.map((t) => ({ id: t.key, title: t.title, status: t.status }))}
          activeId={activeKey}
          onSelect={setActiveKey}
          onClose={closeTab}
        />
        <div className="app__terminals">
          {tabs.map((t) => (
            <TerminalTab
              key={t.key}
              sessionId={t.sessionId}
              api={api}
              createTerm={createTerm}
              visible={t.key === activeKey}
              onStatusChange={(st) => setStatus(t.key, st)}
              onReconnect={() => reconnect(t.key)}
            />
          ))}
        </div>
      </main>
      {dialog && (
        <div className="overlay">
          <ServerDialog
            key={dialog.mode === "edit" ? dialog.id : "new"}
            initial={editing}
            onSave={save}
            onCancel={() => setDialog(null)}
          />
        </div>
      )}
      {hostKey && (
        <div className="overlay">
          <HostKeyDialog request={hostKey} onAnswer={answer} />
        </div>
      )}
    </div>
  );
}

export type { NewSession };
