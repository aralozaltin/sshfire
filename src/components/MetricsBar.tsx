import { useT } from "../i18n";
import { formatSize } from "../files/format";
import { formatRate, formatUptime, level } from "../metrics/format";
import type { Metrics } from "../metrics/types";

const DASH = "—";

function pct(used: number, total: number): number | null {
  return total > 0 ? (used / total) * 100 : null;
}

const barWidth = (p: number | null) => `${Math.min(100, Math.max(0, Math.round(p ?? 0)))}%`;

function Meter({ label, percent, children }: { label: string; percent: number | null; children: React.ReactNode }) {
  return (
    <span className={`metric metric--${level(percent)}`} aria-label={label}>
      <span className="metric__label">{label}</span>
      <span className="metric__bar" aria-hidden="true">
        <span className="metric__fill" style={{ width: barWidth(percent) }} />
      </span>
      <span className="metric__value">{children}</span>
    </span>
  );
}

function Plain({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="metric" aria-label={label}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{children}</span>
    </span>
  );
}

export function MetricsBar({ metrics }: { metrics: Metrics | null }) {
  const t = useT();
  const m = metrics;
  const cpu = m?.cpuPercent ?? null;
  const memPct = m ? pct(m.memUsed, m.memTotal) : null;
  const diskPct = m ? pct(m.diskUsed, m.diskTotal) : null;
  const hasNet = m !== null && m.netRxBps != null && m.netTxBps != null;
  return (
    <div className="metrics" role="group">
      <Meter label={t.metrics.cpu} percent={cpu}>
        {cpu == null ? DASH : `${Math.round(cpu)}%`}
      </Meter>
      <Meter label={t.metrics.memory} percent={memPct}>
        {m ? `${formatSize(m.memUsed)} / ${formatSize(m.memTotal)}` : DASH}
      </Meter>
      <Meter label={t.metrics.disk} percent={diskPct}>
        {m ? `${formatSize(m.diskUsed)} / ${formatSize(m.diskTotal)}` : DASH}
      </Meter>
      <Plain label={t.metrics.load}>{m ? m.load.map((v) => v.toFixed(2)).join(" ") : DASH}</Plain>
      <Plain label={t.metrics.uptime}>{m ? formatUptime(m.uptimeSecs, t) : DASH}</Plain>
      <Plain label={t.metrics.network}>
        {hasNet && m ? (
          <>
            <span className="metric__down">{`↓ ${formatRate(m.netRxBps ?? 0)}`}</span>{" "}
            <span className="metric__up">{`↑ ${formatRate(m.netTxBps ?? 0)}`}</span>
          </>
        ) : (
          DASH
        )}
      </Plain>
    </div>
  );
}
