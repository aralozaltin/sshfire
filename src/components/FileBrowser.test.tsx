import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileBrowser } from "./FileBrowser";
import { editorText, focusEditor, replaceEditorText } from "../test-helpers/editor";
import type { ClipboardItem } from "../files/fileOps";
import type { FileEntry, FilesApi } from "../files/types";
import type { TransferEvent } from "../files/transfers";

const file = (name: string, dir = "/home/u", over: Partial<FileEntry> = {}): FileEntry => ({
  name, path: `${dir}/${name}`, isDir: false, isSymlink: false, size: 1536, modified: 1792142400, permissions: 0o644, owner: "u", group: "g", ...over,
});
const folder = (name: string, dir = "/home/u") => file(name, dir, { isDir: true, size: 4096, permissions: 0o755 });

const hooks: { drop: (p: string[], into?: string | null) => void; transfer: (e: TransferEvent) => void; sync: (e: { path: string; ok: boolean }) => void } = { drop: () => {}, transfer: () => {}, sync: () => {} };

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
    sftpChmod: vi.fn(async () => {}),
    sftpSearch: vi.fn(async (_t: string, _root: string, _q: string) => [] as FileEntry[]),
    sftpEditExternal: vi.fn(async () => "/tmp/x/rapor.txt"),
    onExternalEditSync: vi.fn(async (cb: (e: { path: string; ok: boolean }) => void) => { hooks.sync = cb; return () => {}; }),
    sftpCopy: vi.fn(async () => {}),
    sftpReadText: vi.fn(async (_t: string, _p: string) => "merhaba dünya\n"),
    sftpWriteText: vi.fn(async (_t: string, _p: string, _c: string) => {}),
    sftpUpload: vi.fn(async () => ["x"]),
    sftpDownload: vi.fn(async () => ["y"]),
    pickFiles: vi.fn(async () => [] as string[]),
    pickFolder: vi.fn(async () => "/Users/u/Hedef" as string | null),
    onFilesDropped: vi.fn(async (cb: (p: string[], into?: string | null) => void) => { hooks.drop = cb; return () => {}; }),
    onTransferProgress: vi.fn(async (cb: (e: TransferEvent) => void) => { hooks.transfer = cb; return () => {}; }),
  } satisfies FilesApi;
}

function setup(over: { api?: ReturnType<typeof fakeApi>; clipboard?: ClipboardItem | null; tabId?: string | null; followPath?: string | null } = {}) {
  const api = over.api ?? fakeApi();
  const onClipboardChange = vi.fn();
  const view = render(
    <FileBrowser tabId={over.tabId === undefined ? "t1" : over.tabId} connectionKey="c1" api={api} clipboard={over.clipboard ?? null} onClipboardChange={onClipboardChange} followPath={over.followPath} />,
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

test("the upload button picks files and uploads them with unique remote names", async () => {
  const api = fakeApi();
  api.pickFiles = vi.fn(async () => ["/Users/u/yeni.txt", "/Users/u/rapor.txt"]);
  setup({ api });
  await screen.findByText("rapor.txt");
  await userEvent.click(screen.getByRole("button", { name: "Yükle" }));
  expect(api.sftpUpload).toHaveBeenCalledWith("t1", [
    { local: "/Users/u/yeni.txt", remote: "/home/u/yeni.txt" },
    { local: "/Users/u/rapor.txt", remote: "/home/u/rapor (kopya).txt" },
  ]);
});

test("cancelling the file picker uploads nothing", async () => {
  const { api } = setup();
  await screen.findByText("rapor.txt");
  await userEvent.click(screen.getByRole("button", { name: "Yükle" }));
  expect(api.sftpUpload).not.toHaveBeenCalled();
});

test("files dropped from the OS are uploaded into the current directory", async () => {
  const { api } = setup();
  await screen.findByText("rapor.txt");
  await vi.waitFor(() => expect(api.onFilesDropped).toHaveBeenCalled());
  await act(async () => hooks.drop(["C:\\Users\\u\\foto.png", "/Users/u/klasor/"]));
  expect(api.sftpUpload).toHaveBeenCalledWith("t1", [
    { local: "C:\\Users\\u\\foto.png", remote: "/home/u/foto.png" },
    { local: "/Users/u/klasor/", remote: "/home/u/klasor" },
  ]);
});

test("the download button downloads the selected items and is disabled without selection", async () => {
  const { api } = setup();
  await screen.findByText("rapor.txt");
  const button = screen.getByRole("button", { name: "İndir" });
  expect(button).toBeDisabled();
  await userEvent.click(row("rapor.txt"));
  await userEvent.click(button);
  expect(api.pickFolder).toHaveBeenCalled();
  expect(api.sftpDownload).toHaveBeenCalledWith("t1", ["/home/u/rapor.txt"], "/Users/u/Hedef");
});

test("the context menu offers download", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("docs"));
  fireEvent.contextMenu(row("docs"));
  await userEvent.click(screen.getByRole("menuitem", { name: "İndir…" }));
  expect(api.sftpDownload).toHaveBeenCalledWith("t1", ["/home/u/docs"], "/Users/u/Hedef");
});

test("a finished upload refreshes the listing", async () => {
  const { api } = setup();
  await screen.findByText("rapor.txt");
  await vi.waitFor(() => expect(api.onTransferProgress).toHaveBeenCalled());
  const before = api.sftpList.mock.calls.length;
  await act(async () => hooks.transfer({ transferId: "z", direction: "upload", name: "x", done: 1, total: 1, state: "done" }));
  expect(api.sftpList.mock.calls.length).toBe(before + 1);
});

test("dragging a column edge resizes that column and remembers it", async () => {
  const { container } = setup();
  await screen.findByText("rapor.txt");
  const cols = () => [...container.querySelectorAll("col")].map((c) => (c as HTMLElement).style.width);
  expect(cols()).toEqual(["150px", "60px", "132px", "84px"]);
  const handle = screen.getByRole("separator", { name: "Boyut sütun genişliği" });
  fireEvent.mouseDown(handle, { clientX: 400 });
  fireEvent.mouseMove(window, { clientX: 440 });
  fireEvent.mouseUp(window);
  expect(cols()).toEqual(["150px", "100px", "132px", "84px"]);
  expect(JSON.parse(localStorage.getItem("ssh-istemci.fileColumns")!)).toEqual([150, 100, 132, 84]);
});

function dt(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    setData: (k: string, v: string) => { store[k] = v; },
    getData: (k: string) => store[k] ?? "",
    get types() { return Object.keys(store); },
    effectAllowed: "all",
    dropEffect: "none",
  };
}
const MIME = "application/x-ssh-istemci-files";
function dragRows(from: HTMLElement, to: HTMLElement, mods: { ctrlKey?: boolean } = {}) {
  const t = dt();
  // jsdom'da DragEvent yok; değiştirici tuşları olaya elle yazıyoruz.
  const withMods = (e: Event) => {
    Object.defineProperty(e, "ctrlKey", { value: !!mods.ctrlKey });
    return e;
  };
  fireEvent.dragStart(from, { dataTransfer: t });
  fireEvent(to, withMods(createEvent.dragOver(to, { dataTransfer: t })));
  fireEvent(to, withMods(createEvent.drop(to, { dataTransfer: t })));
  return t;
}

const dndListing = {
  "/home/u": [folder("docs"), folder("arsiv"), file("rapor.txt"), file("notlar.md")],
  "/home/u/docs": [file("a.txt", "/home/u/docs"), file("rapor.txt", "/home/u/docs")],
  "/home/u/arsiv": [] as FileEntry[],
};

test("dragging a file onto a folder moves it there", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  dragRows(row("notlar.md"), row("arsiv"));
  await vi.waitFor(() => expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/notlar.md", "/home/u/arsiv/notlar.md"));
});

test("holding Ctrl while dropping copies instead of moving", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  dragRows(row("notlar.md"), row("arsiv"), { ctrlKey: true });
  await vi.waitFor(() => expect(api.sftpCopy).toHaveBeenCalledWith("t1", "/home/u/notlar.md", "/home/u/arsiv/notlar.md"));
  expect(api.sftpRename).not.toHaveBeenCalled();
});

test("dragging one of several selected rows moves the whole selection", async () => {
  const user = userEvent.setup();
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  await user.click(row("rapor.txt"));
  await user.keyboard("{Control>}");
  await user.click(row("notlar.md"));
  await user.keyboard("{/Control}");
  dragRows(row("notlar.md"), row("arsiv"));
  await vi.waitFor(() => expect(api.sftpRename).toHaveBeenCalledTimes(2));
  expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "/home/u/arsiv/rapor.txt");
  expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/notlar.md", "/home/u/arsiv/notlar.md");
});

test("a name clash at the destination gets a (kopya) name instead of overwriting", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  dragRows(row("rapor.txt"), row("docs"));
  await vi.waitFor(() => expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "/home/u/docs/rapor (kopya).txt"));
});

test("a folder cannot be dropped onto itself", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  dragRows(row("docs"), row("docs"));
  await new Promise((r) => setTimeout(r, 50));
  expect(api.sftpRename).not.toHaveBeenCalled();
  expect(api.sftpCopy).not.toHaveBeenCalled();
});

test("dropping on a file row does nothing", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  dragRows(row("notlar.md"), row("rapor.txt"));
  await new Promise((r) => setTimeout(r, 50));
  expect(api.sftpRename).not.toHaveBeenCalled();
});

test("dropping on a breadcrumb moves the item to that directory", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await userEvent.dblClick(await screen.findByText("docs"));
  await screen.findByText("a.txt");
  dragRows(row("a.txt"), within(screen.getByRole("navigation", { name: "Yol" })).getByRole("button", { name: "u" }));
  await vi.waitFor(() => expect(api.sftpRename).toHaveBeenCalledWith("t1", "/home/u/docs/a.txt", "/home/u/a.txt"));
});

test("items dragged from another connection are refused with an explanation", async () => {
  const { api } = setup({ api: fakeApi(dndListing) });
  await screen.findByText("rapor.txt");
  const foreign = dt({ [MIME]: JSON.stringify({ connectionKey: "baska", entries: [{ path: "/x", isDir: false }] }) });
  fireEvent.dragOver(row("arsiv"), { dataTransfer: foreign });
  fireEvent.drop(row("arsiv"), { dataTransfer: foreign });
  expect(await screen.findByText(/Sunucular arası kopyalama/)).toBeInTheDocument();
  expect(api.sftpRename).not.toHaveBeenCalled();
});

test("rename happens inline in the row and Escape cancels it", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.keyboard("{F2}");
  expect(within(row("rapor.txt")).getByLabelText("Yeni ad")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByLabelText("Yeni ad")).not.toBeInTheDocument();
  expect(api.sftpRename).not.toHaveBeenCalled();
});

test("renaming to the same name does nothing", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.keyboard("{F2}{Enter}");
  expect(api.sftpRename).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Yeni ad")).not.toBeInTheDocument();
});

test("opens at the terminal's directory when it is already known", async () => {
  const { api } = setup({ followPath: "/home/u/docs" });
  expect(await screen.findByText("a.txt")).toBeInTheDocument();
  expect(api.sftpList).toHaveBeenCalledWith("t1", "/home/u/docs");
  expect(api.sftpHome).not.toHaveBeenCalled();
});

function renderFollow(api: ReturnType<typeof fakeApi>, followPath: string | null) {
  const ui = (fp: string | null) => (
    <FileBrowser tabId="t1" connectionKey="c1" api={api} clipboard={null} onClipboardChange={() => {}} followPath={fp} />
  );
  const view = render(ui(followPath));
  return { change: (fp: string | null) => view.rerender(ui(fp)) };
}

test("when the terminal changes directory the panel follows", async () => {
  const api = fakeApi();
  const { change } = renderFollow(api, "/home/u");
  await screen.findByText("rapor.txt");
  change("/home/u/docs");
  expect(await screen.findByText("a.txt")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Terminali izle" })).toBeChecked();
});

test("unchecking follow stops the panel from jumping; re-checking jumps to the terminal directory", async () => {
  const api = fakeApi();
  const { change } = renderFollow(api, "/home/u");
  await screen.findByText("rapor.txt");
  await userEvent.click(screen.getByRole("checkbox", { name: "Terminali izle" }));
  change("/home/u/docs");
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText("a.txt")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "Terminali izle" }));
  expect(await screen.findByText("a.txt")).toBeInTheDocument();
});

test("browsing manually is not undone while the terminal stays where it is", async () => {
  const api = fakeApi();
  const { change } = renderFollow(api, "/home/u");
  await userEvent.dblClick(await screen.findByText("docs"));
  await screen.findByText("a.txt");
  change("/home/u");
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByText("a.txt")).toBeInTheDocument();
});

test("double clicking a file opens it in the editor with its content", async () => {
  const { api } = setup();
  await userEvent.dblClick(await screen.findByText("rapor.txt"));
  await screen.findByLabelText("Dosya içeriği");
  expect(editorText()).toBe("merhaba dünya\n");
  expect(api.sftpReadText).toHaveBeenCalledWith("t1", "/home/u/rapor.txt");
});

test("editing and pressing Ctrl+S writes the file back and refreshes the listing", async () => {
  const { api } = setup();
  await userEvent.dblClick(await screen.findByText("rapor.txt"));
  await screen.findByLabelText("Dosya içeriği");
  replaceEditorText("yeni içerik");
  focusEditor();
  await userEvent.keyboard("{Control>}s{/Control}");
  await vi.waitFor(() => expect(api.sftpWriteText).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", "yeni içerik"));
  expect(await screen.findByText("Kaydedildi")).toBeInTheDocument();
  expect(api.sftpList.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test("a file that is not text shows the explanation instead of the editor", async () => {
  const api = fakeApi();
  api.sftpReadText = vi.fn(async () => { throw { code: "not_text" }; });
  setup({ api });
  await userEvent.dblClick(await screen.findByText("rapor.txt"));
  expect(await screen.findByRole("alert")).toHaveTextContent("metin değil");
  expect(screen.queryByLabelText("Dosya içeriği")).not.toBeInTheDocument();
});

test("the context menu and Enter both open the editor for a file", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Düzenle" }));
  await screen.findByLabelText("Dosya içeriği");
  await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
  await userEvent.click(row("notlar.md"));
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(api.sftpReadText).toHaveBeenCalledWith("t1", "/home/u/notlar.md"));
});

test("the permissions dialog edits rwx boxes and the octal field together and applies chmod", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "İzinleri değiştir" }));
  const dialog = screen.getByRole("dialog", { name: "İzinleri değiştir" });
  const octal = within(dialog).getByLabelText("Sekizlik");
  expect(octal).toHaveValue("644");
  expect(within(dialog).getByRole("checkbox", { name: "Sahip: Yazma" })).toBeChecked();
  expect(within(dialog).getByRole("checkbox", { name: "Sahip: Çalıştırma" })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "Sahip: Çalıştırma" }));
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "Grup: Çalıştırma" }));
  await userEvent.click(within(dialog).getByRole("checkbox", { name: "Diğer: Çalıştırma" }));
  expect(octal).toHaveValue("755");
  await userEvent.clear(octal);
  await userEvent.type(octal, "600");
  expect(within(dialog).getByRole("checkbox", { name: "Grup: Okuma" })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole("button", { name: "Uygula" }));
  expect(api.sftpChmod).toHaveBeenCalledWith("t1", "/home/u/rapor.txt", 0o600);
  expect(screen.queryByRole("dialog", { name: "İzinleri değiştir" })).not.toBeInTheDocument();
});

test("an invalid octal value disables apply", async () => {
  setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "İzinleri değiştir" }));
  const dialog = screen.getByRole("dialog", { name: "İzinleri değiştir" });
  await userEvent.clear(within(dialog).getByLabelText("Sekizlik"));
  await userEvent.type(within(dialog).getByLabelText("Sekizlik"), "999");
  expect(within(dialog).getByRole("button", { name: "Uygula" })).toBeDisabled();
});

test("the filter box narrows the listing by name, ignoring case", async () => {
  setup();
  await screen.findByText("rapor.txt");
  await userEvent.type(screen.getByRole("searchbox", { name: "Dosyaları filtrele" }), "RAP");
  expect(screen.getByText("rapor.txt")).toBeInTheDocument();
  expect(screen.queryByText("notlar.md")).not.toBeInTheDocument();
  expect(screen.queryByText("docs")).not.toBeInTheDocument();
});

test("a filter with no match says so and clears when entering a folder", async () => {
  setup();
  await screen.findByText("rapor.txt");
  const box = screen.getByRole("searchbox", { name: "Dosyaları filtrele" });
  await userEvent.type(box, "zzz");
  expect(screen.getByText("Eşleşen dosya yok")).toBeInTheDocument();
  await userEvent.clear(box);
  await userEvent.dblClick(await screen.findByText("docs"));
  await screen.findByText("a.txt");
  expect(screen.getByRole("searchbox", { name: "Dosyaları filtrele" })).toHaveValue("");
});

test("opening in the external editor reports each upload back to the server", async () => {
  const { api } = setup();
  await userEvent.click(await screen.findByText("rapor.txt"));
  fireEvent.contextMenu(row("rapor.txt"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Harici düzenleyicide aç" }));
  expect(api.sftpEditExternal).toHaveBeenCalledWith("t1", "/home/u/rapor.txt");
  expect(await screen.findByRole("status")).toHaveTextContent("kaydettikçe sunucuya yüklenir");
  act(() => hooks.sync({ path: "/home/u/rapor.txt", ok: true }));
  expect(await screen.findByRole("status")).toHaveTextContent("rapor.txt sunucuya yüklendi");
  act(() => hooks.sync({ path: "/home/u/rapor.txt", ok: false }));
  expect(await screen.findByRole("status")).toHaveTextContent("yüklenemedi");
});

test("files dropped on a folder row go into that folder, with unique names there", async () => {
  const api = fakeApi({ "/home/u/docs": [file("a.txt", "/home/u/docs")] });
  setup({ api });
  await screen.findByText("rapor.txt");
  await vi.waitFor(() => expect(api.onFilesDropped).toHaveBeenCalled());
  await act(async () => hooks.drop(["/Users/u/a.txt", "/Users/u/b.txt"], "/home/u/docs"));
  expect(api.sftpUpload).toHaveBeenCalledWith("t1", [
    { local: "/Users/u/a.txt", remote: "/home/u/docs/a (kopya).txt" },
    { local: "/Users/u/b.txt", remote: "/home/u/docs/b.txt" },
  ]);
});

test("folder rows and breadcrumbs announce themselves as drop targets", async () => {
  setup();
  await screen.findByText("rapor.txt");
  expect(row("docs")).toHaveAttribute("data-drop-dir", "/home/u/docs");
  expect(row("rapor.txt")).not.toHaveAttribute("data-drop-dir");
  expect(screen.getByRole("button", { name: "home" })).toHaveAttribute("data-drop-dir", "/home");
});

test("downloading asks for a folder first and cancelling downloads nothing", async () => {
  const api = fakeApi();
  api.pickFolder = vi.fn(async () => null);
  setup({ api });
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.click(screen.getByRole("button", { name: "İndir" }));
  await vi.waitFor(() => expect(api.pickFolder).toHaveBeenCalled());
  expect(api.sftpDownload).not.toHaveBeenCalled();
});

test("the folder picker starts in the folder used last time", async () => {
  localStorage.clear();
  const api = fakeApi();
  setup({ api });
  await userEvent.click(await screen.findByText("rapor.txt"));
  await userEvent.click(screen.getByRole("button", { name: "İndir" }));
  await vi.waitFor(() => expect(api.sftpDownload).toHaveBeenCalledTimes(1));
  expect(api.pickFolder).toHaveBeenLastCalledWith(undefined);
  await userEvent.click(screen.getByRole("button", { name: "İndir" }));
  await vi.waitFor(() => expect(api.sftpDownload).toHaveBeenCalledTimes(2));
  expect(api.pickFolder).toHaveBeenLastCalledWith("/Users/u/Hedef");
});

describe("search in subfolders", () => {
  const hit = (name: string, dir: string) => file(name, dir);

  test("the search button looks below the current folder and lists the hits with their folders", async () => {
    const api = fakeApi();
    api.sftpSearch = vi.fn(async () => [hit("rapor-2.txt", "/home/u/docs/arsiv"), hit("rapor.txt", "/home/u")]);
    setup({ api });
    await screen.findByText("notlar.md");
    await userEvent.type(screen.getByRole("searchbox", { name: "Dosyaları filtrele" }), "rapor");
    await userEvent.click(screen.getByRole("button", { name: "Alt klasörlerde ara" }));
    expect(api.sftpSearch).toHaveBeenCalledWith("t1", "/home/u", "rapor");
    expect(await screen.findByText("2 sonuç")).toBeInTheDocument();
    expect(screen.getByText("/home/u/docs/arsiv")).toBeInTheDocument();
    expect(screen.queryByText("notlar.md")).not.toBeInTheDocument();
  });

  test("opening a hit goes to its folder and selects it; closing the search restores the listing", async () => {
    const api = fakeApi({ "/home/u/docs": [file("a.txt", "/home/u/docs"), file("hedef.txt", "/home/u/docs")] });
    api.sftpSearch = vi.fn(async () => [hit("hedef.txt", "/home/u/docs")]);
    setup({ api });
    await screen.findByText("notlar.md");
    await userEvent.type(screen.getByRole("searchbox", { name: "Dosyaları filtrele" }), "hedef");
    await userEvent.click(screen.getByRole("button", { name: "Alt klasörlerde ara" }));
    await userEvent.dblClick(await screen.findByText("hedef.txt"));
    await vi.waitFor(() => expect(api.sftpList).toHaveBeenCalledWith("t1", "/home/u/docs"));
    expect(await screen.findByText("a.txt")).toBeInTheDocument();
    expect(screen.queryByText(/sonuç/)).not.toBeInTheDocument();
    expect(row("hedef.txt")).toHaveAttribute("aria-selected", "true");
  });

  test("no hits says so, and the close button brings the folder back", async () => {
    setup();
    await screen.findByText("notlar.md");
    await userEvent.type(screen.getByRole("searchbox", { name: "Dosyaları filtrele" }), "yok-boyle-bir-sey");
    await userEvent.click(screen.getByRole("button", { name: "Alt klasörlerde ara" }));
    expect(await screen.findByText("Sonuç bulunamadı")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aramayı kapat" }));
    expect(await screen.findByText("notlar.md")).toBeInTheDocument();
  });

  test("an empty query does not search", async () => {
    const { api } = setup();
    await screen.findByText("notlar.md");
    expect(screen.getByRole("button", { name: "Alt klasörlerde ara" })).toBeDisabled();
    expect(api.sftpSearch).not.toHaveBeenCalled();
  });
});
