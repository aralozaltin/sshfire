import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface ExportDialogProps {
  /** `passphrase` boşsa yalnızca (parolasız) sunucu listesi yazılır. */
  onExport: (passphrase?: string) => void;
  onCancel: () => void;
}

export const MIN_BACKUP_PASSPHRASE = 8;

export function ExportDialog({ onExport, onCancel }: ExportDialogProps) {
  const t = useT();
  const s = t.sessionsIo;
  const [withSecrets, setWithSecrets] = useState(false);
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!withSecrets) return onExport();
    if (pass.length < MIN_BACKUP_PASSPHRASE) return setProblem(s.tooShort);
    if (pass !== again) return setProblem(s.mismatch);
    onExport(pass);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={s.exportTitle} onSubmit={submit}>
      <h2>{s.exportTitle}</h2>
      <label className="password-remember">
        <input type="checkbox" checked={withSecrets} onChange={(e) => { setWithSecrets(e.target.checked); setProblem(null); }} />
        {s.includeSecrets}
      </label>
      <p>{withSecrets ? s.includeSecretsHint : s.plainHint}</p>
      {withSecrets && (
        <>
          <label>
            {s.backupPassphrase}
            <input type="password" autoFocus autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <label>
            {s.backupPassphraseRepeat}
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </label>
        </>
      )}
      {problem && <p role="alert">{problem}</p>}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{t.dialog.cancel}</button>
        <button type="submit">{s.chooseFile}</button>
      </div>
    </form>
  );
}
