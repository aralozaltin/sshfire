import { useState, type FormEvent } from "react";
import { useT } from "../i18n";

export interface AuthPromptRequest {
  requestId: string;
  host: string;
  user: string;
  name: string;
  instructions: string;
  prompts: { text: string; echo: boolean }[];
}

export interface AuthPromptDialogProps {
  request: AuthPromptRequest;
  onAnswer: (requestId: string, answers: string[] | null) => void;
}

/** Sunucunun klavye etkileşimli doğrulamada sorduğu sorular (parola, iki aşamalı doğrulama kodu vb.). */
export function AuthPromptDialog({ request, onAnswer }: AuthPromptDialogProps) {
  const t = useT();
  const [answers, setAnswers] = useState<string[]>(() => request.prompts.map(() => ""));

  function submit(e: FormEvent) {
    e.preventDefault();
    onAnswer(request.requestId, answers);
  }

  return (
    <form className="server-dialog" role="dialog" aria-label={t.authPrompt.title} onSubmit={submit}>
      <h2>{request.name || t.authPrompt.title}</h2>
      <p>{t.authPrompt.body(request.user, request.host)}</p>
      {request.instructions && <p className="auth-instructions">{request.instructions}</p>}
      {request.prompts.map((p, i) => (
        <label key={i}>
          {p.text.trim()}
          <input
            type={p.echo ? "text" : "password"}
            autoFocus={i === 0}
            autoComplete="off"
            value={answers[i]}
            onChange={(e) => setAnswers((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
          />
        </label>
      ))}
      <div className="server-dialog__actions">
        <button type="button" onClick={() => onAnswer(request.requestId, null)}>{t.dialog.cancel}</button>
        <button type="submit">{t.authPrompt.submit}</button>
      </div>
    </form>
  );
}
