import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServerDialog } from "./ServerDialog";
import type { Session } from "../types";

const existing: Session = {
  id: "9", name: "Prod API", host: "10.0.0.1", port: 2200, user: "deploy", folder: "Prod", auth: { type: "password" },
};

test("requires host and a valid port before saving", async () => {
  const onSave = vi.fn();
  render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "x");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "root");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(screen.getByText("Adres boş olamaz")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.clear(screen.getByLabelText("Port"));
  await userEvent.type(screen.getByLabelText("Port"), "70000");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(screen.getByText("Port 1-65535 arasında olmalı")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("saves a valid new session with the typed password", async () => {
  const onSave = vi.fn();
  render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "Test");
  await userEvent.type(screen.getByLabelText("Adres"), "192.168.3.81");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "root");
  await userEvent.type(screen.getByLabelText("Parola"), "s3cret");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave).toHaveBeenCalledWith(
    { name: "Test", host: "192.168.3.81", port: 22, user: "root", folder: null, auth: { type: "password" } },
    "s3cret",
  );
});

test("password field is masked and not prefilled when editing", () => {
  render(<ServerDialog initial={existing} onSave={() => {}} onCancel={() => {}} />);
  const pw = screen.getByLabelText("Parola") as HTMLInputElement;
  expect(pw.type).toBe("password");
  expect(pw.value).toBe("");
  expect(screen.getByLabelText("Adres")).toHaveValue("10.0.0.1");
});

test("editing keeps the id and sends no password when left blank", async () => {
  const onSave = vi.fn();
  render(<ServerDialog initial={existing} onSave={onSave} onCancel={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave).toHaveBeenCalledWith(existing, undefined);
});

test("key file auth asks for a key path instead of a password", async () => {
  const onSave = vi.fn();
  render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.selectOptions(screen.getByLabelText("Kimlik doğrulama"), "key_file");
  expect(screen.queryByLabelText("Parola")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Ad"), "K");
  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(screen.getByText("Anahtar dosyası yolu boş olamaz")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Anahtar dosyası yolu"), "/home/u/.ssh/id");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave).toHaveBeenCalledWith(
    { name: "K", host: "h", port: 22, user: "u", folder: null, auth: { type: "key_file", path: "/home/u/.ssh/id" } },
    undefined,
  );
});
