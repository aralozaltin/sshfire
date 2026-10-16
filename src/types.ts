export type Auth = { type: "password" } | { type: "key_file"; path: string };

export interface NewSession {
  name: string;
  host: string;
  port: number;
  user: string;
  folder: string | null;
  auth: Auth;
}

export interface Session extends NewSession {
  id: string;
}
