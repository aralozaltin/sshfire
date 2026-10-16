export const DEFAULT_SIDEBAR_WIDTH = 430;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 600;

const KEY = "ssh-istemci.sidebarWidth";

export function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(w)));
}

export function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw == null ? DEFAULT_SIDEBAR_WIDTH : clampWidth(Number(raw));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function saveSidebarWidth(w: number): void {
  try {
    localStorage.setItem(KEY, String(clampWidth(w)));
  } catch {
    // Depolama kapalıysa genişlik yalnızca bu oturumda geçerli olur.
  }
}
