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

const others: Session[] = [
  { id: "7", name: "Bastion", host: "b.example.com", port: 22, user: "jump", folder: null, auth: { type: "password" } },
  { id: "9", name: "Prod API", host: "10.0.0.1", port: 2200, user: "deploy", folder: "Prod", auth: { type: "password" } },
];

test("a jump host can be chosen from the other saved servers", async () => {
  const onSave = vi.fn();
  render(<ServerDialog others={others} onSave={onSave} onCancel={() => {}} />);
  const select = screen.getByLabelText("Atlama sunucusu") as HTMLSelectElement;
  expect(select.value).toBe("");
  await userEvent.selectOptions(select, "7");
  await userEvent.type(screen.getByLabelText("Ad"), "Ic");
  await userEvent.type(screen.getByLabelText("Adres"), "10.1.1.1");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].jump).toBe("7");
});

test("the server being edited is not offered as its own jump host, and clearing the choice sends null", async () => {
  const onSave = vi.fn();
  const withJump: Session = { ...existing, jump: "7" };
  render(<ServerDialog initial={withJump} others={[...others, existing]} onSave={onSave} onCancel={() => {}} />);
  const select = screen.getByLabelText("Atlama sunucusu") as HTMLSelectElement;
  expect(select.value).toBe("7");
  expect(screen.queryByRole("option", { name: "Prod API" })).not.toBeInTheDocument();
  await userEvent.selectOptions(select, "");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].jump).toBeNull();
});

test("without a jump host the saved object does not mention one", async () => {
  const onSave = vi.fn();
  render(<ServerDialog others={others} onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "x");
  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect("jump" in onSave.mock.calls[0][0]).toBe(false);
});

test("editing a server keeps its saved tunnels", async () => {
  const onSave = vi.fn();
  const withTunnels: Session = { ...existing, tunnels: [{ kind: "dynamic", listen_port: 1080 }] };
  render(<ServerDialog initial={withTunnels} onSave={onSave} onCancel={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].tunnels).toEqual([{ kind: "dynamic", listen_port: 1080 }]);
});
