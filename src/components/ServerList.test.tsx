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
