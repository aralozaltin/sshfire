import { useT } from "../i18n";
import { SCHEME_IDS } from "../terminal/schemes";

export function TerminalSchemeSelect({ scheme, onChange }: { scheme: string; onChange: (id: string) => void }) {
  const t = useT();
  return (
    <label className="theme-toggle">
      {t.termScheme.label}
      <select value={scheme} onChange={(e) => onChange(e.target.value)}>
        {SCHEME_IDS.map((id) => (
          <option key={id} value={id}>
            {id === "default" ? t.termScheme.default : (t.termScheme.names as Record<string, string>)[id]}
          </option>
        ))}
      </select>
    </label>
  );
}
