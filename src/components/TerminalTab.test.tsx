import { act, render, screen } from "@testing-library/react";
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
