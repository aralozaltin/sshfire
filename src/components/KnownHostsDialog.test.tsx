import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnownHostsDialog } from "./KnownHostsDialog";

const entries = [
  { host: "a.example", port: 22, fingerprint: "SHA256:aaaa" },
  { host: "b.example", port: 2222, fingerprint: "SHA256:bbbb" },
];

test("lists each trusted server with its port and fingerprint", async () => {
  render(<KnownHostsDialog load={async () => entries} onRemove={async () => true} onClose={() => {}} />);
  expect(await screen.findByText("a.example")).toBeInTheDocument();
  expect(screen.getByText("b.example:2222")).toBeInTheDocument();
  expect(screen.getByText("SHA256:bbbb")).toBeInTheDocument();
});

test("forgetting a server removes it after confirmation and refreshes the list", async () => {
  let list = [...entries];
  const onRemove = vi.fn(async (host: string) => { list = list.filter((e) => e.host !== host); return true; });
  render(<KnownHostsDialog load={async () => list} onRemove={onRemove} onClose={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "a.example unut" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Unut" }));
  expect(onRemove).toHaveBeenCalledWith("a.example", 22);
  await vi.waitFor(() => expect(screen.queryByText("a.example")).not.toBeInTheDocument());
  expect(screen.getByText("b.example:2222")).toBeInTheDocument();
});

test("cancelling the confirmation keeps the server", async () => {
  const onRemove = vi.fn(async () => true);
  render(<KnownHostsDialog load={async () => entries} onRemove={onRemove} onClose={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "a.example unut" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Vazgeç" }));
  expect(onRemove).not.toHaveBeenCalled();
  expect(screen.getByText("a.example")).toBeInTheDocument();
});

test("an empty list says so", async () => {
  render(<KnownHostsDialog load={async () => []} onRemove={async () => true} onClose={() => {}} />);
  expect(await screen.findByText("Henüz güvenilen sunucu yok.")).toBeInTheDocument();
});
