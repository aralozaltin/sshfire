import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface ImportPassphraseDialogProps {
  /** Önceki denemenin hata metni (yanlış parola gibi). */
  error?: string | null;
  onSubmit: (passphrase: string) => void;
  onCancel: () => void;
}

export function ImportPassphraseDialog({ error, onSubmit, onCancel }: ImportPassphraseDialogProps) {
  const t = useT();
  const s = t.sessionsIo;
  const [pass, setPass] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pass) onSubmit(pass);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={s.importTitle} onSubmit={submit}>
      <h2>{s.importTitle}</h2>
      <p>{s.importBody}</p>
      <label>
        {s.backupPassphrase}
        <input type="password" autoFocus autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{t.dialog.cancel}</button>
        <button type="submit" disabled={!pass}>{s.open}</button>
      </div>
    </form>
  );
}
