import type { ReactNode } from "react";
import { useT } from "../i18n";

export type SidebarTab = "servers" | "files";

export interface SidebarProps {
  active: SidebarTab;
  onChange: (tab: SidebarTab) => void;
  servers: ReactNode;
  files: ReactNode;
}

export function Sidebar({ active, onChange, servers, files }: SidebarProps) {
  const t = useT();
  const tab = (id: SidebarTab, label: string) => (
    <button type="button" role="tab" aria-selected={active === id} className="sidebar__tab" onClick={() => onChange(id)}>
      {label}
    </button>
  );
  return (
    <div className="sidebar">
      <div role="tablist" className="sidebar__tabs">
        {tab("servers", t.servers)}
        {tab("files", t.files.tableLabel)}
      </div>
      <div className="sidebar__panel">{active === "servers" ? servers : files}</div>
    </div>
  );
}
