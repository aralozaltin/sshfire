import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
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
    onHostKeyPrompt: vi.fn(async (cb) => { hostKeyCb = cb; return () => {}; }),
    onShellClosed: vi.fn(async () => () => {}),
    ...sftpApi(),
    ...over,
  } as unknown as AppApi;
  return { api, promptHostKey: (e: Parameters<typeof hostKeyCb>[0]) => act(() => hostKeyCb(e)) };
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
  await userEvent.selectOptions(screen.getByLabelText("Tema"), "dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("ssh-istemci.theme")).toBe("dark");
});

test("choosing English switches the visible labels and remembers it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await screen.findByText("Test 3.81");
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
    sftpUpload: vi.fn(async () => []),
    sftpDownload: vi.fn(async () => []),
    transferCancel: vi.fn(async () => true),
    pickFiles: vi.fn(async () => []),
    onFilesDropped: vi.fn(async () => () => {}),
    onTransferProgress: vi.fn(async () => () => {}),
    metricsStart: vi.fn(async () => {}),
    metricsStop: vi.fn(async () => {}),
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
