import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferPanel } from "./TransferPanel";
import type { TransferState } from "../files/transfers";

const t = (over: Partial<TransferState> = {}): TransferState => ({
  id: "a", direction: "upload", name: "rapor.pdf", done: 25, total: 100, state: "running", ...over,
});

test("shows name, percentage and a progress bar for a running transfer", () => {
  render(<TransferPanel transfers={[t()]} onCancel={() => {}} onDismiss={() => {}} />);
  expect(screen.getByText("rapor.pdf")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  expect(screen.getByText("%25")).toBeInTheDocument();
});

test("a running transfer can be cancelled; a finished one cannot", async () => {
  const onCancel = vi.fn();
  const { rerender } = render(<TransferPanel transfers={[t()]} onCancel={onCancel} onDismiss={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "İptal et" }));
  expect(onCancel).toHaveBeenCalledWith("a");
  rerender(<TransferPanel transfers={[t({ state: "done", done: 100 })]} onCancel={onCancel} onDismiss={() => {}} />);
  expect(screen.queryByRole("button", { name: "İptal et" })).not.toBeInTheDocument();
});

test("finished transfers can be dismissed", async () => {
  const onDismiss = vi.fn();
  render(<TransferPanel transfers={[t({ state: "done", done: 100 })]} onCancel={() => {}} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
  expect(onDismiss).toHaveBeenCalledWith("a");
});

test("an error stays visible with a translated message", () => {
  render(<TransferPanel transfers={[t({ state: "error", error: { code: "permission_denied" } })]} onCancel={() => {}} onDismiss={() => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Erişim reddedildi");
});

test("a finished download shows where it was saved", () => {
  render(<TransferPanel transfers={[t({ direction: "download", state: "done", done: 100, localPath: "/Users/u/Downloads/rapor.pdf" })]} onCancel={() => {}} onDismiss={() => {}} />);
  expect(screen.getByText("/Users/u/Downloads/rapor.pdf")).toBeInTheDocument();
});

test("renders nothing when there are no transfers", () => {
  const { container } = render(<TransferPanel transfers={[]} onCancel={() => {}} onDismiss={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
