import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TerminalTab } from "./TerminalTab";
import type { ShellApi, TermLike } from "../terminal/shellSession";

function setup(opts: { reject?: string } = {}) {
  const term: TermLike & { disposed: boolean } = {
    disposed: false,
    write: (_d, done) => done(),
    onData: () => {},
    onResize: () => {},
    size: () => ({ cols: 80, rows: 24 }),
    fit: () => {},
    focus: () => {},
    dispose() { this.disposed = true; },
  };
  let closedCb: (e: { tabId: string; reason: string | null }) => void = () => {};
  const api: ShellApi = {
    connect: vi.fn(async () => { if (opts.reject) throw opts.reject; return "t1"; }),
    shellWrite: vi.fn(async () => {}),
    shellResize: vi.fn(async () => {}),
    shellAck: vi.fn(async () => {}),
    shellClose: vi.fn(async () => {}),
    onShellClosed: vi.fn(async (cb) => { closedCb = cb; return () => {}; }),
  };
  return { term, api, emitClosed: (reason: string | null) => act(() => closedCb({ tabId: "t1", reason })) };
}

test("a closed connection keeps the terminal and shows the disconnected banner", async () => {
  const { term, api, emitClosed } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  expect(await screen.findByTestId("terminal-host")).toBeInTheDocument();
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  emitClosed("çıkış kodu 0");
  expect(await screen.findByText("Bağlantı kesildi")).toBeInTheDocument();
  expect(term.disposed).toBe(false);
});

test("a failed connect shows the error message", async () => {
  const { term, api } = setup({ reject: "Kimlik doğrulama başarısız." });
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  expect(await screen.findByText("Kimlik doğrulama başarısız.")).toBeInTheDocument();
});

test("unmounting closes the shell and disposes the terminal", async () => {
  const { term, api } = setup();
  const { unmount } = render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  unmount();
  await vi.waitFor(() => expect(api.shellClose).toHaveBeenCalledWith("t1"));
  expect(term.disposed).toBe(true);
});

test("the exit code of the remote shell is shown in the user's language", async () => {
  const { term, api, emitClosed } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  emitClosed("exit:3");
  expect(await screen.findByText("Çıkış kodu 3")).toBeInTheDocument();
});

test("live metrics start when the shell opens, update the bar and stop on unmount", async () => {
  const { term, api } = setup();
  let push: (m: unknown) => void = () => {};
  const metricsStart = vi.fn(async (_id: string, cb: (m: unknown) => void) => { push = cb; });
  const metricsStop = vi.fn(async () => {});
  const full = { ...api, metricsStart, metricsStop } as unknown as ShellApi;
  const { unmount } = render(<TerminalTab sessionId="s1" api={full} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(metricsStart).toHaveBeenCalledWith("t1", expect.any(Function));
  expect(screen.getByLabelText("İşlemci")).toHaveTextContent("—");
  act(() => push({ cpuPercent: 33, memUsed: 1, memTotal: 2, swapUsed: 0, swapTotal: 0, diskUsed: 1, diskTotal: 2, load: [0, 0, 0], uptimeSecs: 60, netRxBps: null, netTxBps: null }));
  expect(screen.getByLabelText("İşlemci")).toHaveTextContent("33%");
  unmount();
  await vi.waitFor(() => expect(metricsStop).toHaveBeenCalledWith("t1"));
});

test("the backend tab id is reported once the connection is open", async () => {
  const { term, api } = setup();
  const onTabId = vi.fn();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} onTabId={onTabId} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(onTabId).toHaveBeenCalledWith("t1");
});

test("without metrics support the bar is not shown", async () => {
  const { term, api } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(screen.queryByLabelText("İşlemci")).not.toBeInTheDocument();
});

test("the pane does not use the class name xterm.js puts on its own root element", async () => {
  const { term, api } = setup();
  const { container } = render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(container.querySelector(".terminal")).toBeNull();
  expect(container.querySelector(".shell-pane")).not.toBeNull();
});

test("the shell directory is reported and watching stops on unmount", async () => {
  const { term, api } = setup();
  let push: (c: string) => void = () => {};
  const cwdStart = vi.fn(async (_id: string, cb: (c: string) => void) => { push = cb; });
  const cwdStop = vi.fn(async () => {});
  const onCwd = vi.fn();
  const full = { ...api, cwdStart, cwdStop } as unknown as ShellApi;
  const { unmount } = render(<TerminalTab sessionId="s1" api={full} createTerm={() => term} onCwd={onCwd} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(cwdStart).toHaveBeenCalledWith("t1", expect.any(Function));
  act(() => push("/var/log"));
  expect(onCwd).toHaveBeenCalledWith("/var/log");
  unmount();
  await vi.waitFor(() => expect(cwdStop).toHaveBeenCalledWith("t1"));
});

test("a find request from the terminal opens the search bar and searches the terminal", async () => {
  const { term, api } = setup();
  let request: () => void = () => {};
  const find = vi.fn(() => true);
  const clearFind = vi.fn();
  const richTerm = { ...term, find, clearFind, onFindRequest: (cb: () => void) => { request = cb; } };
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => richTerm as unknown as typeof term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  act(() => request());
  const box = await screen.findByRole("searchbox", { name: "Terminalde ara" });
  await userEvent.type(box, "err{Enter}");
  expect(find).toHaveBeenLastCalledWith("err", true);
  await userEvent.keyboard("{Escape}");
  expect(clearFind).toHaveBeenCalled();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});

test("a local terminal does not start metrics, directory watching or report a backend id for files", async () => {
  const { term, api } = setup();
  const metricsStart = vi.fn(async () => {});
  const cwdStart = vi.fn(async () => {});
  const onTabId = vi.fn();
  const full = { ...api, metricsStart, cwdStart } as unknown as ShellApi;
  render(<TerminalTab sessionId="__local__" local api={full} createTerm={() => term} onTabId={onTabId} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(metricsStart).not.toHaveBeenCalled();
  expect(cwdStart).not.toHaveBeenCalled();
  expect(onTabId).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("İşlemci")).not.toBeInTheDocument();
});

test("the startup command is typed into the shell once the connection is open", async () => {
  const { term, api } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} startupCommand="cd /var/log && ls" />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  await vi.waitFor(() => expect(api.shellWrite).toHaveBeenCalled());
  const [, bytes] = (api.shellWrite as unknown as { mock: { calls: [string, Uint8Array][] } }).mock.calls[0];
  expect(new TextDecoder().decode(bytes)).toBe("cd /var/log && ls\r");
});

test("no startup command means nothing is typed", async () => {
  const { term, api } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  await new Promise((r) => setTimeout(r, 30));
  expect(api.shellWrite).not.toHaveBeenCalled();
});

test("the record button starts a session log and a second click stops it", async () => {
  const { term, api } = setup();
  const logStart = vi.fn(async () => "/tmp/api.log");
  const logStop = vi.fn(async () => {});
  render(<TerminalTab sessionId="s1" name="api-prod" api={{ ...api, logStart, logStop }} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  await userEvent.click(screen.getByRole("button", { name: "Oturumu kaydet" }));
  expect(logStart).toHaveBeenCalledWith("t1", expect.stringMatching(/^api-prod-\d{8}-\d{6}\.log$/));
  await userEvent.click(await screen.findByRole("button", { name: "Kaydı durdur" }));
  expect(logStop).toHaveBeenCalledWith("t1");
  expect(await screen.findByRole("button", { name: "Oturumu kaydet" })).toBeInTheDocument();
});

test("cancelling the save dialog leaves recording off", async () => {
  const { term, api } = setup();
  const logStart = vi.fn(async () => null);
  render(<TerminalTab sessionId="s1" api={{ ...api, logStart, logStop: vi.fn() }} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  await userEvent.click(screen.getByRole("button", { name: "Oturumu kaydet" }));
  await vi.waitFor(() => expect(logStart).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Kaydı durdur" })).not.toBeInTheDocument();
});

test("there is no record button when the api cannot log", async () => {
  const { term, api } = setup();
  render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} />);
  await screen.findByText(/.*/, { selector: "[data-status='open']" });
  expect(screen.queryByRole("button", { name: "Oturumu kaydet" })).not.toBeInTheDocument();
});

describe("automatic reconnect", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  const opened = async (props: Partial<React.ComponentProps<typeof TerminalTab>> = {}, opts: { reject?: string | object } = {}) => {
    const h = setup(opts as { reject?: string });
    const onReconnect = vi.fn();
    render(<TerminalTab sessionId="s1" api={h.api} createTerm={() => h.term} onReconnect={onReconnect} {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return { ...h, onReconnect };
  };

  test("a dropped connection reconnects by itself after a short wait and says so", async () => {
    const { emitClosed, onReconnect } = await opened();
    emitClosed("connection lost");
    expect(screen.getByRole("status")).toHaveTextContent("Yeniden bağlanılıyor (1/5)");
    expect(onReconnect).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onReconnect).toHaveBeenCalledWith(true);
  });

  test("the wait grows with each failed attempt", async () => {
    const { emitClosed, onReconnect } = await opened({ retryAttempt: 2 });
    emitClosed("connection lost");
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
    expect(onReconnect).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onReconnect).toHaveBeenCalledWith(true);
  });

  test("a shell the user exited on purpose is not reconnected", async () => {
    const { emitClosed, onReconnect } = await opened();
    emitClosed("exit:0");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yeniden bağlan" })).toBeInTheDocument();
  });

  test("cancel stops the countdown and leaves the manual button", async () => {
    const { emitClosed, onReconnect } = await opened();
    emitClosed("connection lost");
    await act(async () => { screen.getByRole("button", { name: "Vazgeç" }).click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yeniden bağlan" })).toBeInTheDocument();
  });

  test("it gives up after five attempts", async () => {
    const { emitClosed, onReconnect } = await opened({ retryAttempt: 5 });
    emitClosed("connection lost");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test("a first connection that fails is reported, not retried", async () => {
    const { onReconnect } = await opened({}, { reject: { code: "unreachable" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test("during a retry series an unreachable server is tried again, a wrong password is not", async () => {
    const a = await opened({ retryAttempt: 1 }, { reject: { code: "unreachable" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(a.onReconnect).toHaveBeenCalledWith(true);
  });

  test("a wrong password during a retry series stops the series", async () => {
    const { onReconnect } = await opened({ retryAttempt: 1 }, { reject: { code: "auth_failed" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test("local terminals never reconnect", async () => {
    const { emitClosed, onReconnect } = await opened({ local: true });
    emitClosed("connection lost");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(onReconnect).not.toHaveBeenCalled();
  });
});

describe("notify when the output goes quiet", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const ready = async (props: Partial<React.ComponentProps<typeof TerminalTab>> = {}) => {
    const h = setup();
    const notify = vi.fn(async () => {});
    const api = { ...h.api, notify };
    render(<TerminalTab sessionId="s1" name="api-prod" api={api} createTerm={() => h.term} {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const output = () => act(() => { (h.api.connect as ReturnType<typeof vi.fn>).mock.calls[0][3](new TextEncoder().encode("building...\r\n")); });
    const toggle = () => screen.getByRole("button", { name: /Bitince bildir|Bildirimi kapat/ });
    return { notify, output, toggle };
  };
  const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  test("after output stops for a few seconds a notification names the server and the toggle switches off", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { notify, output, toggle } = await ready();
    await act(async () => { toggle().click(); });
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    output();
    await wait(3000);
    expect(notify).not.toHaveBeenCalled();
    await wait(4000);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("api-prod", expect.stringContaining("sessiz"));
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    await wait(30000);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test("steady output keeps postponing the notification", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { notify, output, toggle } = await ready();
    await act(async () => { toggle().click(); });
    for (let i = 0; i < 6; i++) { output(); await wait(4000); }
    expect(notify).not.toHaveBeenCalled();
  });

  test("nothing is announced if there was no output after switching it on", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { notify, toggle } = await ready();
    await act(async () => { toggle().click(); });
    await wait(60000);
    expect(notify).not.toHaveBeenCalled();
  });

  test("switching it off cancels the watch", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { notify, output, toggle } = await ready();
    await act(async () => { toggle().click(); });
    output();
    await act(async () => { toggle().click(); });
    await wait(30000);
    expect(notify).not.toHaveBeenCalled();
  });

  test("if you are looking at the terminal anyway no notification is sent", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { notify, output, toggle } = await ready();
    await act(async () => { toggle().click(); });
    output();
    await wait(10000);
    expect(notify).not.toHaveBeenCalled();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  test("no toggle is offered when the api cannot notify", async () => {
    const h = setup();
    render(<TerminalTab sessionId="s1" api={h.api} createTerm={() => h.term} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("button", { name: "Bitince bildir" })).not.toBeInTheDocument();
  });
});

describe("coming back to a disconnected tab", () => {
  test("pressing R reconnects, other keys do not, and the banner says so", async () => {
    const { term, api, emitClosed } = setup();
    const onReconnect = vi.fn();
    render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} onReconnect={onReconnect} />);
    await screen.findByText(/.*/, { selector: "[data-status='open']" });
    emitClosed("exit:0");
    expect(await screen.findByText(/R tuşuna bas/)).toBeInTheDocument();
    const pane = document.querySelector(".shell-pane") as HTMLElement;
    fireEvent.keyDown(pane, { key: "x" });
    fireEvent.keyDown(pane, { key: "r", ctrlKey: true });
    expect(onReconnect).not.toHaveBeenCalled();
    fireEvent.keyDown(pane, { key: "R" });
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("R does nothing while the connection is open", async () => {
    const { term, api } = setup();
    const onReconnect = vi.fn();
    render(<TerminalTab sessionId="s1" api={api} createTerm={() => term} onReconnect={onReconnect} />);
    await screen.findByText(/.*/, { selector: "[data-status='open']" });
    fireEvent.keyDown(document.querySelector(".shell-pane") as HTMLElement, { key: "r" });
    expect(onReconnect).not.toHaveBeenCalled();
  });
});

describe("disconnecting after being idle", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
  afterEach(() => vi.useRealTimers());

  const opened = async (idleMinutes: number, extra: Partial<React.ComponentProps<typeof TerminalTab>> = {}) => {
    const h = setup();
    const onReconnect = vi.fn();
    let typed: (s: string) => void = () => {};
    h.term.onData = (cb) => { typed = cb; };
    render(<TerminalTab sessionId="s1" api={h.api} createTerm={() => h.term} idleMinutes={idleMinutes} onReconnect={onReconnect} {...extra} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return { ...h, onReconnect, type: (text: string) => act(() => typed(text)) };
  };
  const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  test("after the chosen idle time the connection is closed and the tab explains why", async () => {
    const { api, onReconnect } = await opened(15);
    await wait(14 * 60_000);
    expect(api.shellClose).not.toHaveBeenCalled();
    await wait(2 * 60_000);
    expect(api.shellClose).toHaveBeenCalledWith("t1");
    expect(screen.getByText(/15 dakika/)).toBeInTheDocument();
    await wait(10 * 60_000);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test("typing keeps the session alive and restarts the clock", async () => {
    const { api, type } = await opened(15);
    await wait(10 * 60_000);
    type("ls\r");
    await wait(10 * 60_000);
    expect(api.shellClose).not.toHaveBeenCalled();
    await wait(6 * 60_000);
    expect(api.shellClose).toHaveBeenCalledWith("t1");
  });

  test("never means never", async () => {
    const { api } = await opened(0);
    await wait(6 * 60 * 60_000);
    expect(api.shellClose).not.toHaveBeenCalled();
  });
});
