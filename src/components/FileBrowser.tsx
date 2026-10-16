import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { errorText, useT } from "../i18n";
import { baseName, breadcrumbs, joinPath, localBaseName, parentPath, planPaste, uniqueName, type ClipboardItem } from "../files/fileOps";
import { formatMode, formatModified, formatSize } from "../files/format";
import type { FileEntry, FilesApi } from "../files/types";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { loadColumns, resizeColumn, saveColumns } from "../files/columns";
import { FileInfoDialog } from "./FileInfoDialog";
import { PromptDialog } from "./PromptDialog";

export interface FileBrowserProps {
  tabId: string | null;
  connectionKey: string;
  api: FilesApi;
  clipboard: ClipboardItem | null;
  onClipboardChange: (c: ClipboardItem | null) => void;
  initialPath?: string;
  onPathChange?: (path: string) => void;
}

type MenuState = { x: number; y: number; onRow: boolean } | null;
type PromptState = { kind: "rename"; entry: FileEntry } | { kind: "mkdir" } | null;

export function FileBrowser({ tabId, connectionKey, api, clipboard, onClipboardChange, initialPath, onPathChange }: FileBrowserProps) {
  const t = useT();
  const f = t.files;
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [confirming, setConfirming] = useState<FileEntry[] | null>(null);
  const [info, setInfo] = useState<FileEntry | null>(null);
  const requestId = useRef(0);
  const [columns, setColumns] = useState<number[]>(loadColumns);
  const columnDrag = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);
  const live = useRef({ path, entries, load: (_p: string | null) => Promise.resolve() });

  const load = useCallback(
    async (target: string | null) => {
      if (!tabId) return;
      const id = ++requestId.current;
      setLoading(true);
      try {
        const dir = target ?? (await api.sftpHome(tabId));
        const list = await api.sftpList(tabId, dir);
        if (id !== requestId.current) return;
        setEntries(list);
        setPath(dir);
        setError(null);
        setSelected([]);
        setAnchor(null);
        onPathChange?.(dir);
      } catch (e) {
        if (id === requestId.current) setError(e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId, api],
  );

  live.current = { path, entries, load };

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      const d = columnDrag.current;
      if (d) setColumns(resizeColumn(d.startWidths, d.index, e.clientX - d.startX));
    };
    const up = () => {
      if (!columnDrag.current) return;
      columnDrag.current = null;
      document.body.classList.remove("is-resizing");
      setColumns((cur) => {
        saveColumns(cur);
        return cur;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  function startColumnDrag(index: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    columnDrag.current = { index, startX: e.clientX, startWidths: columns };
    document.body.classList.add("is-resizing");
  }

  async function uploadPaths(paths: string[]) {
    const { path: dir, entries: current } = live.current;
    if (!tabId || !dir || paths.length === 0) return;
    const taken = new Set(current.map((e) => e.name));
    const items = paths.map((local) => {
      const name = uniqueName(localBaseName(local), taken, f.copySuffix);
      taken.add(name);
      return { local, remote: joinPath(dir, name) };
    });
    try {
      await api.sftpUpload(tabId, items);
    } catch (e) {
      setError(e);
    }
  }

  async function pickAndUpload() {
    try {
      await uploadPaths(await api.pickFiles());
    } catch (e) {
      setError(e);
    }
  }

  async function downloadSelection(items: FileEntry[]) {
    if (!tabId || items.length === 0) return;
    try {
      await api.sftpDownload(tabId, items.map((i) => i.path));
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    if (!tabId) return;
    let cancelled = false;
    const offs: (() => void)[] = [];
    void api.onFilesDropped((paths) => void uploadPaths(paths)).then((off) => (cancelled ? off() : offs.push(off)));
    void api
      .onTransferProgress((e) => {
        if (e.direction === "upload" && e.state === "done") void live.current.load(live.current.path);
      })
      .then((off) => (cancelled ? off() : offs.push(off)));
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, api]);

  useEffect(() => {
    if (tabId) void load(initialPath ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  if (!tabId) return <p className="files__hint">{f.noConnection}</p>;

  const selectedEntries = entries.filter((e) => selected.includes(e.path));

  async function run(action: () => Promise<void>) {
    try {
      setNotice(null);
      await action();
      await load(path);
    } catch (e) {
      setError(e);
    }
  }

  function select(entry: FileEntry, ev: MouseEvent) {
    if (ev.shiftKey && anchor) {
      const a = entries.findIndex((x) => x.path === anchor);
      const b = entries.findIndex((x) => x.path === entry.path);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(entries.slice(from, to + 1).map((x) => x.path));
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      setSelected((cur) => (cur.includes(entry.path) ? cur.filter((p) => p !== entry.path) : [...cur, entry.path]));
    } else {
      setSelected([entry.path]);
    }
    setAnchor(entry.path);
  }

  function copySelection(mode: "copy" | "cut") {
    if (selectedEntries.length === 0) return;
    onClipboardChange({ mode, connectionKey, entries: selectedEntries.map((e) => ({ path: e.path, isDir: e.isDir })) });
  }

  async function paste() {
    if (!clipboard || !path || !tabId) return;
    const steps = planPaste(clipboard, path, new Set(entries.map((e) => e.name)), clipboard.connectionKey === connectionKey, f.copySuffix);
    if (steps.some((s) => s.op === "unsupported")) return setNotice(f.unsupported);
    await run(async () => {
      for (const s of steps) {
        if (s.op === "copy") await api.sftpCopy(tabId, s.from, s.to);
        else if (s.op === "move") await api.sftpRename(tabId, s.from, s.to);
      }
      if (clipboard.mode === "cut") onClipboardChange(null);
    });
  }

  async function confirmDelete() {
    const victims = confirming;
    setConfirming(null);
    if (!victims || !tabId) return;
    await run(async () => {
      for (const v of victims) await api.sftpRemove(tabId, v.path, v.isDir);
    });
  }

  async function submitPrompt(name: string) {
    const p = prompt;
    setPrompt(null);
    if (!p || !path || !tabId) return;
    await run(async () => {
      if (p.kind === "mkdir") await api.sftpMkdir(tabId, joinPath(path, name));
      else await api.sftpRename(tabId, p.entry.path, joinPath(parentPath(p.entry.path), name));
    });
  }

  function open(entry: FileEntry) {
    if (entry.isDir) void load(entry.path);
  }

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "c") copySelection("copy");
    else if (mod && key === "x") copySelection("cut");
    else if (mod && key === "v") void paste();
    else if (mod && key === "a") {
      e.preventDefault();
      setSelected(entries.map((x) => x.path));
    } else if (e.key === "Delete" && selectedEntries.length > 0) setConfirming(selectedEntries);
    else if (e.key === "F2" && selectedEntries.length === 1) setPrompt({ kind: "rename", entry: selectedEntries[0] });
    else if (e.key === "Enter" && selectedEntries.length === 1) open(selectedEntries[0]);
    else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) path && void load(parentPath(path));
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = entries.findIndex((x) => x.path === selected[selected.length - 1]);
      const next = entries[Math.min(entries.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) {
        setSelected([next.path]);
        setAnchor(next.path);
      }
    } else return;
  }

  const menuItems: MenuItem[] = menu?.onRow
    ? [
        { label: f.copy, onClick: () => copySelection("copy") },
        { label: f.cut, onClick: () => copySelection("cut") },
        { label: f.paste, onClick: () => void paste(), disabled: !clipboard },
        { label: t.transfer.download, onClick: () => void downloadSelection(selectedEntries) },
        { label: f.rename, onClick: () => selectedEntries[0] && setPrompt({ kind: "rename", entry: selectedEntries[0] }), disabled: selectedEntries.length !== 1 },
        { label: t.remove, onClick: () => setConfirming(selectedEntries) },
        { label: f.info, onClick: () => selectedEntries[0] && setInfo(selectedEntries[0]), disabled: selectedEntries.length !== 1 },
      ]
    : [
        { label: f.paste, onClick: () => void paste(), disabled: !clipboard },
        { label: f.newFolder, onClick: () => setPrompt({ kind: "mkdir" }) },
        { label: f.refresh, onClick: () => void load(path) },
      ];

  return (
    <div className="files">
      <div className="files__bar">
        <button type="button" onClick={() => path && void load(parentPath(path))} disabled={!path || path === "/"}>{f.up}</button>
        <button type="button" onClick={() => void load(path)}>{f.refresh}</button>
        <button type="button" onClick={() => setPrompt({ kind: "mkdir" })}>{f.newFolder}</button>
        <button type="button" onClick={() => void pickAndUpload()}>{t.transfer.upload}</button>
        <button type="button" disabled={selectedEntries.length === 0} onClick={() => void downloadSelection(selectedEntries)}>
          {t.transfer.download}
        </button>
      </div>
      {path && (
        <nav aria-label={f.pathLabel} className="files__crumbs">
          {breadcrumbs(path).map((c) => (
            <button key={c.path} type="button" onClick={() => void load(c.path)}>{c.name}</button>
          ))}
        </nav>
      )}
      {error != null && <div role="alert" className="banner banner--error">{errorText(t, error)}</div>}
      {notice && <div role="status" className="banner banner--warn">{notice}</div>}
      {loading && entries.length === 0 && error == null && <p className="files__hint">{f.loading}</p>}
      <table
        aria-label={f.tableLabel}
        className="files__table"
        style={{ width: `${columns.reduce((a, b) => a + b, 0)}px` }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, onRow: false });
        }}
      >
        <colgroup>
          {columns.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {[f.colName, f.colSize, f.colModified, f.colPermissions].map((label, i) => (
              <th key={label} scope="col" aria-label={label}>
                {label}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t.layout.columnResize(label)}
                  className="col-resizer"
                  onMouseDown={(e) => startColumnDrag(i, e)}
                  onDoubleClick={() => setColumns((cur) => { const next = resizeColumn(cur, i, [280, 80, 150, 100][i] - cur[i]); saveColumns(next); return next; })}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.path}
              aria-selected={selected.includes(entry.path)}
              className={selected.includes(entry.path) ? "is-selected" : undefined}
              onClick={(ev) => select(entry, ev)}
              onDoubleClick={() => open(entry)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!selected.includes(entry.path)) {
                  setSelected([entry.path]);
                  setAnchor(entry.path);
                }
                setMenu({ x: ev.clientX, y: ev.clientY, onRow: true });
              }}
            >
              <td>
                <span aria-hidden="true">{entry.isDir ? "📁 " : entry.isSymlink ? "🔗 " : "📄 "}</span>
                {entry.name}
              </td>
              <td>{entry.isDir ? "" : formatSize(entry.size)}</td>
              <td>{formatModified(entry.modified, f.dateLocale)}</td>
              <td>{entry.permissions == null ? "—" : formatMode(entry.permissions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && error == null && entries.length === 0 && path && <p className="files__hint">{f.emptyDir}</p>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {prompt && (
        <div className="overlay">
          <PromptDialog
            title={prompt.kind === "mkdir" ? f.newFolder : f.rename}
            label={f.newName}
            initial={prompt.kind === "rename" ? baseName(prompt.entry.path) : ""}
            onSubmit={(name) => void submitPrompt(name)}
            onCancel={() => setPrompt(null)}
          />
        </div>
      )}
      {confirming && (
        <div className="overlay">
          <div role="alertdialog" aria-modal="true" aria-label={t.confirmDelete.title} className="hostkey-dialog">
            <h2>{t.confirmDelete.title}</h2>
            <p>{f.deleteBody(confirming.length, confirming[0]?.name ?? "")}</p>
            <div className="hostkey-dialog__actions">
              <button type="button" autoFocus onClick={() => setConfirming(null)}>{t.dialog.cancel}</button>
              <button type="button" onClick={() => void confirmDelete()}>{t.remove}</button>
            </div>
          </div>
        </div>
      )}
      {info && (
        <div className="overlay">
          <FileInfoDialog entry={info} onClose={() => setInfo(null)} />
        </div>
      )}
    </div>
  );
}
