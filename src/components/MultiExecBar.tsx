import { useT } from "../i18n";

export interface MultiExecBarProps {
  tabs: { id: string; title: string }[];
  enabled: boolean;
  selected: string[];
  onToggle: (on: boolean) => void;
  onSelect: (ids: string[]) => void;
}

export function MultiExecBar({ tabs, enabled, selected, onToggle, onSelect }: MultiExecBarProps) {
  const t = useT();
  if (tabs.length < 2) return null;
  return (
    <div className="multiexec">
      <button type="button" aria-pressed={enabled} className={enabled ? "multiexec__on" : undefined} onClick={() => onToggle(!enabled)}>
        {t.multiExec.label}
      </button>
      {enabled && (
        <>
          {tabs.map((tab) => (
            <label key={tab.id} className="multiexec__tab">
              <input
                type="checkbox"
                checked={selected.includes(tab.id)}
                onChange={(e) => onSelect(e.target.checked ? [...selected, tab.id] : selected.filter((id) => id !== tab.id))}
              />
              {tab.title}
            </label>
          ))}
          <span className="multiexec__hint">{t.multiExec.hint}</span>
        </>
      )}
    </div>
  );
}
