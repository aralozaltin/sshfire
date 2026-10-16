import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateDialog } from "./UpdateDialog";

const base = { version: "0.2.0", notes: "Yeni sekme menüsü\nHata düzeltmeleri", state: "ready" as const, progress: null, error: null };

test("announces the version, shows the release notes and offers update or later", async () => {
  const onInstall = vi.fn();
  const onLater = vi.fn();
  render(<UpdateDialog {...base} onInstall={onInstall} onLater={onLater} />);
  expect(screen.getByText("SSHFire 0.2.0 indirilebilir.")).toBeInTheDocument();
  expect(screen.getByText(/Yeni sekme menüsü/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Güncelle ve yeniden başlat" }));
  expect(onInstall).toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Sonra" }));
  expect(onLater).toHaveBeenCalled();
});

test("without release notes the notes section is omitted", () => {
  render(<UpdateDialog {...base} notes={null} onInstall={() => {}} onLater={() => {}} />);
  expect(screen.queryByText("Yenilikler")).not.toBeInTheDocument();
});

test("while installing it shows progress and cannot be dismissed or started again", () => {
  render(<UpdateDialog {...base} state="installing" progress={{ done: 50, total: 200 }} onInstall={() => {}} onLater={() => {}} />);
  expect(screen.getByText("İndiriliyor ve kuruluyor…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  expect(screen.getByRole("button", { name: "Güncelle ve yeniden başlat" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sonra" })).toBeDisabled();
});

test("an unknown download size shows an indeterminate bar", () => {
  render(<UpdateDialog {...base} state="installing" progress={{ done: 10, total: null }} onInstall={() => {}} onLater={() => {}} />);
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
});

test("a failed install shows the reason and lets the user retry", async () => {
  const onInstall = vi.fn();
  render(<UpdateDialog {...base} state="error" error="imza doğrulanamadı" onInstall={onInstall} onLater={() => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Güncelleme kurulamadı");
  expect(screen.getByRole("alert")).toHaveTextContent("imza doğrulanamadı");
  await userEvent.click(screen.getByRole("button", { name: "Güncelle ve yeniden başlat" }));
  expect(onInstall).toHaveBeenCalled();
});
