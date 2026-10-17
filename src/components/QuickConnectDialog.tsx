import { useEffect, useState, type FormEvent } from "react";
import { useT } from "../i18n";
import { parseTarget, type QuickTarget } from "../sessions/quickConnect";

export function QuickConnectDialog({ onConnect, onClose }: { onConnect: (target: QuickTarget) => void; onClose: () => void }) {
  const t = useT();
  const q = t.quickConnect;
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const target = parseTarget(text);
    if (!target) return setInvalid(true);
    onConnect(target);
  }

  return (
    <form role="dialog" aria-label={q.title} className="server-dialog quick-connect" onSubmit={submit}>
      <h2>{q.title}</h2>
      <label>
        {q.address}
        <input
          autoFocus
          value={text}
          placeholder="deploy@10.0.0.5:22"
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
        />
      </label>
      {invalid && <p role="alert">{q.invalid}</p>}
      <p className="quick-connect__hint">{q.hint}</p>
      <div className="server-dialog__actions">
        <button type="button" onClick={onClose}>{q.cancel}</button>
        <button type="submit">{q.connect}</button>
      </div>
    </form>
  );
}
