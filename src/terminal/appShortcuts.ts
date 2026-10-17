export type AppKeyAction = { type: "newLocal" } | { type: "close" } | { type: "next" } | { type: "prev" } | { type: "goto"; index: number };

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Sekme kısayolları. macOS'ta ⌘, diğerlerinde Ctrl+Shift/Alt: düz Ctrl+W/T kabuğa (readline) aittir.
 */
export function classifyAppKey(e: KeyLike, isMac: boolean): AppKeyAction | null {
  const key = e.key.toLowerCase();
  const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : null;
  if (isMac) {
    if (!e.metaKey || e.ctrlKey || e.altKey) return null;
    if (!e.shiftKey && key === "t") return { type: "newLocal" };
    if (!e.shiftKey && key === "w") return { type: "close" };
    if (!e.shiftKey && digit !== null) return { type: "goto", index: digit };
    if (e.shiftKey && (key === "}" || key === "]")) return { type: "next" };
    if (e.shiftKey && (key === "{" || key === "[")) return { type: "prev" };
    return null;
  }
  if (e.metaKey) return null;
  if (e.ctrlKey && !e.altKey) {
    if (e.shiftKey && key === "t") return { type: "newLocal" };
    if (e.shiftKey && key === "w") return { type: "close" };
    if (key === "tab") return { type: e.shiftKey ? "prev" : "next" };
    if (!e.shiftKey && key === "pagedown") return { type: "next" };
    if (!e.shiftKey && key === "pageup") return { type: "prev" };
    return null;
  }
  if (e.altKey && !e.ctrlKey && !e.shiftKey && digit !== null) return { type: "goto", index: digit };
  return null;
}
