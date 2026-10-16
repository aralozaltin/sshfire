export const DEFAULT_COLUMNS = [280, 80, 150, 100];
export const MIN_COLUMN = 48;

const KEY = "ssh-istemci.fileColumns";

export function resizeColumn(widths: number[], index: number, delta: number): number[] {
  return widths.map((w, i) => (i === index ? Math.max(MIN_COLUMN, Math.round(w + delta)) : w));
}

export function loadColumns(): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(parsed) && parsed.length === DEFAULT_COLUMNS.length && parsed.every((n) => typeof n === "number" && n >= MIN_COLUMN)) {
      return parsed as number[];
    }
  } catch {
    // Bozuk ya da erişilemeyen depolama: varsayılanlara dön.
  }
  return [...DEFAULT_COLUMNS];
}

export function saveColumns(widths: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(widths));
  } catch {
    // Depolama kapalıysa genişlikler yalnızca bu oturumda geçerli olur.
  }
}
