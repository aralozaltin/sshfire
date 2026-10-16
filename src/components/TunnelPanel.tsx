import { useState } from "react";
import { useT } from "../i18n";
import type { RunningTunnel, TunnelSpec } from "../types";

export interface TunnelPanelProps {
  tunnels: TunnelSpec[];
  running: RunningTunnel[];
  connected: boolean;
  hasSession: boolean;
  onStart: (spec: TunnelSpec) => void;
  onStop: (id: string) => void;
  onChange: (specs: TunnelSpec[]) => void;
}

const same = (a: TunnelSpec, b: TunnelSpec) => JSON.stringify(a) === JSON.stringify(b);
const validPort = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535;

export function TunnelPanel({ tunnels, running, connected, hasSession, onStart, onStop, onChange }: TunnelPanelProps) {
  const t = useT();
  const tn = t.tunnels;
  const [kind, setKind] = useState<TunnelSpec["kind"]>("local");
  const [listen, setListen] = useState("");
  const [destHost, setDestHost] = useState("");
  const [destPort, setDestPort] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const describe = (s: TunnelSpec) =>
    s.kind === "local" ? tn.describeLocal(s.listen_port, s.dest_host, s.dest_port)
    : s.kind === "remote" ? tn.describeRemote(s.listen_port, s.dest_host, s.dest_port)
    : tn.describeDynamic(s.listen_port);
  const runningFor = (s: TunnelSpec) => running.find((r) => same(r.spec, s));

  function add() {
    const next: string[] = [];
    if (!validPort(listen)) next.push(tn.errPort);
    if (kind !== "dynamic") {
      if (!destHost.trim()) next.push(tn.errDestHost);
      if (!validPort(destPort)) next.push(tn.errDestPort);
    }
    setErrors(next);
    if (next.length > 0) return;
    const spec: TunnelSpec =
      kind === "dynamic"
        ? { kind: "dynamic", listen_port: Number(listen) }
        : { kind, listen_port: Number(listen), dest_host: destHost.trim(), dest_port: Number(destPort) };
    onChange([...tunnels, spec]);
    setListen("");
    setDestHost("");
    setDestPort("");
  }

  function remove(spec: TunnelSpec) {
    const r = runningFor(spec);
    if (r) onStop(r.id);
    onChange(tunnels.filter((x) => !same(x, spec)));
  }

  return (
    <div className="tunnels">
      {!connected && <p className="files__hint">{tn.needConnection}</p>}
      {tunnels.length === 0 && hasSession && <p className="files__hint">{tn.empty}</p>}
      <ul className="tunnels__list">
        {tunnels.map((spec) => {
          const r = runningFor(spec);
          return (
            <li key={JSON.stringify(spec)}>
              <span className="tunnels__desc">{describe(spec)}</span>
              <span className="tunnels__state">{r ? tn.runningWith(r.connections) : tn.stopped}</span>
              {r ? (
                <button type="button" onClick={() => onStop(r.id)}>{tn.stop}</button>
              ) : (
                <button type="button" disabled={!connected} onClick={() => onStart(spec)}>{tn.start}</button>
              )}
              <button type="button" onClick={() => remove(spec)}>{tn.remove}</button>
            </li>
          );
        })}
      </ul>
      {hasSession ? (
        <form
          className="tunnels__form"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label>
            {tn.kind}
            <select value={kind} onChange={(e) => setKind(e.target.value as TunnelSpec["kind"])}>
              <option value="local">{tn.kindLocal}</option>
              <option value="dynamic">{tn.kindDynamic}</option>
              <option value="remote">{tn.kindRemote}</option>
            </select>
          </label>
          <label>
            {kind === "remote" ? tn.remotePort : tn.listenPort}
            <input inputMode="numeric" value={listen} onChange={(e) => setListen(e.target.value)} />
          </label>
          {kind !== "dynamic" && (
            <>
              <label>
                {tn.destHost}
                <input value={destHost} onChange={(e) => setDestHost(e.target.value)} />
              </label>
              <label>
                {tn.destPort}
                <input inputMode="numeric" value={destPort} onChange={(e) => setDestPort(e.target.value)} />
              </label>
            </>
          )}
          {errors.map((m) => (
            <p key={m} role="alert" className="tunnels__error">{m}</p>
          ))}
          <button type="submit">{tn.add}</button>
        </form>
      ) : (
        <p className="files__hint">{tn.needSession}</p>
      )}
    </div>
  );
}
