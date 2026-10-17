const KEY = "ssh-istemci.idleMinutes";

/** Boşta kalınca bağlantıyı kesme süresi seçenekleri (dakika); 0 = hiçbir zaman. */
export const IDLE_CHOICES = [0, 15, 30, 60, 120] as const;

export function loadIdleMinutes(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (IDLE_CHOICES as readonly number[]).includes(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveIdleMinutes(minutes: number): void {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    // Depolama kapalıysa seçim yalnızca bu oturumda geçerli olur.
  }
}
