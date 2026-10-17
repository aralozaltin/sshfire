import { useMemo, useState } from "react";
import { ContextMenu } from "./ContextMenu";
import type { Session } from "../types";
import { useT } from "../i18n";

export interface ServerListProps {
  sessions: Session[];
  /** Açık ve bağlı bir sekmesi olan sunucuların kimlikleri. */
  connectedIds?: string[];
  onConnect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onImportFile?: () => void;
}

function matches(s: Session, q: string): boolean {
  if (!q) return true;
  return [s.name, s.host, s.folder ?? ""].some((v) => v.toLowerCase().includes(q));
}

const COLLAPSED_KEY = "ssh-istemci.collapsedFolders";

function loadCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch {
    // Depolama kapalıysa kapalı klasörler yalnızca bu oturumda hatırlanır.
  }
}

export function ServerList({ sessions, connectedIds = [], onConnect, onEdit, onDelete, onAdd, onImport, onExport, onImportFile }: ServerListProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const q = query.trim().toLowerCase();

  function toggleFolder(folder: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(folder)) next.add(folder);
      saveCollapsed(next);
      return next;
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions.filter((x) => matches(x, q))) {
      const key = s.folder?.trim() || t.noFolder;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "tr"));
  }, [sessions, q]);

  if (sessions.length === 0) {
    return (
      <div className="server-list server-list--empty">
        <h2>{t.emptyTitle}</h2>
        <p>{t.emptyHint}</p>
        <button type="button" onClick={onAdd}>{t.add}</button>
        {onImport && <button type="button" onClick={onImport}>{t.importConfig.button}</button>}
        {onImportFile && <button type="button" onClick={onImportFile}>{t.sessionsIo.importFile}</button>}
      </div>
    );
  }

  return (
    <div className="server-list">
      <div className="server-list__bar">
        <input
          type="search"
          aria-label={t.search}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="icon-button" aria-label={t.add} title={t.add} onClick={onAdd}>+</button>
        {(onImport || onExport || onImportFile) && (
          <button
            type="button"
            className="icon-button"
            aria-label={t.chrome.more}
            title={t.chrome.more}
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom });
            }}
          >
            ⋯
          </button>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(onImport ? [{ label: t.importConfig.button, onClick: onImport }] : []),
            ...(onImportFile ? [{ label: t.sessionsIo.importFile, onClick: onImportFile }] : []),
            ...(onExport ? [{ label: t.sessionsIo.export, onClick: onExport }] : []),
          ]}
        />
      )}
      {groups.length === 0 && <p className="server-list__none">{t.noResults}</p>}
      {groups.map(([folder, items]) => {
        const open = !!q || !collapsed.has(folder);
        return (
        <section key={folder} role="group" aria-label={folder} className="server-list__group">
          <h3>
            <button type="button" className="server-list__folder" aria-expanded={open} aria-label={folder} onClick={() => toggleFolder(folder)}>
              <span className="server-list__chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
              <span>{folder}</span>
              <span className="server-list__count">{items.length}</span>
              {!open && items.some((s) => connectedIds.includes(s.id)) && <span role="img" aria-label={t.connectedLabel} className="server-list__online" />}
            </button>
          </h3>
          {open && <ul>
            {items.map((s) => (
              <li key={s.id} className={selectedId === s.id ? "is-selected" : undefined}>
                <button
                  type="button"
                  className="server-list__connect"
                  aria-pressed={selectedId === s.id}
                  onClick={() => setSelectedId(s.id)}
                  onDoubleClick={() => onConnect(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onConnect(s.id);
                    }
                  }}
                >
                  {s.color && <span data-testid={`color-dot-${s.id}`} className="server-list__dot" style={{ backgroundColor: s.color }} />}
                  <span className="server-list__name">{s.name}</span>{" "}
                  <span className="server-list__host">{s.user}@{s.host}{s.port !== 22 ? `:${s.port}` : ""}</span>
                </button>
                {connectedIds.includes(s.id) && <span role="img" aria-label={t.connectedLabel} title={t.connectedLabel} className="server-list__online" />}
                <button type="button" aria-label={`${s.name} ${t.edit.toLowerCase()}`} onClick={() => onEdit(s.id)}>✎</button>
                <button type="button" aria-label={`${s.name} ${t.remove.toLowerCase()}`} onClick={() => onDelete(s.id)}>✕</button>
              </li>
            ))}
          </ul>}
        </section>
        );
      })}
    </div>
  );
}
