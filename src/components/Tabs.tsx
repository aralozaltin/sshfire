import { useRef, useState } from "react";
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
  /** `fromId` sekmesini `toId` sekmesinin yerine taşır. */
  onReorder?: (fromId: string, toId: string) => void;
}

export function Tabs({ tabs, activeId, onSelect, onClose, onContextMenu, onReorder }: TabsProps) {
  const t = useT();
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (tabs.length === 0) return <p className="tabs__empty">{t.tabs.empty}</p>;
  return (
    <div role="tablist" aria-label={t.tabs.label} className="tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tabs__item tabs__item--${tab.status}${over === tab.id ? " is-drop-target" : ""}`}
          draggable={onReorder ? true : undefined}
          onDragStart={(e) => {
            if (!onReorder) return;
            dragging.current = tab.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", tab.id);
          }}
          onDragOver={(e) => {
            if (!onReorder || !dragging.current || dragging.current === tab.id) return;
            e.preventDefault();
            setOver(tab.id);
          }}
          onDragLeave={() => setOver((cur) => (cur === tab.id ? null : cur))}
          onDrop={(e) => {
            const from = dragging.current;
            dragging.current = null;
            setOver(null);
            if (!onReorder || !from || from === tab.id) return;
            e.preventDefault();
            onReorder(from, tab.id);
          }}
          onDragEnd={() => {
            dragging.current = null;
            setOver(null);
          }}
        >
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
