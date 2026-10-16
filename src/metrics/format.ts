import type { Messages } from "../locales/tr";
import { formatSize } from "../files/format";

export function formatUptime(secs: number, t: Messages): string {
  const u = t.metrics.units;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}${u.d} ${h}${u.h}`;
  if (h > 0) return `${h}${u.h} ${m}${u.m}`;
  return `${m}${u.m}`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatSize(bytesPerSec)}/s`;
}

export function level(percent: number | null): "ok" | "warn" | "crit" {
  if (percent == null) return "ok";
  if (percent >= 90) return "crit";
  if (percent >= 80) return "warn";
  return "ok";
}
