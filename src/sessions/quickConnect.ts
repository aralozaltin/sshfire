export interface QuickTarget {
  user: string;
  host: string;
  port: number;
}

const validPort = (n: number) => Number.isInteger(n) && n >= 1 && n <= 65535;

/**
 * `kullanıcı@sunucu[:port]` ya da yapıştırılmış bir `ssh [-p port] kullanıcı@sunucu` komutunu çözer.
 * IPv6 için köşeli parantez kullanılır (`user@[::1]:22`). Geçersizse `null`.
 */
export function parseTarget(input: string): QuickTarget | null {
  let text = input.trim();
  let port: number | null = null;
  const command = /^ssh\s+(?:-p\s*(\d+)\s+)?(.+)$/i.exec(text);
  if (command) {
    if (command[1]) port = Number(command[1]);
    text = command[2].trim();
  }
  const at = text.indexOf("@");
  if (at <= 0 || text.indexOf("@", at + 1) !== -1) return null;
  const user = text.slice(0, at);
  let rest = text.slice(at + 1);
  if (/\s/.test(user) || /\s/.test(rest)) return null;
  let host: string;
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest);
  if (bracket) {
    host = bracket[1];
    if (bracket[2]) port = Number(bracket[2]);
  } else {
    const colon = rest.lastIndexOf(":");
    if (colon === -1) host = rest;
    else {
      host = rest.slice(0, colon);
      rest = rest.slice(colon + 1);
      if (!/^\d+$/.test(rest)) return null;
      port = Number(rest);
    }
  }
  if (!host || !user) return null;
  const finalPort = port ?? 22;
  if (!validPort(finalPort)) return null;
  return { user, host, port: finalPort };
}
