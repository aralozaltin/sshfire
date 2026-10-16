import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../i18n";

export interface InlineRenameProps {
  initial: string;
  isDir: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function InlineRename({ initial, isDir, onSubmit, onCancel }: InlineRenameProps) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = isDir ? -1 : initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, isDir]);

  function commit() {
    const name = value.trim();
    if (name === initial) return finish(onCancel);
    if (!name) return setError(t.files.nameEmpty);
    if (name.includes("/")) return setError(t.files.nameHasSlash);
    finish(() => onSubmit(name));
  }

  function finish(action: () => void) {
    if (done.current) return;
    done.current = true;
    action();
  }

  function onKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") finish(onCancel);
  }

  return (
    <span className="inline-rename">
      <input
        ref={ref}
        aria-label={t.files.newName}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onBlur={() => {
          if (!error) commit();
        }}
      />
      {error && <span role="alert" className="inline-rename__error">{error}</span>}
    </span>
  );
}
