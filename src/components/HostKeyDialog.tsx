import { tr } from "../locales/tr";

export interface HostKeyRequest {
  requestId: string;
  host: string;
  port: number;
  fingerprint: string;
}

export interface HostKeyDialogProps {
  request: HostKeyRequest;
  onAnswer: (requestId: string, trust: boolean) => void;
}

export function HostKeyDialog({ request, onAnswer }: HostKeyDialogProps) {
  const { requestId, host, port, fingerprint } = request;
  return (
    <div role="alertdialog" aria-modal="true" aria-label={tr.hostKey.title} className="hostkey-dialog">
      <h2>{tr.hostKey.title}</h2>
      <p>{tr.hostKey.body}</p>
      <p className="hostkey-dialog__host">{host}:{port}</p>
      <code className="hostkey-dialog__fp">{fingerprint}</code>
      <div className="hostkey-dialog__actions">
        <button type="button" autoFocus onClick={() => onAnswer(requestId, false)}>{tr.hostKey.reject}</button>
        <button type="button" onClick={() => onAnswer(requestId, true)}>{tr.hostKey.trust}</button>
      </div>
    </div>
  );
}
