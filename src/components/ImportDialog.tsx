import { useState } from "react";
import { useT } from "../i18n";

export interface ImportCandidate {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile: string | null;
  exists: boolean;
}

export interface ImportDialogProps {
  candidates: ImportCandidate[];
  onImport: (chosen: ImportCandidate[]) => void;
  onCancel: () => void;
}

export function ImportDialog({ candidates, onImport, onCancel }: ImportDialogProps) {
  const t = useT();
  const selectable = candidates.filter((c) => !c.exists).map((c) => c.alias);
  const [chosen, setChosen] = useState<string[]>(selectable);
  const toggle = (alias: string) => setChosen((cur) => (cur.includes(alias) ? cur.filter((a) => a !== alias) : [...cur, alias]));
  const allSelected = selectable.length > 0 && selectable.every((a) => chosen.includes(a));

  return (
    <div className="server-dialog import-dialog" role="dialog" aria-label={t.importConfig.title}>
      <h2>{t.importConfig.title}</h2>
      {candidates.length === 0 ? (
        <p>{t.importConfig.empty}</p>
      ) : (
        <>
          <label className="import-dialog__all">
            <input type="checkbox" checked={allSelected} onChange={() => setChosen(allSelected ? [] : selectable)} />
            {t.importConfig.selectAll}
          </label>
          <ul className="import-dialog__list">
            {candidates.map((c) => (
              <li key={c.alias}>
                <label>
                  <input type="checkbox" disabled={c.exists} checked={chosen.includes(c.alias)} onChange={() => toggle(c.alias)} />
                  <strong>{c.alias}</strong>
                </label>
                <span className="import-dialog__addr">{`${c.user}@${c.host}${c.port === 22 ? "" : `:${c.port}`}`}</span>
                {c.exists && <em>{t.importConfig.exists}</em>}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{t.dialog.cancel}</button>
        <button type="button" disabled={chosen.length === 0} onClick={() => onImport(candidates.filter((c) => chosen.includes(c.alias)))}>
          {t.importConfig.importButton(chosen.length)}
        </button>
      </div>
    </div>
  );
}
