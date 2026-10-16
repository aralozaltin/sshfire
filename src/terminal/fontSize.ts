export const DEFAULT_FONT_SIZE = 13;
const MIN = 8;
const MAX = 32;
const KEY = "ssh-istemci.fontSize";

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX, Math.max(MIN, Math.round(n)));
}

export function stepFontSize(current: number, direction: "in" | "out" | "reset"): number {
  if (direction === "reset") return DEFAULT_FONT_SIZE;
  return clampFontSize(current + (direction === "in" ? 1 : -1));
}

export function loadFontSize(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? DEFAULT_FONT_SIZE : clampFontSize(Number(raw));
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function saveFontSize(n: number): void {
  try {
    localStorage.setItem(KEY, String(clampFontSize(n)));
  } catch {
    // Depolama kapalıysa boyut yalnızca bu oturumda geçerli olur.
  }
}
