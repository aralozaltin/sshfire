import { useT } from "../i18n";

export interface TabInfo {
  id: string;
  title: string;
  status: "connecting" | "open" | "closed";
  color?: string | null;
}

export interface TabsProps {
  tabs: TabInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

export function Tabs({ tabs, activeId, onSelect, onClose, onContextMenu }: TabsProps) {
  const t = useT();
  if (tabs.length === 0) return <p className="tabs__empty">{t.tabs.empty}</p>;
  return (
    <div role="tablist" aria-label={t.tabs.label} className="tabs">
      {tabs.map((tab) => (
        <div key={tab.id} className={`tabs__item tabs__item--${tab.status}`}>
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeId}
            className="tabs__tab"
            style={tab.color ? { borderTopColor: tab.color } : undefined}
            onClick={() => onSelect(tab.id)}
            onContextMenu={(e) => {
              if (!onContextMenu) return;
              e.preventDefault();
              onContextMenu(tab.id, e.clientX, e.clientY);
            }}
          >
            {tab.title}
          </button>
          <button type="button" aria-label={`${tab.title} ${t.tabs.close}`} className="tabs__close" onClick={() => onClose(tab.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
