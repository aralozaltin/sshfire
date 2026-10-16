import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportDialog, type ImportCandidate } from "./ImportDialog";

const candidates: ImportCandidate[] = [
  { alias: "prod", host: "10.0.0.5", user: "deploy", port: 2222, identityFile: "/Users/u/.ssh/prod", exists: false },
  { alias: "db", host: "db.example.com", user: "u", port: 22, identityFile: null, exists: false },
  { alias: "old", host: "1.2.3.4", user: "u", port: 22, identityFile: null, exists: true },
];

test("lists the candidates with their address and marks the ones already added", () => {
  render(<ImportDialog candidates={candidates} onImport={() => {}} onCancel={() => {}} />);
  expect(screen.getByText("deploy@10.0.0.5:2222")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /old/ })).toBeDisabled();
  expect(screen.getByText("zaten var")).toBeInTheDocument();
});

test("new hosts start selected and the button shows how many will be imported", async () => {
  const onImport = vi.fn();
  render(<ImportDialog candidates={candidates} onImport={onImport} onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "2 sunucuyu içe aktar" })).toBeEnabled();
  await userEvent.click(screen.getByRole("checkbox", { name: /db/ }));
  await userEvent.click(screen.getByRole("button", { name: "1 sunucuyu içe aktar" }));
  expect(onImport).toHaveBeenCalledWith([candidates[0]]);
});

test("nothing selected disables the import button and select-all toggles every selectable row", async () => {
  render(<ImportDialog candidates={candidates} onImport={() => {}} onCancel={() => {}} />);
  const all = screen.getByRole("checkbox", { name: "Tümünü seç" });
  await userEvent.click(all);
  expect(screen.getByRole("button", { name: "İçe aktar" })).toBeDisabled();
  await userEvent.click(all);
  expect(screen.getByRole("button", { name: "2 sunucuyu içe aktar" })).toBeEnabled();
});

test("shows an explanation when there is nothing to import", () => {
  render(<ImportDialog candidates={[]} onImport={() => {}} onCancel={() => {}} />);
  expect(screen.getByText(/içe aktarılacak sunucu bulunamadı/)).toBeInTheDocument();
});
