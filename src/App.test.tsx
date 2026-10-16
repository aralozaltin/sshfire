import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { DEFAULT_SIDEBAR_WIDTH } from "./layout/sidebarWidth";
import type { AppApi } from "./api";
import type { Session } from "./types";
import type { TermLike } from "./terminal/shellSession";

const existing: Session = { id: "1", name: "Test 3.81", host: "192.168.3.81", port: 22, user: "root", folder: "Test", auth: { type: "password" } };

function fakeTerm(): TermLike {
  return { write: (_d, done) => done(), onData: () => {}, onResize: () => {}, size: () => ({ cols: 80, rows: 24 }), fit: () => {}, focus: () => {}, dispose: () => {} };
}

function fakeApi(over: Partial<AppApi> = {}) {
  let sessions = [existing];
  let hostKeyCb: (e: { requestId: string; host: string; port: number; fingerprint: string }) => void = () => {};
  let passwordCb: (e: { requestId: string; host: string; user: string; kind?: "password" | "passphrase" }) => void = () => {};
  let authCb: (e: { requestId: string; host: string; user: string; name: string; instructions: string; prompts: { text: string; echo: boolean }[] }) => void = () => {};
  const api = {
    listSessions: vi.fn(async () => sessions),
    startupWarning: vi.fn(async () => [] as { code: string; backup: string }[]),
    addSession: vi.fn(async (s, _pw) => { const added = { ...s, id: "2" } as Session; sessions = [...sessions, added]; return added; }),
    updateSession: vi.fn(async () => {}),
    removeSession: vi.fn(async (id: string) => { sessions = sessions.filter((x) => x.id !== id); }),
    connect: vi.fn(async () => "tab-1"),
    shellWrite: vi.fn(async () => {}),
    shellResize: vi.fn(async () => {}),
    shellAck: vi.fn(async () => {}),
    shellClose: vi.fn(async () => {}),
    answerHostKey: vi.fn(async () => {}),
    answerAuth: vi.fn(async () => {}),
    onAuthPrompt: vi.fn(async (cb) => { authCb = cb; return () => {}; }),
    answerPassword: vi.fn(async () => {}),
    onPasswordPrompt: vi.fn(async (cb) => { passwordCb = cb; return () => {}; }),
    onHostKeyPrompt: vi.fn(async (cb) => { hostKeyCb = cb; return () => {}; }),
    onShellClosed: vi.fn(async () => () => {}),
    ...sftpApi(),
    checkForUpdate: vi.fn(async () => null),
    appVersion: vi.fn(async () => "0.1.0"),
    sshConfigHosts: vi.fn(async () => ({ hosts: [], defaultUser: "u" })),
    exportSessions: vi.fn(async () => "/tmp/yedek.json"),
    importSessions: vi.fn(async () => ({ added: 2, skipped: 1 })),
    tunnelStart: vi.fn(async (_t: string, spec: { listen_port: number }) => ({ id: "r1", spec, localPort: spec.listen_port, connections: 0 })),
    tunnelStop: vi.fn(async () => {}),
    tunnelList: vi.fn(async () => []),
    ...over,
  } as unknown as AppApi;
  return { api, promptHostKey: (e: Parameters<typeof hostKeyCb>[0]) => act(() => hostKeyCb(e)), promptPassword: (e: Parameters<typeof passwordCb>[0]) => act(() => passwordCb(e)), promptAuth: (e: Parameters<typeof authCb>[0]) => act(() => authCb(e)) };
}

test("renders the servers navigation with saved sessions", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  const nav = screen.getByRole("navigation", { name: "Sunucular" });
  expect(await within(nav).findByText("Test 3.81")).toBeInTheDocument();
});

test("clicking a server opens a connected terminal tab", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  expect(await screen.findByRole("tab", { name: /Test 3.81/ })).toBeInTheDocument();
  expect(api.connect).toHaveBeenCalledWith("1", 80, 24, expect.any(Function));
});

test("adding a server saves it with the password and lists it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Sunucu ekle" }));
  await userEvent.type(screen.getByLabelText("Ad"), "Yeni");
  await userEvent.type(screen.getByLabelText("Adres"), "10.1.1.1");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "admin");
  await userEvent.type(screen.getByLabelText("Parola"), "pw");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(api.addSession).toHaveBeenCalledWith(expect.objectContaining({ name: "Yeni", host: "10.1.1.1" }), "pw");
  expect(await screen.findByText("Yeni")).toBeInTheDocument();
});

test("a host key prompt shows the dialog and the answer goes back to the backend", async () => {
  const { api, promptHostKey } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  promptHostKey({ requestId: "r9", host: "192.168.3.81", port: 22, fingerprint: "SHA256:zzz" });
  expect(await screen.findByText("SHA256:zzz")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Güven ve bağlan" }));
  expect(api.answerHostKey).toHaveBeenCalledWith("r9", true);
  expect(screen.queryByText("SHA256:zzz")).not.toBeInTheDocument();
});

test("a startup warning from a corrupt file is shown", async () => {
  const { api } = fakeApi({ startupWarning: vi.fn(async () => [{ code: "sessions_corrupt", backup: "/x/sessions.json.bak" }]) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  expect(await screen.findByText(/Oturum dosyası bozuktu/)).toBeInTheDocument();
});

test("closing a tab removes it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Test 3.81 kapat" }));
  expect(screen.queryByRole("tab", { name: /Test 3.81/ })).not.toBeInTheDocument();
});

test("deleting asks for confirmation inside the app and removes on confirm", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Test 3.81 sil" }));
  expect(api.removeSession).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog", { name: "Silme onayı" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sil" }));
  expect(api.removeSession).toHaveBeenCalledWith("1");
});

test("cancelling the delete confirmation keeps the server", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Test 3.81 sil" }));
  await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(api.removeSession).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("choosing the dark theme sets data-theme and remembers it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  await userEvent.selectOptions(screen.getByLabelText("Tema"), "dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("ssh-istemci.theme")).toBe("dark");
});

test("choosing English switches the visible labels and remembers it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  await userEvent.selectOptions(screen.getByLabelText("Dil"), "en");
  expect(screen.getByRole("navigation", { name: "Servers" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add server" })).toBeInTheDocument();
  expect(screen.getByLabelText("Theme")).toBeInTheDocument();
  expect(localStorage.getItem("ssh-istemci.locale")).toBe("en");
  await userEvent.selectOptions(screen.getByLabelText("Language"), "tr");
  expect(screen.getByRole("navigation", { name: "Sunucular" })).toBeInTheDocument();
});

test("backend errors are shown in the chosen language", async () => {
  const { api } = fakeApi({ addSession: vi.fn(async () => { throw { code: "invalid_session", detail: "host empty" }; }) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  await userEvent.selectOptions(screen.getByLabelText("Dil"), "en");
  await userEvent.click(screen.getByRole("button", { name: "Add server" }));
  await userEvent.type(screen.getByLabelText("Name"), "x");
  await userEvent.type(screen.getByLabelText("Address"), "h");
  await userEvent.type(screen.getByLabelText("User"), "u");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/Invalid server: host empty/)).toBeInTheDocument();
});

function sftpApi() {
  return {
    sftpHome: vi.fn(async () => "/home/u"),
    sftpList: vi.fn(async () => []),
    sftpMkdir: vi.fn(async () => {}),
    sftpRename: vi.fn(async () => {}),
    sftpRemove: vi.fn(async () => {}),
    sftpCopy: vi.fn(async () => {}),
    sftpReadText: vi.fn(async () => ""),
    sftpWriteText: vi.fn(async () => {}),
    sftpUpload: vi.fn(async () => []),
    sftpDownload: vi.fn(async () => []),
    transferCancel: vi.fn(async () => true),
    pickFiles: vi.fn(async () => []),
    onFilesDropped: vi.fn(async () => () => {}),
    sftpChmod: vi.fn(async () => {}),
    sftpEditExternal: vi.fn(async () => ""),
    onExternalEditSync: vi.fn(async () => () => {}),
    onTransferProgress: vi.fn(async () => () => {}),
    metricsStart: vi.fn(async () => {}),
    metricsStop: vi.fn(async () => {}),
    cwdStart: vi.fn(async (_id: string, _cb: (c: string) => void) => {}),
    cwdStop: vi.fn(async () => {}),
  };
}

test("the files tab shows the hint without a connection", async () => {
  const { api } = fakeApi(sftpApi() as unknown as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  expect(screen.getByText(/Bir sunucuya bağlan/)).toBeInTheDocument();
});

test("the files tab follows the connected terminal and remembers its folder", async () => {
  const extra = sftpApi();
  const { api } = fakeApi(extra as unknown as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await screen.findByRole("tab", { name: /Test 3.81/ });
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  await vi.waitFor(() => expect(extra.sftpList).toHaveBeenCalledWith("tab-1", "/home/u"));
  await userEvent.click(screen.getByRole("tab", { name: "Sunucular" }));
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  await vi.waitFor(() => expect(extra.sftpList.mock.calls.length).toBeGreaterThanOrEqual(2));
});

test("connecting starts metrics for the new terminal", async () => {
  const extra = sftpApi();
  const { api } = fakeApi(extra as unknown as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(extra.metricsStart).toHaveBeenCalledWith("tab-1", expect.any(Function)));
});

test("dragging the splitter resizes the sidebar and remembers the width", async () => {
  const { api } = fakeApi();
  const { container } = render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  const bar = screen.getByRole("separator", { name: "Kenar çubuğu genişliği" });
  fireEvent.mouseDown(bar, { clientX: DEFAULT_SIDEBAR_WIDTH });
  fireEvent.mouseMove(window, { clientX: DEFAULT_SIDEBAR_WIDTH - 60 });
  fireEvent.mouseUp(window);
  const expected = DEFAULT_SIDEBAR_WIDTH - 60;
  expect((container.querySelector(".app") as HTMLElement).style.gridTemplateColumns).toBe(`${expected}px 5px 1fr`);
  expect(localStorage.getItem("ssh-istemci.sidebarWidth")).toBe(String(expected));
});

test("the files panel follows the directory the terminal reports", async () => {
  const extra = sftpApi();
  let pushCwd: (c: string) => void = () => {};
  extra.cwdStart = vi.fn(async (_id: string, cb: (c: string) => void) => { pushCwd = cb; });
  const { api } = fakeApi(extra as unknown as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(extra.cwdStart).toHaveBeenCalledWith("tab-1", expect.any(Function)));
  act(() => pushCwd("/var/log"));
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  await vi.waitFor(() => expect(extra.sftpList).toHaveBeenCalledWith("tab-1", "/var/log"));
  act(() => pushCwd("/etc"));
  await vi.waitFor(() => expect(extra.sftpList).toHaveBeenCalledWith("tab-1", "/etc"));
});

async function connectAgain() {
  await userEvent.click(screen.getByRole("tab", { name: "Sunucular" }));
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
}

test("MultiExec sends what is typed in one terminal to the other selected terminal", async () => {
  const terms: { type: (t: string) => void }[] = [];
  const createTerm = () => {
    let cb: (t: string) => void = () => {};
    terms.push({ type: (t) => cb(t) });
    return { ...fakeTerm(), onData: (c: (t: string) => void) => { cb = c; } };
  };
  let n = 0;
  const { api } = fakeApi({ connect: vi.fn(async () => `tab-${++n}`) } as Partial<AppApi>);
  render(<App api={api} createTerm={createTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await connectAgain();
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledTimes(2));
  await userEvent.click(await screen.findByRole("button", { name: "MultiExec" }));
  terms[0].type("uptime\r");
  const writes = (api.shellWrite as unknown as { mock: { calls: [string, Uint8Array][] } }).mock.calls.map(([id]) => id);
  await vi.waitFor(() => expect(new Set(writes).size).toBe(2));
});

test("without MultiExec typing stays in its own terminal", async () => {
  const terms: { type: (t: string) => void }[] = [];
  const createTerm = () => {
    let cb: (t: string) => void = () => {};
    terms.push({ type: (t) => cb(t) });
    return { ...fakeTerm(), onData: (c: (t: string) => void) => { cb = c; } };
  };
  let n = 0;
  const { api } = fakeApi({ connect: vi.fn(async () => `tab-${++n}`) } as Partial<AppApi>);
  render(<App api={api} createTerm={createTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await connectAgain();
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledTimes(2));
  terms[0].type("ls\r");
  const ids = (api.shellWrite as unknown as { mock: { calls: [string, Uint8Array][] } }).mock.calls.map(([id]) => id);
  expect(new Set(ids).size).toBe(1);
});

test("a password prompt from the backend shows a dialog and sends the answer", async () => {
  const { api, promptPassword } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  promptPassword({ requestId: "p1", host: "192.168.3.81", user: "root" });
  expect(await screen.findByText("root@192.168.3.81 için parola gir.")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Parola"), "gizli");
  await userEvent.click(screen.getByRole("checkbox", { name: /Parolayı hatırla/ }));
  await userEvent.click(screen.getByRole("button", { name: "Bağlan" }));
  expect(api.answerPassword).toHaveBeenCalledWith("p1", "gizli", true);
  expect(screen.queryByLabelText("Parola")).not.toBeInTheDocument();
});

test("cancelling the password prompt answers with no password", async () => {
  const { api, promptPassword } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  promptPassword({ requestId: "p2", host: "h", user: "u" });
  await userEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
  expect(api.answerPassword).toHaveBeenCalledWith("p2", null, false);
});

test("importing from ssh config adds the chosen hosts with key files and a folder", async () => {
  const extra = {
    sshConfigHosts: vi.fn(async () => ({
      defaultUser: "aral",
      hosts: [
        { alias: "prod", hostName: "10.0.0.5", user: "deploy", port: 2222, identityFile: "/Users/aral/.ssh/prod", proxyJump: null },
        { alias: "web", hostName: "web.example.com", user: null, port: null, identityFile: null, proxyJump: null },
        { alias: "Test 3.81", hostName: "192.168.3.81", user: "root", port: 22, identityFile: null, proxyJump: null },
        { alias: "inner", hostName: "10.9.9.9", user: "root", port: 22, identityFile: null, proxyJump: "deploy@Test 3.81:22" },
      ],
    })),
  };
  const { api } = fakeApi(extra as unknown as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SSH config'den al" }));
  expect(await screen.findByText("deploy@10.0.0.5:2222")).toBeInTheDocument();
  expect(screen.getByText("zaten var")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "3 sunucuyu içe aktar" }));
  await vi.waitFor(() => expect(api.addSession).toHaveBeenCalledTimes(3));
  expect(api.addSession).toHaveBeenCalledWith(
    { name: "prod", host: "10.0.0.5", port: 2222, user: "deploy", folder: "ssh config", auth: { type: "key_file", path: "/Users/aral/.ssh/prod" } },
    undefined,
  );
  expect(api.addSession).toHaveBeenCalledWith(
    { name: "web", host: "web.example.com", port: 22, user: "aral", folder: "ssh config", auth: { type: "password" } },
    undefined,
  );
  await vi.waitFor(() => expect(api.updateSession).toHaveBeenCalledWith(expect.objectContaining({ name: "inner", jump: "1" }), undefined));
});

test("the tunnels tab saves a new tunnel on the session and starts it on the active connection", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole("tab", { name: "Tüneller" }));
  await userEvent.type(screen.getByLabelText("Yerel port"), "8080");
  await userEvent.type(screen.getByLabelText("Hedef adres"), "db.internal");
  await userEvent.type(screen.getByLabelText("Hedef port"), "5432");
  await userEvent.click(screen.getByRole("button", { name: "Ekle" }));
  const saved = { kind: "local", listen_port: 8080, dest_host: "db.internal", dest_port: 5432 };
  await vi.waitFor(() => expect(api.updateSession).toHaveBeenCalledWith(expect.objectContaining({ id: "1", tunnels: [saved] }), undefined));
});

test("starting and stopping a saved tunnel goes through the backend with the connection id", async () => {
  const saved = { kind: "dynamic", listen_port: 1080 };
  let sessions = [{ id: "1", name: "Test 3.81", host: "192.168.3.81", port: 22, user: "root", folder: "Test", auth: { type: "password" }, tunnels: [saved] }];
  let running: unknown[] = [];
  const { api } = fakeApi({
    listSessions: vi.fn(async () => sessions),
    tunnelStart: vi.fn(async (_t: string, spec: unknown) => { running = [{ id: "r1", spec, localPort: 1080, connections: 0 }]; return running[0]; }),
    tunnelStop: vi.fn(async () => { running = []; }),
    tunnelList: vi.fn(async () => running),
  } as unknown as Partial<AppApi>);
  void sessions;
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole("tab", { name: "Tüneller" }));
  await userEvent.click(await screen.findByRole("button", { name: "Başlat" }));
  expect(api.tunnelStart).toHaveBeenCalledWith("tab-1", saved);
  await userEvent.click(await screen.findByRole("button", { name: "Durdur" }));
  expect(api.tunnelStop).toHaveBeenCalledWith("tab-1", "r1");
});

function typingTerms() {
  const terms: { type: (t: string) => void }[] = [];
  const createTerm = () => {
    let cb: (t: string) => void = () => {};
    terms.push({ type: (t) => cb(t) });
    return { ...fakeTerm(), onData: (c: (t: string) => void) => { cb = c; } };
  };
  return { terms, createTerm };
}

test("a macro created in the macros tab runs in the active terminal with Enter at the end", async () => {
  const { terms, createTerm } = typingTerms();
  void terms;
  const { api } = fakeApi();
  render(<App api={api} createTerm={createTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole("tab", { name: "Makrolar" }));
  await userEvent.click(screen.getByRole("button", { name: "Yeni makro" }));
  await userEvent.type(screen.getByLabelText("Ad"), "Uptime");
  await userEvent.type(screen.getByLabelText(/Komutlar/), "uptime");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(JSON.parse(localStorage.getItem("ssh-istemci.macros")!)).toEqual([expect.objectContaining({ name: "Uptime", text: "uptime" })]);
  await userEvent.click(screen.getByRole("button", { name: "Çalıştır" }));
  await vi.waitFor(() => expect(api.shellWrite).toHaveBeenCalled());
  const [id, bytes] = (api.shellWrite as unknown as { mock: { calls: [string, Uint8Array][] } }).mock.calls[0];
  expect(id).toBe("tab-1");
  expect(new TextDecoder().decode(bytes)).toBe("uptime\r");
});

test("recording captures what is typed in the terminal and saves it as a macro", async () => {
  const { terms, createTerm } = typingTerms();
  const { api } = fakeApi();
  render(<App api={api} createTerm={createTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalled());
  await userEvent.click(await screen.findByRole("tab", { name: "Makrolar" }));
  await userEvent.click(screen.getByRole("button", { name: "Kaydı başlat" }));
  expect(screen.getByText(/Kayıt sürüyor/)).toBeInTheDocument();
  act(() => terms[0].type("ls -la\r"));
  act(() => terms[0].type("pwd\r"));
  await userEvent.click(screen.getByRole("button", { name: "Kaydı durdur" }));
  expect(await screen.findByText("Kaydedilen makro")).toBeInTheDocument();
  expect(screen.getByText("ls -la ⏎pwd ⏎")).toBeInTheDocument();
});

test("macros are not available to run without a connection", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("tab", { name: "Makrolar" }));
  expect(screen.getByText("Makroyu çalıştırmak için bir sunucuya bağlan.")).toBeInTheDocument();
});

test("exporting tells the user where the file was saved and cancelling says nothing", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Dışa aktar" }));
  expect(await screen.findByText("Sunucu listesi kaydedildi: /tmp/yedek.json")).toBeInTheDocument();
});

test("importing from a file reloads the list and reports what happened", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  const before = (api.listSessions as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Dosyadan al" }));
  expect(await screen.findByText("2 sunucu eklendi, 1 tanesi zaten vardı.")).toBeInTheDocument();
  expect((api.listSessions as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(before);
});

test("cancelling the import file dialog changes nothing", async () => {
  const { api } = fakeApi({ importSessions: vi.fn(async () => null) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Dosyadan al" }));
  await new Promise((r) => setTimeout(r, 30));
  expect(screen.queryByText(/sunucu eklendi/)).not.toBeInTheDocument();
});

async function openTwoTabs() {
  let n = 0;
  const { api } = fakeApi({ connect: vi.fn(async () => `tab-${++n}`) } as Partial<AppApi>);
  const view = render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await connectAgain();
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledTimes(2));
  return { api, container: view.container };
}

test("tiling shows every terminal at once and single mode shows only the active one", async () => {
  const { container } = await openTwoTabs();
  const panes = () => [...container.querySelectorAll<HTMLElement>(".shell-pane")];
  expect(panes().filter((p) => !p.hidden)).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Yan yana" }));
  expect(panes().filter((p) => !p.hidden)).toHaveLength(2);
  expect(container.querySelector(".app__terminals")).toHaveClass("layout-cols");
  await userEvent.click(screen.getByRole("button", { name: "Alt alta" }));
  expect(container.querySelector(".app__terminals")).toHaveClass("layout-rows");
  await userEvent.click(screen.getByRole("button", { name: "Tek" }));
  expect(panes().filter((p) => !p.hidden)).toHaveLength(1);
});

test("clicking a tiled pane makes it the active one and the active pane is marked", async () => {
  const { container } = await openTwoTabs();
  await userEvent.click(screen.getByRole("button", { name: "Yan yana" }));
  const panes = [...container.querySelectorAll<HTMLElement>(".shell-pane")];
  const activeBefore = panes.findIndex((p) => p.classList.contains("shell-pane--active"));
  const other = activeBefore === 0 ? 1 : 0;
  await userEvent.click(panes[other]);
  expect(panes[other]).toHaveClass("shell-pane--active");
  expect(panes[activeBefore]).not.toHaveClass("shell-pane--active");
});

test("the tab menu duplicates a connection, renames a tab and closes the others", async () => {
  let n = 0;
  const { api } = fakeApi({ connect: vi.fn(async () => `tab-${++n}`) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  const tab = await screen.findByRole("tab", { name: /Test 3.81/ });
  fireEvent.contextMenu(tab);
  await userEvent.click(screen.getByRole("menuitem", { name: "Çoğalt" }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledTimes(2));
  expect(screen.getAllByRole("tab", { name: /Test 3.81/ })).toHaveLength(2);

  fireEvent.contextMenu(screen.getAllByRole("tab", { name: /Test 3.81/ })[0]);
  await userEvent.click(screen.getByRole("menuitem", { name: "Yeniden adlandır" }));
  const box = screen.getByLabelText("Sekme adı");
  await userEvent.clear(box);
  await userEvent.type(box, "Üretim{Enter}");
  expect(await screen.findByRole("tab", { name: /Üretim/ })).toBeInTheDocument();

  fireEvent.contextMenu(screen.getByRole("tab", { name: /Üretim/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Diğerlerini kapat" }));
  await vi.waitFor(() => expect(screen.getAllByRole("tab", { name: /Üretim|Test 3.81/ })).toHaveLength(1));
  expect(screen.getByRole("tab", { name: /Üretim/ })).toBeInTheDocument();
});

test("the local terminal button opens a local tab and keeps files, metrics and tunnels out of it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Yerel terminal" }));
  expect(await screen.findByRole("tab", { name: /Yerel/ })).toBeInTheDocument();
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledWith("__local__", 80, 24, expect.any(Function)));
  expect(api.metricsStart).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("tab", { name: "Dosyalar" }));
  expect(screen.getByText(/Bir sunucuya bağlan/)).toBeInTheDocument();
});

test("the settings button opens a small panel with theme and language", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  expect(screen.queryByLabelText("Tema")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  expect(screen.getByLabelText("Tema")).toBeInTheDocument();
  expect(screen.getByLabelText("Dil")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByLabelText("Tema")).not.toBeInTheDocument();
});

test("when a server connection opens the Files tab is shown automatically, once", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await vi.waitFor(() => expect(screen.getByRole("tab", { name: "Dosyalar" })).toHaveAttribute("aria-selected", "true"));
  await userEvent.click(screen.getByRole("tab", { name: "Sunucular" }));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByRole("tab", { name: "Sunucular" })).toHaveAttribute("aria-selected", "true");
});

test("a local terminal does not steal the sidebar tab", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Yerel terminal" }));
  await vi.waitFor(() => expect(api.connect).toHaveBeenCalledWith("__local__", 80, 24, expect.any(Function)));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByRole("tab", { name: "Sunucular" })).toHaveAttribute("aria-selected", "true");
});

test("a keyboard-interactive question from the server is answered through the dialog", async () => {
  const { api, promptAuth } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  promptAuth({ requestId: "k1", host: "10.0.0.9", user: "deploy", name: "", instructions: "", prompts: [{ text: "Verification code: ", echo: false }] });
  await userEvent.type(await screen.findByLabelText("Verification code:"), "424242{Enter}");
  expect(api.answerAuth).toHaveBeenCalledWith("k1", ["424242"]);
  expect(screen.queryByLabelText("Verification code:")).not.toBeInTheDocument();
});

test("a passphrase prompt shows the key-file wording", async () => {
  const { api, promptPassword } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  promptPassword({ requestId: "p9", host: "h", user: "u", kind: "passphrase" });
  expect(await screen.findByText("Anahtar parolası gerekli")).toBeInTheDocument();
});

const newer = (install = vi.fn(async (onProgress: (d: number, t: number | null) => void) => { onProgress(50, 100); })) => ({
  version: "0.2.0", notes: "Yeni özellikler", install,
});

test("on startup a newer version opens the update dialog and records the check time", async () => {
  const { api } = fakeApi({ checkForUpdate: vi.fn(async () => newer()) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  expect(await screen.findByText("SSHFire 0.2.0 indirilebilir.")).toBeInTheDocument();
  expect(localStorage.getItem("ssh-istemci.lastUpdateCheck")).not.toBeNull();
});

test("no automatic check happens when it is switched off or was done within a day", async () => {
  localStorage.setItem("ssh-istemci.autoUpdate", "false");
  const first = fakeApi();
  const { unmount } = render(<App api={first.api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  expect(first.api.checkForUpdate).not.toHaveBeenCalled();
  unmount();
  localStorage.setItem("ssh-istemci.autoUpdate", "true");
  localStorage.setItem("ssh-istemci.lastUpdateCheck", String(Date.now() - 3600_000));
  const second = fakeApi();
  render(<App api={second.api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  expect(second.api.checkForUpdate).not.toHaveBeenCalled();
});

test("later closes the dialog without installing", async () => {
  const install = vi.fn(async () => {});
  const { api } = fakeApi({ checkForUpdate: vi.fn(async () => newer(install)) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.click(await screen.findByRole("button", { name: "Sonra" }));
  expect(screen.queryByText("SSHFire 0.2.0 indirilebilir.")).not.toBeInTheDocument();
  expect(install).not.toHaveBeenCalled();
});

test("updating installs the new version and shows the download progress", async () => {
  let report: (d: number, t: number | null) => void = () => {};
  let finish: () => void = () => {};
  const install = vi.fn((onProgress: (d: number, t: number | null) => void) => {
    report = onProgress;
    return new Promise<void>((res) => { finish = res; });
  });
  const { api } = fakeApi({ checkForUpdate: vi.fn(async () => newer(install as never)) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.click(await screen.findByRole("button", { name: "Güncelle ve yeniden başlat" }));
  expect(install).toHaveBeenCalled();
  act(() => report(30, 120));
  expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  act(() => finish());
});

test("a failed installation shows the reason and allows a retry", async () => {
  const install = vi.fn(async () => { throw new Error("imza doğrulanamadı"); });
  const { api } = fakeApi({ checkForUpdate: vi.fn(async () => newer(install as never)) } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.click(await screen.findByRole("button", { name: "Güncelle ve yeniden başlat" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("imza doğrulanamadı");
  expect(screen.getByRole("button", { name: "Güncelle ve yeniden başlat" })).toBeEnabled();
});

test("the settings panel shows the version and checks manually even when automatic checks are off", async () => {
  localStorage.setItem("ssh-istemci.autoUpdate", "false");
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  expect(await screen.findByText("Sürüm 0.1.0")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Güncellemeleri denetle" }));
  expect(await screen.findByText("Güncelsin (sürüm 0.1.0).")).toBeInTheDocument();
  expect(api.checkForUpdate).toHaveBeenCalledTimes(1);
});

test("a manual check that finds an update opens the dialog and a failing check says so", async () => {
  localStorage.setItem("ssh-istemci.autoUpdate", "false");
  const check = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("ağ yok")).mockResolvedValueOnce(newer());
  const { api } = fakeApi({ checkForUpdate: check } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  const button = () => screen.getByRole("button", { name: "Güncellemeleri denetle" });
  await userEvent.click(button());
  await screen.findByText("Güncelsin (sürüm 0.1.0).");
  await userEvent.click(button());
  expect(await screen.findByText("Güncelleme denetlenemedi.")).toBeInTheDocument();
  await userEvent.click(button());
  expect(await screen.findByText("SSHFire 0.2.0 indirilebilir.")).toBeInTheDocument();
});

test("the automatic check switch is saved", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
  await userEvent.click(screen.getByRole("button", { name: "Ayarlar" }));
  const box = screen.getByRole("checkbox", { name: "Açılışta otomatik denetle" });
  expect(box).toBeChecked();
  await userEvent.click(box);
  expect(localStorage.getItem("ssh-istemci.autoUpdate")).toBe("false");
});
