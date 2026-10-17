import { useCallback, useEffect, useRef, useState } from "react";
import { realApi, type AppApi, type StartupWarning, type UpdateInfo } from "./api";
import { ServerList } from "./components/ServerList";
import { ServerDialog } from "./components/ServerDialog";
import { Tabs, type TabInfo } from "./components/Tabs";
import { TerminalTab } from "./components/TerminalTab";
import { HostKeyDialog, type HostKeyRequest } from "./components/HostKeyDialog";
import { PasswordDialog, type PasswordRequest } from "./components/PasswordDialog";
import { ImportDialog, type ImportCandidate } from "./components/ImportDialog";
import { AuthPromptDialog, type AuthPromptRequest } from "./components/AuthPromptDialog";
import { createXterm } from "./terminal/xterm";
import { ThemeToggle } from "./components/ThemeToggle";
import { FileBrowser } from "./components/FileBrowser";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { TransferPanel } from "./components/TransferPanel";
import { TunnelPanel } from "./components/TunnelPanel";
import { MacroPanel } from "./components/MacroPanel";
import { ContextMenu } from "./components/ContextMenu";
import { PromptDialog } from "./components/PromptDialog";
import { loadMacros, newMacro, saveMacros, textToInput, type Macro } from "./macros/macros";
import { MultiExecBar } from "./components/MultiExecBar";
import { LayoutSwitch, type TerminalLayout } from "./components/LayoutSwitch";
import { MultiExecHub } from "./terminal/multiExec";
import { useTransfers } from "./files/transfers";
import type { ClipboardItem } from "./files/fileOps";
import { applyTheme, loadThemeMode, resolveTheme, saveThemeMode, type ThemeMode } from "./theme";
import type { TermLike } from "./terminal/shellSession";
import { LOCAL_SESSION_ID, type NewSession, type RunningTunnel, type Session, type TunnelSpec } from "./types";
import { errorText, I18nProvider, loadLocaleSetting, resolveLocale, saveLocaleSetting, useT, type LocaleSetting } from "./i18n";
import { LanguageSelect } from "./components/LanguageSelect";
import { SettingsMenu } from "./components/SettingsMenu";
import { KnownHostsDialog } from "./components/KnownHostsDialog";
import { QuickConnectDialog } from "./components/QuickConnectDialog";
import type { QuickTarget } from "./sessions/quickConnect";
import { TerminalSchemeSelect } from "./components/TerminalSchemeSelect";
import { loadScheme, saveScheme } from "./terminal/schemes";
import { UpdateDialog } from "./components/UpdateDialog";
import { UpdateSettings } from "./components/UpdateSettings";
import { loadAutoUpdate, loadLastCheck, saveAutoUpdate, saveLastCheck, shouldCheckNow } from "./updates/updates";
import { Splitter } from "./components/Splitter";
import { classifyAppKey } from "./terminal/appShortcuts";
import { loadSavedTabs, saveTabs, type SavedTab } from "./tabs/sessionTabs";
import { loadSidebarWidth, saveSidebarWidth } from "./layout/sidebarWidth";
import "./App.css";

interface OpenTab {
  key: string;
  sessionId: string;
  title: string;
  status: TabInfo["status"];
  retry?: number;
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
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[] | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateState, setUpdateState] = useState<"ready" | "installing" | "error">("ready");
  const [updateProgress, setUpdateProgress] = useState<{ done: number; total: number | null } | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [appVer, setAppVer] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(loadAutoUpdate);
  const [showHosts, setShowHosts] = useState(false);
  const [quick, setQuick] = useState(false);
  const [restore, setRestore] = useState<SavedTab[] | null>(null);
  const [persistReady, setPersistReady] = useState(false);
  const [termScheme, setTermScheme] = useState(loadScheme);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [authRequest, setAuthRequest] = useState<AuthPromptRequest | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [warnings, setWarnings] = useState<StartupWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("servers");
  const [backendIds, setBackendIds] = useState<Record<string, string>>({});
  const [filePaths, setFilePaths] = useState<Record<string, string>>({});
  const hub = useRef(new MultiExecHub()).current;
  const autoOpened = useRef(new Set<string>());
  const tabsRef = useRef<OpenTab[]>([]);
  const [tabMenu, setTabMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [layout, setLayout] = useState<TerminalLayout>("single");
  const [multiOn, setMultiOn] = useState(false);
  const [multiKeys, setMultiKeys] = useState<string[]>([]);
  const [macros, setMacros] = useState<Macro[]>(loadMacros);
  const [recording, setRecording] = useState(false);
  const recorded = useRef("");
  const [running, setRunning] = useState<RunningTunnel[]>([]);
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
    void api.listSessions().then((list) => {
      setSessions(list);
      const saved = loadSavedTabs().filter((s) => s.sessionId === LOCAL_SESSION_ID || list.some((x) => x.id === s.sessionId));
      setRestore(saved.length > 0 ? saved : null);
      setPersistReady(saved.length === 0);
    });
    void api.startupWarning().then((w) => setWarnings(w ?? []));
    const offs: (() => void)[] = [];
    let cancelled = false;
    const keep = (fn: () => void) => (cancelled ? fn() : offs.push(fn));
    void api.onHostKeyPrompt((e) => setHostKey(e)).then(keep);
    void api.onPasswordPrompt((e) => setPasswordRequest(e)).then(keep);
    void api.onAuthPrompt((e) => setAuthRequest(e)).then(keep);
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, [api, reload]);

  function openTab(sessionId: string) {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const key = nextKey();
    setTabs((t) => [...t, { key, sessionId, title: s.name, status: "connecting" }]);
    setActiveKey(key);
  }

  function restoreTabs() {
    const saved = restore ?? [];
    setRestore(null);
    setPersistReady(true);
    const reopened = saved.map((s) => ({
      key: nextKey(),
      sessionId: s.sessionId,
      title: s.sessionId === LOCAL_SESSION_ID ? s.title : sessions.find((x) => x.id === s.sessionId)?.name ?? s.title,
      status: "connecting" as const,
    }));
    setTabs((cur) => [...cur, ...reopened]);
    if (reopened.length > 0) setActiveKey(reopened[reopened.length - 1].key);
  }

  function dismissRestore() {
    setRestore(null);
    setPersistReady(true);
  }

  useEffect(() => {
    if (persistReady) saveTabs(tabs.map((x) => ({ sessionId: x.sessionId, title: x.title })));
  }, [tabs, persistReady]);

  async function quickConnect(target: QuickTarget) {
    setQuick(false);
    const known = sessions.find((s) => s.host.toLowerCase() === target.host.toLowerCase() && s.port === target.port && s.user === target.user);
    if (known) return openTab(known.id);
    try {
      const added = await api.addSession({ name: `${target.user}@${target.host}`, host: target.host, port: target.port, user: target.user, folder: null, auth: { type: "password" } }, undefined);
      await reload();
      const key = nextKey();
      setTabs((cur) => [...cur, { key, sessionId: added.id, title: added.name, status: "connecting" }]);
      setActiveKey(key);
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  function openLocal() {
    const key = nextKey();
    setTabs((cur) => [...cur, { key, sessionId: LOCAL_SESSION_ID, title: t.localTerminal.title, status: "connecting" }]);
    setActiveKey(key);
  }

  function duplicateTab(key: string) {
    const src = tabs.find((x) => x.key === key);
    if (!src) return;
    if (src.sessionId === LOCAL_SESSION_ID) openLocal();
    else openTab(src.sessionId);
  }

  function closeOthers(key: string) {
    setTabs((t) => t.filter((x) => x.key === key));
    setActiveKey(key);
  }

  function renameTab(key: string, title: string) {
    setTabs((t) => t.map((x) => (x.key === key ? { ...x, title } : x)));
    setRenamingTab(null);
  }

  function closeTab(key: string) {
    setTabs((t) => {
      const next = t.filter((x) => x.key !== key);
      setActiveKey((cur) => (cur === key ? next[next.length - 1]?.key ?? null : cur));
      return next;
    });
  }

  function reconnect(key: string, auto = false) {
    const old = tabs.find((x) => x.key === key);
    if (!old) return;
    const fresh = { ...old, key: nextKey(), status: "connecting" as const, retry: auto ? (old.retry ?? 0) + 1 : 0 };
    setTabs((t) => t.map((x) => (x.key === key ? fresh : x)));
    setActiveKey(fresh.key);
  }

  tabsRef.current = tabs;

  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e) => {
    const action = classifyAppKey(e, /Mac|iPhone|iPad/.test(navigator.platform));
    if (!action) return;
    const list = tabsRef.current;
    const at = list.findIndex((x) => x.key === activeKey);
    if (action.type === "quickConnect") setQuick(true);
    else if (action.type === "newLocal") openLocal();
    else if (action.type === "close") {
      if (!activeKey) return;
      closeTab(activeKey);
    } else if (action.type === "goto") {
      const target = list[action.index];
      if (!target) return;
      setActiveKey(target.key);
    } else {
      if (list.length === 0) return;
      const step = action.type === "next" ? 1 : -1;
      setActiveKey(list[(Math.max(at, 0) + step + list.length) % list.length].key);
    }
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function setStatus(key: string, status: TabInfo["status"]) {
    if (status === "open" && !autoOpened.current.has(key)) {
      autoOpened.current.add(key);
      const tab = tabsRef.current.find((x) => x.key === key);
      if (tab && tab.sessionId !== LOCAL_SESSION_ID) setSidebarTab("files");
    }
    setTabs((t) => t.map((x) => (x.key === key && (x.status !== status || (status === "open" && x.retry)) ? { ...x, status, ...(status === "open" ? { retry: 0 } : {}) } : x)));
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

  async function openImport() {
    try {
      const { hosts, defaultUser } = await api.sshConfigHosts();
      setImportCandidates(
        hosts.map((h) => {
          const user = h.user ?? defaultUser;
          const port = h.port ?? 22;
          return {
            alias: h.alias,
            host: h.hostName,
            user,
            port,
            identityFile: h.identityFile,
            proxyJump: h.proxyJump,
            exists: sessions.some((s) => s.host === h.hostName && s.port === port && s.user === user),
          };
        }),
      );
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function exportList() {
    try {
      const path = await api.exportSessions();
      if (path) setNotice(t.sessionsIo.exported(path));
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function importFile() {
    try {
      const result = await api.importSessions();
      if (!result) return;
      setNotice(t.sessionsIo.imported(result.added, result.skipped));
      await reload();
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function runImport(chosen: ImportCandidate[]) {
    setImportCandidates(null);
    try {
      const byAlias = new Map<string, Session>(sessions.map((x) => [x.name, x]));
      for (const c of chosen) {
        const added = await api.addSession(
          {
            name: c.alias,
            host: c.host,
            port: c.port,
            user: c.user,
            folder: t.importConfig.folder,
            auth: c.identityFile ? { type: "key_file", path: c.identityFile } : { type: "password" },
          },
          undefined,
        );
        byAlias.set(c.alias, added);
      }
      for (const c of chosen) {
        const hop = c.proxyJump?.split(",")[0]?.trim().replace(/^[^@]*@/, "").replace(/:\d+$/, "");
        const jumpSession = hop ? byAlias.get(hop) : undefined;
        const me = byAlias.get(c.alias);
        if (me && jumpSession && jumpSession.id !== me.id) await api.updateSession({ ...me, jump: jumpSession.id }, undefined);
      }
      await reload();
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function runCheck(manual: boolean, version: string | null) {
    setChecking(true);
    setCheckMessage(null);
    try {
      const found = await api.checkForUpdate();
      saveLastCheck(Date.now());
      if (found) {
        setUpdate(found);
        setUpdateState("ready");
        setUpdateProgress(null);
      } else if (manual) {
        setCheckMessage(t.updates.upToDate(version ?? ""));
      }
    } catch {
      if (manual) setCheckMessage(t.updates.checkFailed);
    } finally {
      setChecking(false);
    }
  }

  async function installUpdate() {
    if (!update) return;
    setUpdateState("installing");
    setUpdateError(null);
    try {
      await update.install((done, total) => setUpdateProgress({ done, total }));
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
      setUpdateState("error");
    }
  }

  function changeAutoUpdate(on: boolean) {
    setAutoUpdate(on);
    saveAutoUpdate(on);
  }

  useEffect(() => {
    let cancelled = false;
    void api.appVersion().then((v) => {
      if (cancelled) return;
      setAppVer(v);
      if (shouldCheckNow(loadAutoUpdate(), loadLastCheck(), Date.now())) void runCheck(false, v);
    });
    return () => {
      cancelled = true;
    };
    // Yalnızca açılışta bir kez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  function answerAuth(requestId: string, answers: string[] | null) {
    void api.answerAuth(requestId, answers);
    setAuthRequest(null);
  }

  function answerPassword(requestId: string, password: string | null, remember: boolean) {
    void api.answerPassword(requestId, password, remember);
    setPasswordRequest(null);
  }

  function answer(requestId: string, trust: boolean) {
    void api.answerHostKey(requestId, trust);
    setHostKey(null);
  }

  const activeTab = tabs.find((x) => x.key === activeKey);
  const activeBackendId = activeKey && activeTab?.status === "open" ? backendIds[activeKey] ?? null : null;
  const activeSession = sessions.find((x) => x.id === activeTab?.sessionId);

  useEffect(() => {
    if (!activeBackendId) {
      setRunning([]);
      return;
    }
    const refresh = () => void api.tunnelList(activeBackendId).then(setRunning, () => {});
    refresh();
    if (sidebarTab !== "tunnels") return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [api, activeBackendId, sidebarTab]);

  useEffect(() => {
    if (!recording) return;
    recorded.current = "";
    return hub.onInput((key, text) => {
      if (key === activeKey) recorded.current += text;
    });
    // Kayıt başladığı andaki etkin sekmeyi izler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, hub]);

  function updateMacros(next: Macro[]) {
    setMacros(next);
    saveMacros(next);
  }

  function stopRecording() {
    setRecording(false);
    const text = recorded.current;
    recorded.current = "";
    if (text.trim()) updateMacros([...macros, newMacro(t.macros.recordedName, text)]);
  }

  function saveMacro(m: { id?: string; name: string; text: string }) {
    if (m.id) updateMacros(macros.map((x) => (x.id === m.id ? { ...x, name: m.name, text: m.text } : x)));
    else updateMacros([...macros, newMacro(m.name, m.text)]);
  }

  async function startTunnel(spec: TunnelSpec) {
    if (!activeBackendId) return;
    try {
      await api.tunnelStart(activeBackendId, spec);
      setRunning(await api.tunnelList(activeBackendId));
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function stopTunnel(id: string) {
    if (!activeBackendId) return;
    await api.tunnelStop(activeBackendId, id);
    setRunning(await api.tunnelList(activeBackendId));
  }

  async function saveTunnels(specs: TunnelSpec[]) {
    if (!activeSession) return;
    try {
      await api.updateSession({ ...activeSession, tunnels: specs }, undefined);
      await reload();
    } catch (e) {
      setError(errorText(t, e));
    }
  }

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
                connectedIds={[...new Set(tabs.filter((x) => x.status === "open").map((x) => x.sessionId))]}
                onConnect={openTab}
                onEdit={(id) => setDialog({ mode: "edit", id })}
                onDelete={setDeleting}
                onAdd={() => setDialog({ mode: "add" })}
                onImport={() => void openImport()}
                onExport={() => void exportList()}
                onImportFile={() => void importFile()}
              />
            </nav>
          }
          tunnels={
            <TunnelPanel
              tunnels={activeSession?.tunnels ?? []}
              running={running}
              connected={activeBackendId !== null}
              hasSession={activeSession !== undefined}
              onStart={(spec) => void startTunnel(spec)}
              onStop={(id) => void stopTunnel(id)}
              onChange={(specs) => void saveTunnels(specs)}
            />
          }
          macros={
            <MacroPanel
              macros={macros}
              canRun={activeKey !== null && activeTab?.status === "open"}
              recording={recording}
              onRun={(m) => activeKey && hub.send(activeKey, textToInput(m.text))}
              onSave={saveMacro}
              onDelete={(id) => updateMacros(macros.filter((x) => x.id !== id))}
              onStartRecording={() => setRecording(true)}
              onStopRecording={stopRecording}
            />
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
          <SettingsMenu>
            <ThemeToggle mode={themeMode} onChange={changeTheme} />
            <LanguageSelect setting={localeSetting} onChange={onLocaleChange} />
            <TerminalSchemeSelect
              scheme={termScheme}
              onChange={(id) => {
                setTermScheme(id);
                saveScheme(id);
              }}
            />
            <button type="button" onClick={() => setShowHosts(true)}>{t.knownHosts.open}</button>
            <UpdateSettings
              version={appVer}
              auto={autoUpdate}
              checking={checking}
              message={checkMessage}
              onAutoChange={changeAutoUpdate}
              onCheck={() => void runCheck(true, appVer)}
            />
          </SettingsMenu>
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
        {restore && (
          <div role="status" className="banner banner--info">
            {t.restoreTabs.question(restore.length)}{" "}
            <button type="button" onClick={restoreTabs}>{t.restoreTabs.yes}</button>{" "}
            <button type="button" onClick={dismissRestore}>{t.restoreTabs.no}</button>
          </div>
        )}
        {notice && (
          <div role="status" className="banner banner--info">
            {notice} <button type="button" aria-label={t.files.close} onClick={() => setNotice(null)}>×</button>
          </div>
        )}
        <Tabs
          tabs={tabs.map((t) => ({ id: t.key, title: t.title, status: t.status, color: sessions.find((x) => x.id === t.sessionId)?.color }))}
          activeId={activeKey}
          onSelect={setActiveKey}
          onReorder={(from, to) =>
            setTabs((cur) => {
              const a = cur.findIndex((x) => x.key === from);
              const b = cur.findIndex((x) => x.key === to);
              if (a < 0 || b < 0 || a === b) return cur;
              const next = [...cur];
              const [moved] = next.splice(a, 1);
              next.splice(b, 0, moved);
              return next;
            })
          }
          onClose={closeTab}
          onContextMenu={(key, x, y) => setTabMenu({ key, x, y })}
        />
        <div className="toolbar">
          <button type="button" className="toolbar__local" onClick={openLocal}>{t.localTerminal.button}</button>
          <button type="button" className="toolbar__local" onClick={() => setQuick(true)}>{t.quickConnect.button}</button>
          <LayoutSwitch tabCount={tabs.length} layout={layout} onChange={setLayout} />
        <MultiExecBar
          tabs={tabs.map((x) => ({ id: x.key, title: x.title }))}
          enabled={multiOn}
          selected={multiKeys}
          onToggle={toggleMulti}
          onSelect={setMultiKeys}
        />
        </div>
        <div className={`app__terminals layout-${layout}`}>
          {tabs.map((t) => (
            <TerminalTab
              key={t.key}
              tabKey={t.key}
              hub={hub}
              local={t.sessionId === LOCAL_SESSION_ID}
              startupCommand={sessions.find((x) => x.id === t.sessionId)?.startup}
              sessionId={t.sessionId}
              name={t.title}
              api={api}
              createTerm={createTerm}
              visible={layout !== "single" || t.key === activeKey}
              active={t.key === activeKey}
              onFocusPane={() => setActiveKey(t.key)}
              dark={resolvedTheme === "dark"}
              onStatusChange={(st) => setStatus(t.key, st)}
              retryAttempt={t.retry ?? 0}
              onReconnect={(auto) => reconnect(t.key, auto === true)}
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
            others={sessions}
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
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
          items={[
            { label: t.tabMenu.duplicate, onClick: () => duplicateTab(tabMenu.key) },
            { label: t.tabMenu.rename, onClick: () => setRenamingTab(tabMenu.key) },
            { label: t.tabMenu.closeOthers, onClick: () => closeOthers(tabMenu.key), disabled: tabs.length < 2 },
            { label: t.tabMenu.close, onClick: () => closeTab(tabMenu.key) },
          ]}
        />
      )}
      {renamingTab && (
        <div className="overlay">
          <PromptDialog
            title={t.tabMenu.renameTitle}
            label={t.tabMenu.nameLabel}
            initial={tabs.find((x) => x.key === renamingTab)?.title ?? ""}
            onSubmit={(name) => renameTab(renamingTab, name)}
            onCancel={() => setRenamingTab(null)}
          />
        </div>
      )}
      {importCandidates && (
        <div className="overlay">
          <ImportDialog candidates={importCandidates} onImport={(c) => void runImport(c)} onCancel={() => setImportCandidates(null)} />
        </div>
      )}
      {quick && (
        <div className="overlay">
          <QuickConnectDialog onConnect={(target) => void quickConnect(target)} onClose={() => setQuick(false)} />
        </div>
      )}
      {showHosts && (
        <div className="overlay">
          <KnownHostsDialog load={api.knownHostsList} onRemove={api.knownHostsRemove} onClose={() => setShowHosts(false)} />
        </div>
      )}
      {update && (
        <div className="overlay">
          <UpdateDialog
            version={update.version}
            notes={update.notes}
            state={updateState}
            progress={updateProgress}
            error={updateError}
            onInstall={() => void installUpdate()}
            onLater={() => setUpdate(null)}
          />
        </div>
      )}
      {authRequest && (
        <div className="overlay">
          <AuthPromptDialog request={authRequest} onAnswer={answerAuth} />
        </div>
      )}
      {passwordRequest && (
        <div className="overlay">
          <PasswordDialog request={passwordRequest} onAnswer={answerPassword} />
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
