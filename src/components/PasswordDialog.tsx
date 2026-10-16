import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface PasswordRequest {
  requestId: string;
  host: string;
  user: string;
}

export interface PasswordDialogProps {
  request: PasswordRequest;
  onAnswer: (requestId: string, password: string | null, remember: boolean) => void;
}

export function PasswordDialog({ request, onAnswer }: PasswordDialogProps) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password) onAnswer(request.requestId, password, remember);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={t.passwordPrompt.title} onSubmit={submit}>
      <h2>{t.passwordPrompt.title}</h2>
      <p>{t.passwordPrompt.body(request.user, request.host)}</p>
      <label>
        {t.passwordPrompt.label}
        <input type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="password-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t.passwordPrompt.remember}
      </label>
      <div className="server-dialog__actions">
        <button type="button" onClick={() => onAnswer(request.requestId, null, false)}>{t.dialog.cancel}</button>
        <button type="submit" disabled={!password}>{t.passwordPrompt.connect}</button>
      </div>
    </form>
  );
}
