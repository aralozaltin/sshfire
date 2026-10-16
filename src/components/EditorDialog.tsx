import { useState } from "react";
import { errorText, useT } from "../i18n";
import { CodeEditor } from "./CodeEditor";

export interface EditorDialogProps {
  path: string;
  initial: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export function EditorDialog({ path, initial, onSave, onClose }: EditorDialogProps) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const dirty = value !== saved;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setSaved(value);
      setError(null);
      setJustSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  return (
    <div className="editor" role="dialog" aria-label={path}>
      <div className="editor__bar">
        <span className="editor__path">{path}</span>
        {dirty ? <span className="editor__state">{t.editor.unsaved}</span> : justSaved ? <span className="editor__state">{t.editor.saved}</span> : null}
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>{t.editor.save}</button>
        <button type="button" onClick={requestClose}>{t.editor.close}</button>
      </div>
      {error != null && <div role="alert" className="banner banner--error">{errorText(t, error)}</div>}
      <CodeEditor
        path={path}
        value={initial}
        label={t.editor.textLabel}
        wrap={wrap}
        dark={document.documentElement.dataset.theme !== "light"}
        onSave={() => void save()}
        onChange={(v) => {
          setValue(v);
          setJustSaved(false);
        }}
        onCursor={(line, column) => setCursor({ line, column })}
      />
      <div className="editor__status">
        <label>
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
          {t.editor.wrap}
        </label>
        <span>{t.editor.position(cursor.line, cursor.column)}</span>
      </div>
      {confirmingClose && (
        <div className="overlay">
          <div role="alertdialog" aria-modal="true" aria-label={t.editor.discardTitle} className="hostkey-dialog">
            <h2>{t.editor.discardTitle}</h2>
            <p>{t.editor.discardBody}</p>
            <div className="hostkey-dialog__actions">
              <button type="button" autoFocus onClick={() => setConfirmingClose(false)}>{t.editor.keepEditing}</button>
              <button type="button" onClick={onClose}>{t.editor.discard}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
