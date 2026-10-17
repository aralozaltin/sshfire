import { useCallback, useEffect, useState } from "react";
import { errorText, useT } from "../i18n";

export interface KnownHost {
  host: string;
  port: number;
  fingerprint: string;
}

export interface KnownHostsDialogProps {
  load: () => Promise<KnownHost[]>;
  onRemove: (host: string, port: number) => Promise<boolean>;
  onClose: () => void;
}

export function KnownHostsDialog({ load, onRemove, onClose }: KnownHostsDialogProps) {
  const t = useT();
  const k = t.knownHosts;
  const [hosts, setHosts] = useState<KnownHost[] | null>(null);
  const [confirming, setConfirming] = useState<KnownHost | null>(null);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    try {
      setHosts(await load());
    } catch (e) {
      setError(e);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function forget(h: KnownHost) {
    setConfirming(null);
    try {
      await onRemove(h.host, h.port);
      await refresh();
    } catch (e) {
      setError(e);
    }
  }

  const label = (h: KnownHost) => (h.port === 22 ? h.host : `${h.host}:${h.port}`);

  return (
    <div role="dialog" aria-label={k.title} className="hostkey-dialog known-hosts">
      <h2>{k.title}</h2>
      <p>{k.hint}</p>
      {error != null && <div role="alert" className="banner banner--error">{errorText(t, error)}</div>}
      {hosts && hosts.length === 0 && <p className="files__hint">{k.empty}</p>}
      <ul className="known-hosts__list">
        {(hosts ?? []).map((h) => (
          <li key={`${h.host}:${h.port}`}>
            <span className="known-hosts__host">{label(h)}</span>
            <code className="known-hosts__fp">{h.fingerprint}</code>
            <button type="button" aria-label={`${label(h)} ${k.forget.toLowerCase()}`} onClick={() => setConfirming(h)}>{k.forget}</button>
          </li>
        ))}
      </ul>
      <div className="hostkey-dialog__actions">
        <button type="button" autoFocus onClick={onClose}>{t.editor.close}</button>
      </div>
      {confirming && (
        <div className="overlay">
          <div role="alertdialog" aria-modal="true" aria-label={k.confirmTitle} className="hostkey-dialog">
            <h2>{k.confirmTitle}</h2>
            <p>{k.confirmBody(label(confirming))}</p>
            <div className="hostkey-dialog__actions">
              <button type="button" autoFocus onClick={() => setConfirming(null)}>{k.cancel}</button>
              <button type="button" onClick={() => void forget(confirming)}>{k.forget}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
