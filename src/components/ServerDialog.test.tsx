import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServerDialog } from "./ServerDialog";
import type { Session } from "../types";
import { pickKeyFile } from "../api";

vi.mock("../api", () => ({ pickKeyFile: vi.fn() }));

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

test("a command to run on connect can be saved, and clearing it on edit sends null", async () => {
  const onSave = vi.fn();
  const { unmount } = render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "x");
  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.type(screen.getByLabelText("Bağlanınca çalıştır"), "cd /var/log");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].startup).toBe("cd /var/log");
  unmount();

  const onSave2 = vi.fn();
  render(<ServerDialog initial={{ ...existing, startup: "ls" }} onSave={onSave2} onCancel={() => {}} />);
  const box = screen.getByLabelText("Bağlanınca çalıştır");
  expect(box).toHaveValue("ls");
  await userEvent.clear(box);
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave2.mock.calls[0][0].startup).toBeNull();
});

test("without a startup command the saved object does not mention one", async () => {
  const onSave = vi.fn();
  render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "x");
  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect("startup" in onSave.mock.calls[0][0]).toBe(false);
});

test("the SSH agent and prompted authentication can be chosen and need no password or key path", async () => {
  const onSave = vi.fn();
  render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
  await userEvent.type(screen.getByLabelText("Ad"), "x");
  await userEvent.type(screen.getByLabelText("Adres"), "h");
  await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  await userEvent.selectOptions(screen.getByLabelText("Kimlik doğrulama"), "agent");
  expect(screen.queryByLabelText("Parola")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Anahtar dosyası yolu")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].auth).toEqual({ type: "agent" });
  onSave.mockClear();
  await userEvent.selectOptions(screen.getByLabelText("Kimlik doğrulama"), "interactive");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave.mock.calls[0][0].auth).toEqual({ type: "interactive" });
});

test("a color label can be picked and cleared again", async () => {
  const onSave = vi.fn();
  render(<ServerDialog initial={existing} onSave={onSave} onCancel={() => {}} />);
  await userEvent.click(screen.getByRole("radio", { name: "Kırmızı" }));
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave).toHaveBeenLastCalledWith({ ...existing, color: "#ef4444" }, undefined);
  onSave.mockClear();
  render(<ServerDialog initial={{ ...existing, color: "#ef4444" }} onSave={onSave} onCancel={() => {}} />);
  await userEvent.click(screen.getAllByRole("radio", { name: "Renksiz" })[1]);
  await userEvent.click(screen.getAllByRole("button", { name: "Kaydet" })[1]);
  expect(onSave).toHaveBeenLastCalledWith({ ...existing, color: null }, undefined);
});

describe("folder picker", () => {
  const others: Session[] = [
    { id: "1", name: "a", host: "h1", port: 22, user: "u", folder: "Test", auth: { type: "password" } },
    { id: "2", name: "b", host: "h2", port: 22, user: "u", folder: "Prod", auth: { type: "password" } },
    { id: "3", name: "c", host: "h3", port: 22, user: "u", folder: "Prod", auth: { type: "password" } },
    { id: "4", name: "d", host: "h4", port: 22, user: "u", folder: null, auth: { type: "password" } },
  ];

  const fill = async () => {
    await userEvent.type(screen.getByLabelText("Ad"), "x");
    await userEvent.type(screen.getByLabelText("Adres"), "h");
    await userEvent.type(screen.getByLabelText("Kullanıcı"), "u");
  };

  test("existing folders are offered once each, sorted, with a no-folder choice", () => {
    render(<ServerDialog others={others} onSave={() => {}} onCancel={() => {}} />);
    const options = screen.getAllByRole("option").filter((o) => (o.closest("select") as HTMLSelectElement).getAttribute("aria-label") === "Klasör");
    expect(options.map((o) => o.textContent)).toEqual(["Klasörsüz", "Prod", "Test", "Yeni klasör…"]);
  });

  test("picking an existing folder saves it", async () => {
    const onSave = vi.fn();
    render(<ServerDialog others={others} onSave={onSave} onCancel={() => {}} />);
    await fill();
    await userEvent.selectOptions(screen.getByLabelText("Klasör"), "Prod");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ folder: "Prod" }), undefined);
  });

  test("choosing a new folder reveals a text field for its name", async () => {
    const onSave = vi.fn();
    render(<ServerDialog others={others} onSave={onSave} onCancel={() => {}} />);
    await fill();
    expect(screen.queryByLabelText("Yeni klasör adı")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Klasör"), "Yeni klasör…");
    await userEvent.type(screen.getByLabelText("Yeni klasör adı"), "Staging");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ folder: "Staging" }), undefined);
  });

  test("the no-folder choice saves null", async () => {
    const onSave = vi.fn();
    render(<ServerDialog others={others} onSave={onSave} onCancel={() => {}} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ folder: null }), undefined);
  });

  test("editing a server preselects its current folder", () => {
    render(<ServerDialog initial={{ ...others[1], id: "9" }} others={others} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText("Klasör")).toHaveValue("Prod");
  });

  test("with no folders yet a plain text field is shown", async () => {
    const onSave = vi.fn();
    render(<ServerDialog onSave={onSave} onCancel={() => {}} />);
    await fill();
    await userEvent.type(screen.getByLabelText("Klasör"), "Yeni");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ folder: "Yeni" }), undefined);
  });
});

test("the browse button fills the key file path from the file picker", async () => {
  vi.mocked(pickKeyFile).mockResolvedValue("/Users/u/.ssh/id_ed25519");
  render(<ServerDialog onSave={() => {}} onCancel={() => {}} />);
  await userEvent.selectOptions(screen.getByLabelText("Kimlik doğrulama"), "key_file");
  await userEvent.click(screen.getByRole("button", { name: "Gözat…" }));
  expect(screen.getByLabelText("Anahtar dosyası yolu")).toHaveValue("/Users/u/.ssh/id_ed25519");
});

test("cancelling the file picker keeps the typed key path", async () => {
  vi.mocked(pickKeyFile).mockResolvedValue(null);
  render(<ServerDialog onSave={() => {}} onCancel={() => {}} />);
  await userEvent.selectOptions(screen.getByLabelText("Kimlik doğrulama"), "key_file");
  await userEvent.type(screen.getByLabelText("Anahtar dosyası yolu"), "/tmp/k");
  await userEvent.click(screen.getByRole("button", { name: "Gözat…" }));
  expect(screen.getByLabelText("Anahtar dosyası yolu")).toHaveValue("/tmp/k");
});
