import { useT } from "../i18n";
import { formatSize } from "../files/format";
import { formatRate, formatUptime, level } from "../metrics/format";
import type { Metrics } from "../metrics/types";

const DASH = "—";

function pct(used: number, total: number): number | null {
  return total > 0 ? (used / total) * 100 : null;
}

export function MetricsBar({ metrics }: { metrics: Metrics | null }) {
  const t = useT();
  const m = metrics;
  const cls = (p: number | null) => `metric metric--${level(p)}`;
  const memPct = m ? pct(m.memUsed, m.memTotal) : null;
  const diskPct = m ? pct(m.diskUsed, m.diskTotal) : null;
  const cpu = m?.cpuPercent ?? null;
  const net = m && m.netRxBps != null && m.netTxBps != null ? `↓ ${formatRate(m.netRxBps)}  ↑ ${formatRate(m.netTxBps)}` : DASH;
  return (
    <div className="metrics" role="group">
      <span className={cls(cpu)} aria-label={t.metrics.cpu}>
        {t.metrics.cpu} {cpu == null ? DASH : `${Math.round(cpu)}%`}
      </span>
      <span className={cls(memPct)} aria-label={t.metrics.memory}>
        {t.metrics.memory} {m ? `${formatSize(m.memUsed)} / ${formatSize(m.memTotal)}` : DASH}
      </span>
      <span className={cls(diskPct)} aria-label={t.metrics.disk}>
        {t.metrics.disk} {m ? `${formatSize(m.diskUsed)} / ${formatSize(m.diskTotal)}` : DASH}
      </span>
      <span className="metric" aria-label={t.metrics.load}>
        {t.metrics.load} {m ? m.load.map((v) => v.toFixed(2)).join(" ") : DASH}
      </span>
      <span className="metric" aria-label={t.metrics.uptime}>
        {t.metrics.uptime} {m ? formatUptime(m.uptimeSecs, t) : DASH}
      </span>
      <span className="metric" aria-label={t.metrics.network}>
        {t.metrics.network} {net}
      </span>
    </div>
  );
}
