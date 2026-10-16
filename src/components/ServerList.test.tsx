import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServerList } from "./ServerList";
import type { Session } from "../types";

const s = (id: string, name: string, host: string, folder: string | null = null): Session => ({
  id, name, host, port: 22, user: "root", folder, auth: { type: "password" },
});

const sessions = [
  s("1", "Test 3.81", "192.168.3.81", "Test"),
  s("2", "Prod API", "10.0.0.1", "Prod"),
  s("3", "Serbest", "example.org"),
];

const noop = () => {};
const props = { onConnect: noop, onEdit: noop, onDelete: noop, onAdd: noop };

test("groups sessions by folder", () => {
  render(<ServerList sessions={sessions} {...props} />);
  const test = screen.getByRole("group", { name: "Test" });
  expect(within(test).getByText("Test 3.81")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Prod" })).getByText("Prod API")).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Klasörsüz" })).getByText("Serbest")).toBeInTheDocument();
});

test("search filters by name, host and folder", async () => {
  render(<ServerList sessions={sessions} {...props} />);
  const box = screen.getByRole("searchbox", { name: "Ara" });
  await userEvent.type(box, "3.81");
  expect(screen.getByText("Test 3.81")).toBeInTheDocument();
  expect(screen.queryByText("Prod API")).not.toBeInTheDocument();
  await userEvent.clear(box);
  await userEvent.type(box, "prod");
  expect(screen.getByText("Prod API")).toBeInTheDocument();
  expect(screen.queryByText("Test 3.81")).not.toBeInTheDocument();
  await userEvent.clear(box);
  await userEvent.type(box, "yokboyle");
  expect(screen.getByText("Eşleşen sunucu yok")).toBeInTheDocument();
});

test("double clicking a server calls onConnect with its id", async () => {
  const onConnect = vi.fn();
  render(<ServerList sessions={sessions} {...props} onConnect={onConnect} />);
  await userEvent.dblClick(screen.getByRole("button", { name: /^Prod API root@10\.0\.0\.1/ }));
  expect(onConnect).toHaveBeenCalledWith("2");
});

test("a single click only selects the server and does not connect", async () => {
  const onConnect = vi.fn();
  render(<ServerList sessions={sessions} {...props} onConnect={onConnect} />);
  const row = screen.getByRole("button", { name: /^Prod API root@10\.0\.0\.1/ });
  await userEvent.click(row);
  expect(onConnect).not.toHaveBeenCalled();
  expect(row).toHaveAttribute("aria-pressed", "true");
});

test("pressing Enter on a focused server connects", async () => {
  const onConnect = vi.fn();
  render(<ServerList sessions={sessions} {...props} onConnect={onConnect} />);
  screen.getByRole("button", { name: /^Serbest root@/ }).focus();
  await userEvent.keyboard("{Enter}");
  expect(onConnect).toHaveBeenCalledWith("3");
  expect(onConnect).toHaveBeenCalledTimes(1);
});

test("edit and delete buttons call their handlers with the id", async () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<ServerList sessions={sessions} {...props} onEdit={onEdit} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: "Prod API düzenle" }));
  await userEvent.click(screen.getByRole("button", { name: "Prod API sil" }));
  expect(onEdit).toHaveBeenCalledWith("2");
  expect(onDelete).toHaveBeenCalledWith("2");
});

test("empty state shows the add prompt and add button calls onAdd", async () => {
  const onAdd = vi.fn();
  render(<ServerList sessions={[]} {...props} onAdd={onAdd} />);
  expect(screen.getByText("Henüz sunucu yok")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sunucu ekle" }));
  expect(onAdd).toHaveBeenCalled();
});

test("export and import-file buttons appear when their handlers are given and call them", async () => {
  const onExport = vi.fn();
  const onImportFile = vi.fn();
  render(<ServerList sessions={sessions} {...props} onExport={onExport} onImportFile={onImportFile} />);
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Dışa aktar" }));
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Dosyadan al" }));
  expect(onExport).toHaveBeenCalled();
  expect(onImportFile).toHaveBeenCalled();
});

test("the file import is also offered on the empty state so a fresh install can restore a backup", async () => {
  const onImportFile = vi.fn();
  render(<ServerList sessions={[]} {...props} onImportFile={onImportFile} />);
  await userEvent.click(screen.getByRole("button", { name: "Dosyadan al" }));
  expect(onImportFile).toHaveBeenCalled();
});

test("the add button is a compact icon button with an accessible name and the extra actions live in a menu", async () => {
  render(<ServerList sessions={sessions} {...props} onExport={() => {}} onImportFile={() => {}} onImport={() => {}} />);
  expect(screen.getByRole("button", { name: "Sunucu ekle" })).toHaveTextContent("+");
  expect(screen.queryByRole("button", { name: "Dışa aktar" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
  expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["SSH config'den al", "Dosyadan al", "Dışa aktar"]);
});

test("there is no actions menu when no extra handlers are given", () => {
  render(<ServerList sessions={sessions} {...props} />);
  expect(screen.queryByRole("button", { name: "Diğer işlemler" })).not.toBeInTheDocument();
});

test("a server with a color label shows a dot in that color", () => {
  render(<ServerList sessions={[{ ...s("1", "Prod", "10.0.0.1"), color: "#ef4444" }, s("2", "Dev", "10.0.0.2")]} {...props} />);
  expect(screen.getByTestId("color-dot-1")).toHaveStyle({ backgroundColor: "#ef4444" });
  expect(screen.queryByTestId("color-dot-2")).not.toBeInTheDocument();
});
