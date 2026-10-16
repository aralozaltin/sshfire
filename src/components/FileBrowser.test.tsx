import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileBrowser } from "./FileBrowser";
import type { ClipboardItem } from "../files/fileOps";
import type { FileEntry, FilesApi } from "../files/types";

const file = (name: string, dir = "/home/u", over: Partial<FileEntry> = {}): FileEntry => ({
  name, path: `${dir}/${name}`, isDir: false, isSymlink: false, size: 1536, modified: 1792142400, permissions: 0o644, owner: "u", group: "g", ...over,
});
const folder = (name: string, dir = "/home/u") => file(name, dir, { isDir: true, size: 4096, permissions: 0o755 });

function fakeApi(listing: Record<string, FileEntry[]> = {}) {
  const lists: Record<string, FileEntry[]> = {
    "/home/u": [folder("docs"), file("rapor.txt"), file("notlar.md")],
    "/home/u/docs": [file("a.txt", "/home/u/docs")],
    ...listing,
  };
  return {
    sftpHome: vi.fn(async () => "/home/u"),
    sftpList: vi.fn(async (_t: string, p: string) => {
      if (!(p in lists)) throw { code: "file_not_found" };
      return lists[p];
    }),
    sftpMkdir: vi.fn(async () => {}),
    sftpRename: vi.fn(async () => {}),
    sftpRemove: vi.fn(async () => {}),
    sftpCopy: vi.fn(async () => {}),
  } satisfies FilesApi;
}

function setup(over: { api?: ReturnType<typeof fakeApi>; clipboard?: ClipboardItem | null; tabId?: string | null } = {}) {
  const api = over.api ?? fakeApi();
  const onClipboardChange = vi.fn();
  const view = render(
    <FileBrowser tabId={over.tabId === undefined ? "t1" : over.tabId} connectionKey="c1" api={api} clipboard={over.clipboard ?? null} onClipboardChange={onClipboardChange} />,
  );
  return { api, onClipboardChange, ...view };
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(`^${name.replace(".", "\\.")}\\b`) });

test("lists the home directory on mount with the four columns", async () => {
  const { api } = setup();
  expect(await screen.findByText("rapor.txt")).toBeInTheDocument();
  expect(api.sftpList).toHaveBeenCalledWith("t1", "/home/u");
  for (const col of ["Ad", "Boyut", "Değişiklik", "İzinler"]) {
    expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
  }
  expect(within(row("rapor.txt")).getByText("1.5 KB")).toBeInTheDocument();
  expect(within(row("rapor.txt")).getByText("rw-r--r--")).toBeInTheDocument();
});

test("double clicking a folder enters it and the breadcrumb follows; up goes back", async () => {
  setup();
  await userEvent.dblClick(await screen.findByText("docs"));
  expect(await screen.findByText("a.txt")).toBeInTheDocument();
  const crumbs = screen.getByRole("navigation", { name: "Yol" });
  expect(within(crumbs).getByRole("button", { name: "docs" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Üst klasör" }));
  expect(await screen.findByText("rapor.txt")).toBeInTheDocument();
});

test("clicking a breadcrumb jumps to that directory", async () => {
  setup();
  await userEvent.dblClick(await screen.findByText("docs"));
  await screen.findByText("a.txt");
  await userEvent.click(within(screen.getByRole("navigation", { name: "Yol" })).getByRole("button", { name: "u" }));
  expect(await screen.findByText("rapor.txt")).toBeInTheDocument();
});

test("click selects, ctrl-click adds, shift-click selects a range", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByText("rapor.txt");
  await user.click(row("docs"));
  expect(row("docs")).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Control>}");
  await user.click(row("notlar.md"));
  await user.keyboard("{/Control}");
  expect(row("docs")).toHaveAttribute("aria-selected", "true");
  expect(row("notlar.md")).toHaveAttribute("aria-selected", "true");
  expect(row("rapor.txt")).toHaveAttribute("aria-selected", "false");
  await user.click(row("docs"));
  await user.keyboard("{Shift>}");
  await user.click(row("notlar.md"));
  await user.keyboard("{/Shift}");
  expect(row("rapor.txt")).toHaveAttribute("aria-selected", "true");
});

test("copy then paste in the same folder calls sftpCopy with a unique name", async () => {
  const { onClipboardChange } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Kopyala" }));
  expect(onClipboardChange).toHaveBeenCalledWith({ mode: "copy", connectionKey: "c1", entries: [{ path: "/home/u/rapor.txt", isDir: false }] });
});

test("paste of a copied item creates a (kopya) next to it", async () => {
  const clipboard: ClipboardItem = { mode: "copy", connectionKey: "c1", entries: [{ path: "/home/u/rapor.txt", isDir: false }] };
  const { api } = setup({ clipboard });
  await screen.findByText("rapor.txt");
  fireEvent.contextMenu(screen.getByRole("table", { name: "Dosyalar" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Yapıştır" }));
  expect(api.sftpCopy).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "/home/u/rapor (kopya).txt");
  expect(api.sftpList).toHaveBeenCalledTimes(2);
});

test("cut then paste into another folder moves the file", async () => {
  const clipboard: ClipboardItem = { mode: "cut", connectionKey: "c1", entries: [{ path: "/home/u/rapor.txt", isDir: false }] };
  const { api, onClipboardChange } = setup({ clipboard });
  await userEvent.dblClick(await screen.findByText("docs"));
  await screen.findByText("a.txt");
  await userEvent.click(screen.getByRole("table", { name: "Dosyalar" }));
  await userEvent.keyboard("{Control>}v{/Control}");
  expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "/home/u/docs/rapor.txt");
  expect(onClipboardChange).toHaveBeenCalledWith(null);
});

test("pasting something copied on another connection explains it is unsupported", async () => {
  const clipboard: ClipboardItem = { mode: "copy", connectionKey: "baska", entries: [{ path: "/x", isDir: false }] };
  const { api } = setup({ clipboard });
  await screen.findByText("rapor.txt");
  fireEvent.contextMenu(screen.getByRole("table", { name: "Dosyalar" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Yapıştır" }));
  expect(await screen.findByText(/Sunucular arası kopyalama/)).toBeInTheDocument();
  expect(api.sftpCopy).not.toHaveBeenCalled();
});

test("delete asks for confirmation inside the app and removes folders recursively", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("docs"));
  await userEvent.keyboard("{Delete}");
  expect(api.sftpRemove).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog", { name: "Silme onayı" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sil" }));
  expect(api.sftpRemove).toHaveBeenCalledWith("t1", "/home/u/docs", true);
});

test("cancelling the delete confirmation removes nothing", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.keyboard("{Delete}");
  await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
  expect(api.sftpRemove).not.toHaveBeenCalled();
});

test("F2 renames the selected file", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.keyboard("{F2}");
  const input = screen.getByLabelText("Yeni ad");
  expect(input).toHaveValue("rapor.txt");
  await userEvent.clear(input);
  await userEvent.type(input, "yeni.txt{Enter}");
  expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "/home/u/yeni.txt");
});

test("renaming to a name with a slash is refused", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.keyboard("{F2}");
  const input = screen.getByLabelText("Yeni ad");
  await userEvent.clear(input);
  await userEvent.type(input, "a/b{Enter}");
  expect(api.sftpRename).not.toHaveBeenCalled();
  expect(screen.getByText("Ad '/' içeremez")).toBeInTheDocument();
});

test("new folder prompts for a name and creates it", async () => {
  const { api } = setup();
  await screen.findByText("rapor.txt");
  await userEvent.click(screen.getByRole("button", { name: "Yeni klasör" }));
  await userEvent.type(screen.getByLabelText("Yeni ad"), "projeler{Enter}");
  expect(api.sftpMkdir).toHaveBeenCalledWith("t1", "/home/u/projeler");
});

test("the info dialog shows size, rwx and octal permissions, owner and path", async () => {
  setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Bilgi" }));
  const dialog = screen.getByRole("dialog", { name: "Bilgi" });
  expect(within(dialog).getByText("/home/u/rapor.txt")).toBeInTheDocument();
  expect(within(dialog).getByText("1.5 KB (1536 B)")).toBeInTheDocument();
  expect(within(dialog).getByText("rw-r--r-- (0644)")).toBeInTheDocument();
  expect(within(dialog).getByText("u")).toBeInTheDocument();
});

test("a failed listing shows the translated error without crashing", async () => {
  const api = fakeApi();
  api.sftpList = vi.fn(async () => { throw { code: "permission_denied" }; });
  setup({ api });
  expect(await screen.findByRole("alert")).toHaveTextContent("Erişim reddedildi");
});

test("without a connection it shows a hint and does not call the backend", () => {
  const { api } = setup({ tabId: null });
  expect(screen.getByText(/Bir sunucuya bağlan/)).toBeInTheDocument();
  expect(api.sftpHome).not.toHaveBeenCalled();
});

test("an empty folder says so", async () => {
  const api = fakeApi({ "/home/u": [] });
  setup({ api });
  expect(await screen.findByText("Klasör boş")).toBeInTheDocument();
});
