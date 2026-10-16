import type { ThemeMode } from "../theme";
import { tr } from "../locales/tr";

export interface ThemeToggleProps {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

export function ThemeToggle({ mode, onChange }: ThemeToggleProps) {
  return (
    <label className="theme-toggle">
      {tr.theme.label}
      <select value={mode} onChange={(e) => onChange(e.target.value as ThemeMode)}>
        <option value="system">{tr.theme.system}</option>
        <option value="light">{tr.theme.light}</option>
        <option value="dark">{tr.theme.dark}</option>
      </select>
    </label>
  );
}
