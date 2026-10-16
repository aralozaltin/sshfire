import { useT } from "../i18n";

export interface UpdateSettingsProps {
  version: string | null;
  auto: boolean;
  checking: boolean;
  message: string | null;
  onAutoChange: (on: boolean) => void;
  onCheck: () => void;
}

export function UpdateSettings({ version, auto, checking, message, onAutoChange, onCheck }: UpdateSettingsProps) {
  const t = useT();
  const u = t.updates;
  return (
    <div className="update-settings">
      {version && <span className="update-settings__version">{u.version(version)}</span>}
      <button type="button" disabled={checking} onClick={onCheck}>{checking ? u.checking : u.check}</button>
      {message && <span role="status" className="update-settings__message">{message}</span>}
      <label className="password-remember">
        <input type="checkbox" checked={auto} onChange={(e) => onAutoChange(e.target.checked)} />
        {u.auto}
      </label>
    </div>
  );
}
