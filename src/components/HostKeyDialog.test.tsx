import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostKeyDialog } from "./HostKeyDialog";

const request = { requestId: "r1", host: "192.168.3.81", port: 22, fingerprint: "SHA256:abc123" };

test("shows host, port and fingerprint", () => {
  render(<HostKeyDialog request={request} onAnswer={() => {}} />);
  expect(screen.getByText("192.168.3.81:22")).toBeInTheDocument();
  expect(screen.getByText("SHA256:abc123")).toBeInTheDocument();
});

test("trust and reject report the request id and decision", async () => {
  const onAnswer = vi.fn();
  render(<HostKeyDialog request={request} onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole("button", { name: "Güven ve bağlan" }));
  expect(onAnswer).toHaveBeenLastCalledWith("r1", true);
  await userEvent.click(screen.getByRole("button", { name: "Reddet" }));
  expect(onAnswer).toHaveBeenLastCalledWith("r1", false);
});

test("reject is the focused default so Enter never trusts by accident", () => {
  render(<HostKeyDialog request={request} onAnswer={() => {}} />);
  expect(screen.getByRole("button", { name: "Reddet" })).toHaveFocus();
});
