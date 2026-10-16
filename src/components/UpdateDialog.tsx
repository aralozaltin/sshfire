import { useT } from "../i18n";

export interface UpdateDialogProps {
  version: string;
  notes: string | null;
  state: "ready" | "installing" | "error";
  progress: { done: number; total: number | null } | null;
  error: string | null;
  onInstall: () => void;
  onLater: () => void;
}

export function UpdateDialog({ version, notes, state, progress, error, onInstall, onLater }: UpdateDialogProps) {
  const t = useT();
  const u = t.updates;
  const installing = state === "installing";
  const pct = progress && progress.total ? Math.min(100, Math.floor((progress.done / progress.total) * 100)) : null;
  return (
    <div className="server-dialog update-dialog" role="dialog" aria-label={u.title}>
      <h2>{u.title}</h2>
      <p>{u.body(version)}</p>
      {notes && (
        <>
          <strong>{u.notes}</strong>
          <pre className="update-dialog__notes">{notes}</pre>
        </>
      )}
      {installing && (
        <>
          <p>{u.installing}</p>
          <progress role="progressbar" aria-label={u.installing} max={100} {...(pct == null ? {} : { value: pct, "aria-valuenow": pct })} />
        </>
      )}
      {state === "error" && (
        <p role="alert" className="tunnels__error">{`${u.failed}: ${error ?? ""}`}</p>
      )}
      <div className="server-dialog__actions">
        <button type="button" disabled={installing} onClick={onLater}>{u.later}</button>
        <button type="button" disabled={installing} onClick={onInstall}>{u.install}</button>
      </div>
    </div>
  );
}
