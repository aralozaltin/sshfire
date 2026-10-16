import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";

/** Tema ve dil gibi seyrek kullanılan ayarları tek bir düğmenin arkasına toplar. */
export function SettingsMenu({ children }: { children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="settings" ref={box}>
      <button type="button" aria-label={t.chrome.settings} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">⚙ </span>
        {t.chrome.settings}
      </button>
      {open && <div className="settings__panel" role="group" aria-label={t.chrome.settings}>{children}</div>}
    </div>
  );
}
