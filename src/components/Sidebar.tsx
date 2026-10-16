import type { ReactNode } from "react";
import { useT } from "../i18n";

export type SidebarTab = "servers" | "files" | "tunnels";

export interface SidebarProps {
  active: SidebarTab;
  onChange: (tab: SidebarTab) => void;
  servers: ReactNode;
  files: ReactNode;
  tunnels?: ReactNode;
}

export function Sidebar({ active, onChange, servers, files, tunnels }: SidebarProps) {
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
        {tunnels !== undefined && tab("tunnels", t.tunnels.tab)}
      </div>
      <div className="sidebar__panel">{active === "servers" ? servers : active === "files" ? files : tunnels}</div>
    </div>
  );
}
