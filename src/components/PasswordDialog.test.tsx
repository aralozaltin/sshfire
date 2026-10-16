import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordDialog } from "./PasswordDialog";

const request = { requestId: "r1", host: "10.0.0.5", user: "deploy" };

test("asks for the password of the right user and host and masks the input", () => {
  render(<PasswordDialog request={request} onAnswer={() => {}} />);
  expect(screen.getByText("deploy@10.0.0.5 için parola gir.")).toBeInTheDocument();
  expect(screen.getByLabelText("Parola")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Parola")).toHaveFocus();
});

test("submitting with Enter returns the password and the remember choice", async () => {
  const onAnswer = vi.fn();
  render(<PasswordDialog request={request} onAnswer={onAnswer} />);
  await userEvent.type(screen.getByLabelText("Parola"), "s3cret{Enter}");
  expect(onAnswer).toHaveBeenCalledWith("r1", "s3cret", false);
});

test("an empty password cannot be submitted", async () => {
  const onAnswer = vi.fn();
  render(<PasswordDialog request={request} onAnswer={onAnswer} />);
  expect(screen.getByRole("button", { name: "Bağlan" })).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  expect(onAnswer).not.toHaveBeenCalled();
});

test("cancel answers with null", async () => {
  const onAnswer = vi.fn();
  render(<PasswordDialog request={request} onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(onAnswer).toHaveBeenCalledWith("r1", null, false);
});
