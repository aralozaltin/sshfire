import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface PromptDialogProps {
  title: string;
  label: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ title, label, initial = "", onSubmit, onCancel }: PromptDialogProps) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return setError(t.files.nameEmpty);
    if (name.includes("/")) return setError(t.files.nameHasSlash);
    onSubmit(name);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={title} onSubmit={submit} noValidate>
      <h2>{title}</h2>
      <label>
        {label}
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{t.dialog.cancel}</button>
        <button type="submit">{t.files.ok}</button>
      </div>
    </form>
  );
}
