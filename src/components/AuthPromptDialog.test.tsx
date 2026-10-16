import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthPromptDialog } from "./AuthPromptDialog";

const request = {
  requestId: "a1", host: "10.0.0.9", user: "deploy", name: "", instructions: "Doğrulama uygulamasındaki kodu gir",
  prompts: [{ text: "Verification code: ", echo: false }, { text: "Kullanıcı: ", echo: true }],
};

test("shows the server's instructions and one field per question", () => {
  render(<AuthPromptDialog request={request} onAnswer={() => {}} />);
  expect(screen.getByText("Doğrulama uygulamasındaki kodu gir")).toBeInTheDocument();
  expect(screen.getByLabelText("Verification code:")).toBeInTheDocument();
  expect(screen.getByLabelText("Kullanıcı:")).toBeInTheDocument();
  expect(screen.getByText("deploy@10.0.0.9 sunucusu bilgi istiyor.")).toBeInTheDocument();
});

test("hidden questions use a password field and visible ones a text field; the first is focused", () => {
  render(<AuthPromptDialog request={request} onAnswer={() => {}} />);
  expect(screen.getByLabelText("Verification code:")).toHaveAttribute("type", "password");
  expect(screen.getByLabelText("Kullanıcı:")).toHaveAttribute("type", "text");
  expect(screen.getByLabelText("Verification code:")).toHaveFocus();
});

test("submitting returns the answers in order", async () => {
  const onAnswer = vi.fn();
  render(<AuthPromptDialog request={request} onAnswer={onAnswer} />);
  await userEvent.type(screen.getByLabelText("Verification code:"), "123456");
  await userEvent.type(screen.getByLabelText("Kullanıcı:"), "aral{Enter}");
  expect(onAnswer).toHaveBeenCalledWith("a1", ["123456", "aral"]);
});

test("cancelling answers with null", async () => {
  const onAnswer = vi.fn();
  render(<AuthPromptDialog request={request} onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(onAnswer).toHaveBeenCalledWith("a1", null);
});

test("a prompt without questions can just be continued", async () => {
  const onAnswer = vi.fn();
  render(<AuthPromptDialog request={{ ...request, prompts: [] }} onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole("button", { name: "Gönder" }));
  expect(onAnswer).toHaveBeenCalledWith("a1", []);
});
