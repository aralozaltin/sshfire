import { useMemo, useState } from "react";
import type { Session } from "../types";
import { useT } from "../i18n";

export interface ServerListProps {
  sessions: Session[];
  onConnect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport?: () => void;
}

function matches(s: Session, q: string): boolean {
  if (!q) return true;
  return [s.name, s.host, s.folder ?? ""].some((v) => v.toLowerCase().includes(q));
}

export function ServerList({ sessions, onConnect, onEdit, onDelete, onAdd, onImport }: ServerListProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

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
        <button type="button" onClick={onAdd}>{t.add}</button>
      </div>
      {onImport && (
        <div className="server-list__import">
          <button type="button" onClick={onImport}>{t.importConfig.button}</button>
        </div>
      )}
      {groups.length === 0 && <p className="server-list__none">{t.noResults}</p>}
      {groups.map(([folder, items]) => (
        <section key={folder} role="group" aria-label={folder} className="server-list__group">
          <h3>{folder}</h3>
          <ul>
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
                  <span className="server-list__name">{s.name}</span>{" "}
                  <span className="server-list__host">{s.user}@{s.host}{s.port !== 22 ? `:${s.port}` : ""}</span>
                </button>
                <button type="button" aria-label={`${s.name} ${t.edit.toLowerCase()}`} onClick={() => onEdit(s.id)}>✎</button>
                <button type="button" aria-label={`${s.name} ${t.remove.toLowerCase()}`} onClick={() => onDelete(s.id)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
