import { useState } from "react";
import { useT } from "../i18n";
import type { FileEntry } from "../files/types";

const GROUPS = ["permOwner", "permGroup", "permOthers"] as const;
const BITS = [
  ["permRead", 4],
  ["permWrite", 2],
  ["permExec", 1],
] as const;

export function PermissionsDialog({ entry, onApply, onClose }: { entry: FileEntry; onApply: (mode: number) => void; onClose: () => void }) {
  const t = useT();
  const f = t.files;
  const [mode, setMode] = useState((entry.permissions ?? 0) & 0o777);
  const [text, setText] = useState(mode.toString(8));
  const valid = /^[0-7]{1,4}$/.test(text);

  function toggle(shift: number, bit: number) {
    const next = mode ^ (bit << shift);
    setMode(next);
    setText(next.toString(8));
  }

  function typed(value: string) {
    setText(value);
    if (/^[0-7]{1,4}$/.test(value)) setMode(parseInt(value, 8) & 0o777);
  }

  return (
    <div role="dialog" aria-label={f.chmod} className="hostkey-dialog permissions">
      <h2>{f.chmod}</h2>
      <p className="permissions__path">{entry.path}</p>
      <div className="permissions__grid">
        {GROUPS.map((g, i) => (
          <fieldset key={g}>
            <legend>{f[g]}</legend>
            {BITS.map(([label, bit]) => (
              <label key={label}>
                <input
                  type="checkbox"
                  aria-label={`${f[g]}: ${f[label]}`}
                  checked={(mode & (bit << ((2 - i) * 3))) !== 0}
                  onChange={() => toggle((2 - i) * 3, bit)}
                />
                {f[label]}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <label className="permissions__octal">
        {f.permOctal}
        <input value={text} onChange={(e) => typed(e.target.value)} maxLength={4} spellCheck={false} />
      </label>
      <div className="hostkey-dialog__actions">
        <button type="button" onClick={onClose}>{f.close}</button>
        <button type="button" disabled={!valid} onClick={() => onApply(mode)}>{f.apply}</button>
      </div>
    </div>
  );
}
