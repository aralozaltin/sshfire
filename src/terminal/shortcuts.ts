export type KeyAction = "copy" | "paste" | "find" | "zoom-in" | "zoom-out" | "zoom-reset";

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Terminalin yakaladığı kısayolları sınıflar. Ctrl+C gibi kabuğa gitmesi gereken tuşlara dokunmaz:
 * Windows/Linux'ta Ctrl+C yalnızca seçim varken kopyalar, aksi halde programı kesmek için geçer.
 */
export function classifyKey(e: KeyLike, hasSelection: boolean, isMac: boolean): KeyAction | null {
  const key = e.key.toLowerCase();
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod) return null;
  if (key === "=" || key === "+") return "zoom-in";
  if (key === "-") return "zoom-out";
  if (key === "0") return "zoom-reset";
  if (isMac) {
    if (key === "c") return hasSelection ? "copy" : null;
    if (key === "v") return "paste";
    if (key === "f") return "find";
    return null;
  }
  if (e.shiftKey) {
    if (key === "c") return "copy";
    if (key === "v") return "paste";
    if (key === "f") return "find";
    return null;
  }
  if (key === "c") return hasSelection ? "copy" : null;
  return null;
}
