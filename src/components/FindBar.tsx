import { useState, type KeyboardEvent } from "react";
import { useT } from "../i18n";

export interface FindBarProps {
  onFind: (query: string, forward: boolean) => void;
  onClose: () => void;
}

export function FindBar({ onFind, onClose }: FindBarProps) {
  const t = useT();
  const [query, setQuery] = useState("");

  function onKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape") onClose();
    else if (e.key === "Enter" && query) onFind(query, !e.shiftKey);
  }

  return (
    <div className="findbar" role="search">
      <input
        type="search"
        autoFocus
        aria-label={t.find.label}
        placeholder={t.find.placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value) onFind(e.target.value, true);
        }}
        onKeyDown={onKeyDown}
      />
      <button type="button" disabled={!query} onClick={() => onFind(query, false)}>{t.find.prev}</button>
      <button type="button" disabled={!query} onClick={() => onFind(query, true)}>{t.find.next}</button>
      <button type="button" aria-label={t.find.close} onClick={onClose}>✕</button>
    </div>
  );
}
