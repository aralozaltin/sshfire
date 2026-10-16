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
    startupWarning: vi.fn(async () => null as string | null),
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
  const { api } = fakeApi({ startupWarning: vi.fn(async () => "Oturum dosyası bozuktu; yedeği: /x/sessions.json.bak") } as Partial<AppApi>);
  render(<App api={api} createTerm={fakeTerm} />);
  expect(await screen.findByText(/Oturum dosyası bozuktu/)).toBeInTheDocument();
});

test("closing a tab removes it", async () => {
  const { api } = fakeApi();
  render(<App api={api} createTerm={fakeTerm} />);
  await userEvent.dblClick(await screen.findByRole("button", { name: /^Test 3\.81 root@/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Test 3.81 kapat" }));
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
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
