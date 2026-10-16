import { useState, type FormEvent } from "react";
import type { Auth, NewSession, Session } from "../types";
import { useT } from "../i18n";

export interface ServerDialogProps {
  initial?: Session;
  onSave: (session: NewSession | Session, password?: string) => void;
  onCancel: () => void;
}

export function ServerDialog({ initial, onSave, onCancel }: ServerDialogProps) {
  const t = useT();
  const d = t.dialog;
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 22));
  const [user, setUser] = useState(initial?.user ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [authType, setAuthType] = useState<Auth["type"]>(initial?.auth.type ?? "password");
  const [keyPath, setKeyPath] = useState(initial?.auth.type === "key_file" ? initial.auth.path : "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const portNum = Number(port);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = d.errName;
    if (!host.trim()) next.host = d.errHost;
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) next.port = d.errPort;
    if (!user.trim()) next.user = d.errUser;
    if (authType === "key_file" && !keyPath.trim()) next.keyPath = d.errKeyPath;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const auth: Auth = authType === "key_file" ? { type: "key_file", path: keyPath.trim() } : { type: "password" };
    const base: NewSession = {
      name: name.trim(),
      host: host.trim(),
      port: portNum,
      user: user.trim(),
      folder: folder.trim() ? folder.trim() : null,
      auth,
      ...(initial?.tunnels ? { tunnels: initial.tunnels } : {}),
    };
    const pw = authType === "password" && password ? password : undefined;
    onSave(initial ? { ...base, id: initial.id } : base, pw);
  }

  return (
    <form className="server-dialog" onSubmit={submit} noValidate aria-label={initial ? d.titleEdit : d.titleAdd}>
      <h2>{initial ? d.titleEdit : d.titleAdd}</h2>
      <label>{d.name}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      {errors.name && <p role="alert">{errors.name}</p>}
      <label>{d.host}<input value={host} onChange={(e) => setHost(e.target.value)} /></label>
      {errors.host && <p role="alert">{errors.host}</p>}
      <label>{d.port}<input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" /></label>
      {errors.port && <p role="alert">{errors.port}</p>}
      <label>{d.user}<input value={user} onChange={(e) => setUser(e.target.value)} /></label>
      {errors.user && <p role="alert">{errors.user}</p>}
      <label>{d.folder}<input value={folder} onChange={(e) => setFolder(e.target.value)} /></label>
      <label>
        {d.auth}
        <select value={authType} onChange={(e) => setAuthType(e.target.value as Auth["type"])}>
          <option value="password">{d.authPassword}</option>
          <option value="key_file">{d.authKey}</option>
        </select>
      </label>
      {authType === "password" ? (
        <label>
          {d.password}
          <input
            type="password"
            autoComplete="new-password"
            placeholder={initial ? d.passwordKeepHint : ""}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      ) : (
        <>
          <label>{d.keyPath}<input value={keyPath} onChange={(e) => setKeyPath(e.target.value)} /></label>
          {errors.keyPath && <p role="alert">{errors.keyPath}</p>}
        </>
      )}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{d.cancel}</button>
        <button type="submit">{d.save}</button>
      </div>
    </form>
  );
}
