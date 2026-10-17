import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickConnectDialog } from "./QuickConnectDialog";

test("Enter submits a valid target", async () => {
  const onConnect = vi.fn();
  render(<QuickConnectDialog onConnect={onConnect} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("Adres"), "deploy@10.0.0.5:2222{Enter}");
  expect(onConnect).toHaveBeenCalledWith({ user: "deploy", host: "10.0.0.5", port: 2222 });
});

test("an invalid target shows an error and does not connect", async () => {
  const onConnect = vi.fn();
  render(<QuickConnectDialog onConnect={onConnect} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText("Adres"), "just-a-host");
  await userEvent.click(screen.getByRole("button", { name: "Bağlan" }));
  expect(screen.getByRole("alert")).toHaveTextContent("kullanıcı@sunucu");
  expect(onConnect).not.toHaveBeenCalled();
});

test("Escape and the cancel button close the dialog", async () => {
  const onClose = vi.fn();
  render(<QuickConnectDialog onConnect={() => {}} onClose={onClose} />);
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
