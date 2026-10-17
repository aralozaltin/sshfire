const AUTO_KEY = "ssh-istemci.autoUpdate";
const LAST_KEY = "ssh-istemci.lastUpdateCheck";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function loadAutoUpdate(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveAutoUpdate(on: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, String(on));
  } catch {
    // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur.
  }
}

export function loadLastCheck(): number | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveLastCheck(ms: number): void {
  try {
    localStorage.setItem(LAST_KEY, String(ms));
  } catch {
    // Zaman damgası kaydedilemezse bir sonraki açılışta yeniden denenir.
  }
}

/** Otomatik denetim açıksa ve son denetimden beş dakika geçtiyse (ya da saat geriye alındıysa) true. */
export function shouldCheckNow(auto: boolean, last: number | null, now: number, intervalMs = CHECK_INTERVAL_MS): boolean {
  if (!auto) return false;
  if (last == null || last > now) return true;
  return now - last >= intervalMs;
}
