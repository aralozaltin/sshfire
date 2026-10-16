export type Auth = { type: "password" } | { type: "key_file"; path: string } | { type: "agent" } | { type: "interactive" };

export type TunnelSpec =
  | { kind: "local"; listen_port: number; dest_host: string; dest_port: number }
  | { kind: "dynamic"; listen_port: number }
  | { kind: "remote"; listen_port: number; dest_host: string; dest_port: number };

export interface RunningTunnel {
  id: string;
  spec: TunnelSpec;
  localPort: number;
  connections: number;
}

export interface NewSession {
  name: string;
  host: string;
  port: number;
  user: string;
  folder: string | null;
  auth: Auth;
  tunnels?: TunnelSpec[];
  jump?: string | null;
  startup?: string | null;
  color?: string | null;
}

export interface Session extends NewSession {
  id: string;
}

/** Yerel terminal sekmesi için sahte oturum kimliği (kayıtlı bir sunucuya karşılık gelmez). */
export const LOCAL_SESSION_ID = "__local__";
