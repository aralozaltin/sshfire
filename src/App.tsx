import { useCallback, useEffect, useRef, useState } from "react";
import { realApi, type AppApi, type StartupWarning } from "./api";
import { ServerList } from "./components/ServerList";
import { ServerDialog } from "./components/ServerDialog";
import { Tabs, type TabInfo } from "./components/Tabs";
import { TerminalTab } from "./components/TerminalTab";
import { HostKeyDialog, type HostKeyRequest } from "./components/HostKeyDialog";
import { createXterm } from "./terminal/xterm";
import { ThemeToggle } from "./components/ThemeToggle";
import { FileBrowser } from "./components/FileBrowser";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { TransferPanel } from "./components/TransferPanel";
import { MultiExecBar } from "./components/MultiExecBar";
import { MultiExecHub } from "./terminal/multiExec";
import { useTransfers } from "./files/transfers";
import type { ClipboardItem } from "./files/fileOps";
import { applyTheme, loadThemeMode, resolveTheme, saveThemeMode, type ThemeMode } from "./theme";
import type { TermLike } from "./terminal/shellSession";
import type { NewSession, Session } from "./types";
import { errorText, I18nProvider, loadLocaleSetting, resolveLocale, saveLocaleSetting, useT, type LocaleSetting } from "./i18n";
import { LanguageSelect } from "./components/LanguageSelect";
import { Splitter } from "./components/Splitter";
import { loadSidebarWidth, saveSidebarWidth } from "./layout/sidebarWidth";
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

export default function App(props: AppProps) {
  const [localeSetting, setLocaleSetting] = useState<LocaleSetting>(loadLocaleSetting);
  const locale = resolveLocale(localeSetting, navigator.language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function changeLocale(setting: LocaleSetting) {
    setLocaleSetting(setting);
    saveLocaleSetting(setting);
  }

  return (
    <I18nProvider locale={locale}>
      <AppInner {...props} localeSetting={localeSetting} onLocaleChange={changeLocale} />
    </I18nProvider>
  );
}

interface AppInnerProps extends AppProps {
  localeSetting: LocaleSetting;
  onLocaleChange: (setting: LocaleSetting) => void;
}

function AppInner({ api = realApi, createTerm = createXterm, localeSetting, onLocaleChange }: AppInnerProps) {
  const t = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [hostKey, setHostKey] = useState<HostKeyRequest | null>(null);
  const [warnings, setWarnings] = useState<StartupWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("servers");
  const [backendIds, setBackendIds] = useState<Record<string, string>>({});
  const [filePaths, setFilePaths] = useState<Record<string, string>>({});
  const hub = useRef(new MultiExecHub()).current;
  const [multiOn, setMultiOn] = useState(false);
  const [multiKeys, setMultiKeys] = useState<string[]>([]);
  const [cwds, setCwds] = useState<Record<string, string>>({});
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const { transfers, dismiss } = useTransfers(api.onTransferProgress);
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode);
  const [systemDark, setSystemDark] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedTheme = resolveTheme(themeMode, systemDark);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    hub.setTargets(multiOn ? multiKeys : null);
  }, [hub, multiOn, multiKeys]);

  function toggleMulti(on: boolean) {
    setMultiOn(on);
    if (on) setMultiKeys(tabs.map((x) => x.key));
  }

  function resizeSidebar(w: number) {
    setSidebarWidth(w);
    saveSidebarWidth(w);
  }

  function changeTheme(mode: ThemeMode) {
    setThemeMode(mode);
    saveThemeMode(mode);
  }

  const reload = useCallback(async () => setSessions(await api.listSessions()), [api]);

  useEffect(() => {
    void reload();
    void api.startupWarning().then((w) => setWarnings(w ?? []));
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
      setError(errorText(t, e));
    }
  }

  async function confirmRemove() {
    const id = deleting;
    setDeleting(null);
    if (!id) return;
    await api.removeSession(id);
    await reload();
  }

  function answer(requestId: string, trust: boolean) {
    void api.answerHostKey(requestId, trust);
    setHostKey(null);
  }

  const activeTab = tabs.find((x) => x.key === activeKey);
  const activeBackendId = activeKey && activeTab?.status === "open" ? backendIds[activeKey] ?? null : null;
  const editing = dialog?.mode === "edit" ? sessions.find((s) => s.id === dialog.id) : undefined;

  return (
    <div className="app" style={{ gridTemplateColumns: `${sidebarWidth}px 5px 1fr` }}>
      <aside className="app__sidebar">
        <Sidebar
          active={sidebarTab}
          onChange={setSidebarTab}
          servers={
            <nav aria-label={t.servers}>
              <ServerList
                sessions={sessions}
                onConnect={openTab}
                onEdit={(id) => setDialog({ mode: "edit", id })}
                onDelete={setDeleting}
                onAdd={() => setDialog({ mode: "add" })}
              />
            </nav>
          }
          files={
            <FileBrowser
              key={activeBackendId ?? "none"}
              tabId={activeBackendId}
              connectionKey={activeKey ?? ""}
              api={api}
              clipboard={clipboard}
              onClipboardChange={setClipboard}
              followPath={activeKey ? cwds[activeKey] : undefined}
              initialPath={activeKey ? filePaths[activeKey] : undefined}
              onPathChange={(p) => activeKey && setFilePaths((cur) => ({ ...cur, [activeKey]: p }))}
            />
          }
        />
        <TransferPanel transfers={transfers} onCancel={(id) => void api.transferCancel(id)} onDismiss={dismiss} />
        <div className="app__footer">
          <ThemeToggle mode={themeMode} onChange={changeTheme} />
          <LanguageSelect setting={localeSetting} onChange={onLocaleChange} />
        </div>
      </aside>
      <Splitter width={sidebarWidth} onChange={resizeSidebar} />
      <main className="app__main">
        {warnings.map((w) => (
          <div key={w.code} role="alert" className="banner banner--warn">
            <strong>{t.startupWarning}:</strong>{" "}
            {w.code === "sessions_corrupt" ? t.warnings.sessionsCorrupt(w.backup) : t.warnings.hostsCorrupt(w.backup)}
          </div>
        ))}
        {error && <div role="alert" className="banner banner--error">{error}</div>}
        <Tabs
          tabs={tabs.map((t) => ({ id: t.key, title: t.title, status: t.status }))}
          activeId={activeKey}
          onSelect={setActiveKey}
          onClose={closeTab}
        />
        <MultiExecBar
          tabs={tabs.map((x) => ({ id: x.key, title: x.title }))}
          enabled={multiOn}
          selected={multiKeys}
          onToggle={toggleMulti}
          onSelect={setMultiKeys}
        />
        <div className="app__terminals">
          {tabs.map((t) => (
            <TerminalTab
              key={t.key}
              tabKey={t.key}
              hub={hub}
              sessionId={t.sessionId}
              api={api}
              createTerm={createTerm}
              visible={t.key === activeKey}
              dark={resolvedTheme === "dark"}
              onStatusChange={(st) => setStatus(t.key, st)}
              onReconnect={() => reconnect(t.key)}
              onTabId={(id) => setBackendIds((cur) => ({ ...cur, [t.key]: id }))}
              onCwd={(cwd) => setCwds((cur) => ({ ...cur, [t.key]: cwd }))}
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
      {deleting && (
        <div className="overlay">
          <div role="alertdialog" aria-modal="true" aria-label={t.confirmDelete.title} className="hostkey-dialog">
            <h2>{t.confirmDelete.title}</h2>
            <p>{t.confirmDelete.body(sessions.find((x) => x.id === deleting)?.name ?? "")}</p>
            <div className="hostkey-dialog__actions">
              <button type="button" autoFocus onClick={() => setDeleting(null)}>{t.dialog.cancel}</button>
              <button type="button" onClick={() => void confirmRemove()}>{t.remove}</button>
            </div>
          </div>
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
