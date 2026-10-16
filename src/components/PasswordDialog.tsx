import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface PasswordRequest {
  requestId: string;
  host: string;
  user: string;
  kind?: "password" | "passphrase";
}

export interface PasswordDialogProps {
  request: PasswordRequest;
  onAnswer: (requestId: string, password: string | null, remember: boolean) => void;
}

export function PasswordDialog({ request, onAnswer }: PasswordDialogProps) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const isPassphrase = request.kind === "passphrase";
  const p = t.passwordPrompt;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password) onAnswer(request.requestId, password, remember);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={isPassphrase ? p.passphraseTitle : p.title} onSubmit={submit}>
      <h2>{isPassphrase ? p.passphraseTitle : p.title}</h2>
      <p>{(isPassphrase ? p.passphraseBody : p.body)(request.user, request.host)}</p>
      <label>
        {isPassphrase ? p.passphraseLabel : p.label}
        <input type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="password-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {isPassphrase ? p.passphraseRemember : p.remember}
      </label>
      <div className="server-dialog__actions">
        <button type="button" onClick={() => onAnswer(request.requestId, null, false)}>{t.dialog.cancel}</button>
        <button type="submit" disabled={!password}>{p.connect}</button>
      </div>
    </form>
  );
}
