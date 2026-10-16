import { useT } from "../i18n";

export type TerminalLayout = "single" | "cols" | "rows" | "grid";

export interface LayoutSwitchProps {
  tabCount: number;
  layout: TerminalLayout;
  onChange: (layout: TerminalLayout) => void;
}

export function LayoutSwitch({ tabCount, layout, onChange }: LayoutSwitchProps) {
  const t = useT();
  if (tabCount < 2) return null;
  const options: [TerminalLayout, string][] = [
    ["single", t.layout.single],
    ["cols", t.layout.cols],
    ["rows", t.layout.rows],
    ["grid", t.layout.grid],
  ];
  return (
    <div className="layout-switch" role="group" aria-label={t.layout.label}>
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={layout === id} className={layout === id ? "multiexec__on" : undefined} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
