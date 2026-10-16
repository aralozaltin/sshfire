export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatMode(mode: number): string {
  const bit = (mask: number, ch: string) => (mode & mask ? ch : "-");
  const exec = (xMask: number, specialMask: number, lower: string, upper: string) =>
    mode & specialMask ? (mode & xMask ? lower : upper) : bit(xMask, "x");
  return [
    bit(0o400, "r"), bit(0o200, "w"), exec(0o100, 0o4000, "s", "S"),
    bit(0o040, "r"), bit(0o020, "w"), exec(0o010, 0o2000, "s", "S"),
    bit(0o004, "r"), bit(0o002, "w"), exec(0o001, 0o1000, "t", "T"),
  ].join("");
}

export function formatOctal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

export function formatModified(unixSecs: number | null, locale: string): string {
  if (unixSecs == null) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(unixSecs * 1000));
}
