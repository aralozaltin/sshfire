import { useState, type FormEvent } from "react";
import type { Auth, NewSession, Session } from "../types";
import { useT } from "../i18n";

export interface ServerDialogProps {
  initial?: Session;
  others?: Session[];
  onSave: (session: NewSession | Session, password?: string) => void;
  onCancel: () => void;
}

const NEW_FOLDER = "__new__";

const COLORS = [
  ["#ef4444", "colorRed"],
  ["#f97316", "colorOrange"],
  ["#eab308", "colorYellow"],
  ["#22c55e", "colorGreen"],
  ["#3b82f6", "colorBlue"],
  ["#a855f7", "colorPurple"],
] as const;

export function ServerDialog({ initial, others = [], onSave, onCancel }: ServerDialogProps) {
  const t = useT();
  const d = t.dialog;
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(String(initial?.port ?? 22));
  const [user, setUser] = useState(initial?.user ?? "");
  const folders = [...new Set([...others.map((o) => o.folder), initial?.folder].filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [newFolder, setNewFolder] = useState(false);
  const [authType, setAuthType] = useState<Auth["type"]>(initial?.auth.type ?? "password");
  const [keyPath, setKeyPath] = useState(initial?.auth.type === "key_file" ? initial.auth.path : "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [startup, setStartup] = useState(initial?.startup ?? "");
  const [jump, setJump] = useState(initial?.jump ?? "");
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

    const auth: Auth =
      authType === "key_file" ? { type: "key_file", path: keyPath.trim() } : authType === "agent" ? { type: "agent" } : authType === "interactive" ? { type: "interactive" } : { type: "password" };
    const base: NewSession = {
      name: name.trim(),
      host: host.trim(),
      port: portNum,
      user: user.trim(),
      folder: folder.trim() ? folder.trim() : null,
      auth,
      ...(initial?.tunnels ? { tunnels: initial.tunnels } : {}),
      ...(jump ? { jump } : initial?.jump ? { jump: null } : {}),
      ...(color ? { color } : initial?.color ? { color: null } : {}),
      ...(startup.trim() ? { startup: startup.trim() } : initial?.startup ? { startup: null } : {}),
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
      {folders.length === 0 ? (
        <label>{d.folder}<input value={folder} onChange={(e) => setFolder(e.target.value)} /></label>
      ) : (
        <>
          <label>
            {d.folder}
            <select
              aria-label={d.folder}
              value={newFolder ? NEW_FOLDER : folder}
              onChange={(e) => {
                const v = e.target.value;
                setNewFolder(v === NEW_FOLDER);
                setFolder(v === NEW_FOLDER ? "" : v);
              }}
            >
              <option value="">{d.folderNone}</option>
              {folders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              <option value={NEW_FOLDER}>{d.folderNew}</option>
            </select>
          </label>
          {newFolder && (
            <label>
              {d.folderName}
              <input autoFocus value={folder} onChange={(e) => setFolder(e.target.value)} />
            </label>
          )}
        </>
      )}
      <label>
        {d.auth}
        <select value={authType} onChange={(e) => setAuthType(e.target.value as Auth["type"])}>
          <option value="password">{d.authPassword}</option>
          <option value="key_file">{d.authKey}</option>
          <option value="agent">{d.authAgent}</option>
          <option value="interactive">{d.authInteractive}</option>
        </select>
      </label>
      <label>
        {d.jump}
        <select value={jump} onChange={(e) => setJump(e.target.value)}>
          <option value="">{d.jumpNone}</option>
          {others
            .filter((o) => o.id !== initial?.id)
            .map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
        </select>
      </label>
      <label>
        {d.startup}
        <input value={startup} onChange={(e) => setStartup(e.target.value)} placeholder="cd /var/log" />
      </label>
      <fieldset className="color-picker">
        <legend>{d.color}</legend>
        {[["", d.colorNone], ...COLORS.map(([hex, key]) => [hex, d[key]])].map(([hex, label]) => (
          <label key={hex || "none"} title={label}>
            <input type="radio" name="color" aria-label={label} checked={color === hex} onChange={() => setColor(hex)} />
            <span className="color-picker__swatch" style={hex ? { backgroundColor: hex } : undefined} />
          </label>
        ))}
      </fieldset>
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
      ) : authType === "key_file" ? (
        <>
          <label>{d.keyPath}<input value={keyPath} onChange={(e) => setKeyPath(e.target.value)} /></label>
          {errors.keyPath && <p role="alert">{errors.keyPath}</p>}
        </>
      ) : null}
      <div className="server-dialog__actions">
        <button type="button" onClick={onCancel}>{d.cancel}</button>
        <button type="submit">{d.save}</button>
      </div>
    </form>
  );
}
