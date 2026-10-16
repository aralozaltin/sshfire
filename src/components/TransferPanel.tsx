import { errorText, useT } from "../i18n";
import { percent, type TransferState } from "../files/transfers";

export interface TransferPanelProps {
  transfers: TransferState[];
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function TransferPanel({ transfers, onCancel, onDismiss }: TransferPanelProps) {
  const t = useT();
  if (transfers.length === 0) return null;
  return (
    <ul className="transfers" aria-label={t.transfer.panelLabel}>
      {transfers.map((tr) => {
        const pct = percent(tr);
        const verb = tr.direction === "upload" ? t.transfer.uploading : t.transfer.downloading;
        return (
          <li key={tr.id} className={`transfers__item transfers__item--${tr.state}`}>
            <div className="transfers__head">
              <span className="transfers__name" title={tr.name}>{tr.name}</span>
              {tr.state === "running" && <span className="transfers__pct">{t.transfer.percent(pct)}</span>}
              {tr.state === "running" ? (
                <button type="button" onClick={() => onCancel(tr.id)}>{t.transfer.cancel}</button>
              ) : (
                <button type="button" onClick={() => onDismiss(tr.id)}>{t.files.close}</button>
              )}
            </div>
            {tr.state === "running" && (
              <progress role="progressbar" aria-label={verb} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} value={pct} max={100} />
            )}
            {tr.state === "done" && <span className="transfers__note">{tr.localPath ?? t.transfer.done}</span>}
            {tr.state === "cancelled" && <span className="transfers__note">{t.transfer.cancelled}</span>}
            {tr.state === "error" && <span role="alert" className="transfers__note transfers__note--error">{errorText(t, tr.error)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
