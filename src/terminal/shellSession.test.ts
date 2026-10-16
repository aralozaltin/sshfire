import { ShellSession, type ShellApi, type TermLike } from "./shellSession";

function fakeTerm() {
  const writes: { data: Uint8Array; done: () => void }[] = [];
  const term: TermLike & { writes: typeof writes; disposed: boolean } = {
    writes,
    disposed: false,
    write: (data, done) => writes.push({ data, done }),
    onData: () => {},
    onResize: () => {},
    size: () => ({ cols: 100, rows: 30 }),
    fit: () => {},
    focus: () => {},
    dispose() { this.disposed = true; },
  };
  return term;
}

function fakeApi(tabId = "tab-1") {
  let feed: (b: Uint8Array) => void = () => {};
  let closedCb: (e: { tabId: string; reason: string | null }) => void = () => {};
  let resolveConnect: (id: string) => void = () => {};
  let rejectConnect: (e: unknown) => void = () => {};
  const api = {
    sent: [] as { tabId: string; data: Uint8Array }[],
    acks: [] as { tabId: string; bytes: number }[],
    resizes: [] as { tabId: string; cols: number; rows: number }[],
    closedTabs: [] as string[],
    connect: vi.fn((_s: string, _c: number, _r: number, onData: (b: Uint8Array) => void) => {
      feed = onData;
      return new Promise<string>((res, rej) => { resolveConnect = res; rejectConnect = rej; });
    }),
    shellWrite: vi.fn(async (t: string, d: Uint8Array) => { api.sent.push({ tabId: t, data: d }); }),
    shellResize: vi.fn(async (t: string, c: number, r: number) => { api.resizes.push({ tabId: t, cols: c, rows: r }); }),
    shellAck: vi.fn(async (t: string, b: number) => { api.acks.push({ tabId: t, bytes: b }); }),
    shellClose: vi.fn(async (t: string) => { api.closedTabs.push(t); }),
    onShellClosed: vi.fn(async (cb: (e: { tabId: string; reason: string | null }) => void) => { closedCb = cb; return () => {}; }),
    feed: (b: Uint8Array) => feed(b),
    emitClosed: (id: string, reason: string | null) => closedCb({ tabId: id, reason }),
    resolve: () => resolveConnect(tabId),
    reject: (e: unknown) => rejectConnect(e),
  };
  return api satisfies ShellApi & Record<string, unknown>;
}

const bytes = (n: number) => new Uint8Array(n);

test("acks bytes only after the terminal has finished writing them", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.resolve(); await opening;
  api.feed(bytes(10));
  expect(api.acks).toEqual([]);
  term.writes[0].done();
  expect(api.acks).toEqual([{ tabId: "tab-1", bytes: 10 }]);
});

test("acks for data that arrives before the tab id is known are sent once it is", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess");
  api.feed(bytes(7)); term.writes[0].done();
  expect(api.acks).toEqual([]);
  api.resolve(); await opening;
  expect(api.acks).toEqual([{ tabId: "tab-1", bytes: 7 }]);
  expect(s.status).toBe("open");
});

test("a closed event for this tab marks the session closed and keeps the terminal", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.resolve(); await opening;
  api.emitClosed("baska-sekme", "x");
  expect(s.status).toBe("open");
  api.emitClosed("tab-1", "çıkış kodu 0");
  expect(s.status).toBe("closed");
  expect(s.closeReason).toBe("çıkış kodu 0");
  expect(term.disposed).toBe(false);
});

test("a failed connect sets the error text and closes the session", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.reject("Kimlik doğrulama başarısız."); await opening;
  expect(s.status).toBe("closed");
  expect(s.error).toBe("Kimlik doğrulama başarısız.");
});

test("typed input is sent as UTF-8 bytes", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.resolve(); await opening;
  s.send("şö\r");
  expect(Array.from(api.sent[0].data)).toEqual(Array.from(new TextEncoder().encode("şö\r")));
});

test("resize is forwarded and input after close is ignored", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.resolve(); await opening;
  s.resize(120, 40);
  expect(api.resizes).toEqual([{ tabId: "tab-1", cols: 120, rows: 40 }]);
  api.emitClosed("tab-1", null);
  s.send("x");
  expect(api.sent).toEqual([]);
});

test("connect is called with the terminal size", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess"); api.resolve(); await opening;
  expect(api.connect.mock.calls[0].slice(0, 3)).toEqual(["sess", 100, 30]);
});

test("closing before connect resolves closes the tab as soon as it exists", async () => {
  const api = fakeApi(); const term = fakeTerm();
  const s = new ShellSession(api, term);
  const opening = s.open("sess");
  await s.close();
  expect(api.closedTabs).toEqual([]);
  api.resolve(); await opening;
  expect(api.closedTabs).toEqual(["tab-1"]);
  expect(s.status).toBe("closed");
});
