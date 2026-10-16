import type { ThemeMode } from "../theme";
import { useT } from "../i18n";

export interface ThemeToggleProps {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

export function ThemeToggle({ mode, onChange }: ThemeToggleProps) {
  const t = useT();
  return (
    <label className="theme-toggle">
      {t.theme.label}
      <select value={mode} onChange={(e) => onChange(e.target.value as ThemeMode)}>
        <option value="system">{t.theme.system}</option>
        <option value="light">{t.theme.light}</option>
        <option value="dark">{t.theme.dark}</option>
      </select>
    </label>
  );
}
