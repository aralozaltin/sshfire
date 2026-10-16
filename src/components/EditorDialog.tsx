import { useRef, useState, type KeyboardEvent } from "react";
import { errorText, useT } from "../i18n";

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
  const box = useRef<HTMLTextAreaElement>(null);
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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    } else if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: from, selectionEnd: to } = el;
      const next = `${value.slice(0, from)}\t${value.slice(to)}`;
      setValue(next);
      setJustSaved(false);
      requestAnimationFrame(() => el.setSelectionRange(from + 1, from + 1));
    }
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
      <textarea
        ref={box}
        aria-label={t.editor.textLabel}
        className="editor__text"
        spellCheck={false}
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setJustSaved(false);
        }}
        onKeyDown={onKeyDown}
      />
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
