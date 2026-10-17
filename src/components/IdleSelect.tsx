import { useT } from "../i18n";
import { IDLE_CHOICES } from "../idle/idle";

export function IdleSelect({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const t = useT();
  const label = (m: number) => (m === 0 ? t.idle.never : m % 60 === 0 ? t.idle.hours(m / 60) : t.idle.minutes(m));
  return (
    <label className="theme-toggle">
      {t.idle.label}
      <select value={minutes} onChange={(e) => onChange(Number(e.target.value))}>
        {IDLE_CHOICES.map((m) => (
          <option key={m} value={m}>{label(m)}</option>
        ))}
      </select>
    </label>
  );
}
