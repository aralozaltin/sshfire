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
