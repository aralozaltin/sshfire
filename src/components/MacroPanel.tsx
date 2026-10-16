import { useState } from "react";
import { useT } from "../i18n";
import { previewText, type Macro } from "../macros/macros";

export interface MacroPanelProps {
  macros: Macro[];
  canRun: boolean;
  recording: boolean;
  onRun: (m: Macro) => void;
  onSave: (m: { id?: string; name: string; text: string }) => void;
  onDelete: (id: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

interface Draft {
  id?: string;
  name: string;
  text: string;
}

export function MacroPanel({ macros, canRun, recording, onRun, onSave, onDelete, onStartRecording, onStopRecording }: MacroPanelProps) {
  const t = useT();
  const m = t.macros;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function submit() {
    if (!draft) return;
    const next: string[] = [];
    if (!draft.name.trim()) next.push(m.errName);
    if (!draft.text.trim()) next.push(m.errText);
    setErrors(next);
    if (next.length > 0) return;
    onSave({ id: draft.id, name: draft.name.trim(), text: draft.text });
    setDraft(null);
  }

  return (
    <div className="macros">
      <div className="files__bar">
        <button type="button" onClick={() => { setErrors([]); setDraft({ name: "", text: "" }); }}>{m.new}</button>
        {recording ? (
          <button type="button" className="multiexec__on" onClick={onStopRecording}>{m.stopRecording}</button>
        ) : (
          <button type="button" disabled={!canRun} onClick={onStartRecording}>{m.record}</button>
        )}
      </div>
      {recording && <div role="status" className="banner banner--warn">{m.recording}</div>}
      {!canRun && <p className="files__hint">{m.needConnection}</p>}
      {macros.length === 0 && <p className="files__hint">{m.empty}</p>}
      <ul className="macros__list">
        {macros.map((macro) => (
          <li key={macro.id}>
            <div className="macros__text">
              <strong>{macro.name}</strong>
              <span>{previewText(macro.text)}</span>
            </div>
            <button type="button" disabled={!canRun} onClick={() => onRun(macro)}>{m.run}</button>
            <button type="button" onClick={() => { setErrors([]); setDraft({ id: macro.id, name: macro.name, text: macro.text }); }}>{m.edit}</button>
            <button type="button" onClick={() => onDelete(macro.id)}>{m.remove}</button>
          </li>
        ))}
      </ul>
      {draft && (
        <form
          className="macros__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label>
            {m.name}
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            {m.text}
            <textarea rows={5} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </label>
          {errors.map((e) => (
            <p key={e} role="alert" className="tunnels__error">{e}</p>
          ))}
          <div className="server-dialog__actions">
            <button type="button" onClick={() => setDraft(null)}>{m.cancel}</button>
            <button type="submit">{m.save}</button>
          </div>
        </form>
      )}
    </div>
  );
}
