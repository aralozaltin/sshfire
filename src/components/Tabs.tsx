import { tr } from "../locales/tr";

export interface TabInfo {
  id: string;
  title: string;
  status: "connecting" | "open" | "closed";
}

export interface TabsProps {
  tabs: TabInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function Tabs({ tabs, activeId, onSelect, onClose }: TabsProps) {
  if (tabs.length === 0) return <p className="tabs__empty">{tr.tabs.empty}</p>;
  return (
    <div role="tablist" aria-label={tr.tabs.label} className="tabs">
      {tabs.map((t) => (
        <div key={t.id} className={`tabs__item tabs__item--${t.status}`}>
          <button
            type="button"
            role="tab"
            aria-selected={t.id === activeId}
            className="tabs__tab"
            onClick={() => onSelect(t.id)}
          >
            {t.title}
          </button>
          <button type="button" aria-label={`${t.title} ${tr.tabs.close}`} className="tabs__close" onClick={() => onClose(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
