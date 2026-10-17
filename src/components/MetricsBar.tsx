import { useT } from "../i18n";
import { formatSize } from "../files/format";
import { formatRate, formatUptime, level } from "../metrics/format";
import type { Metrics } from "../metrics/types";

const DASH = "—";

function pct(used: number, total: number): number | null {
  return total > 0 ? (used / total) * 100 : null;
}

const barWidth = (p: number | null) => `${Math.min(100, Math.max(0, Math.round(p ?? 0)))}%`;

function Meter({ label, percent, tip, children }: { label: string; percent: number | null; tip?: string; children: React.ReactNode }) {
  return (
    <span className={`metric metric--${level(percent)}`} aria-label={label} title={tip}>
      <span className="metric__label">{label}</span>
      <span className="metric__bar" aria-hidden="true">
        <span className="metric__fill" style={{ width: barWidth(percent) }} />
      </span>
      <span className="metric__value">{children}</span>
    </span>
  );
}

function Plain({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <span className="metric" aria-label={label} title={tip}>
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
  const k = t.metrics.tip;
  const whole = (v: number | null) => Math.round(v ?? 0);
  const tips = m && {
    cpu: cpu == null ? k.waiting(t.metrics.cpu) : k.cpu(whole(cpu)),
    memory: `${k.memory(formatSize(m.memUsed), formatSize(m.memTotal), whole(memPct), formatSize(Math.max(0, m.memTotal - m.memUsed)))}. ${m.swapTotal > 0 ? k.swap(formatSize(m.swapUsed), formatSize(m.swapTotal)) : k.noSwap}`,
    disk: k.disk(formatSize(m.diskUsed), formatSize(m.diskTotal), whole(diskPct), formatSize(Math.max(0, m.diskTotal - m.diskUsed))),
    load: k.load(...(m.load.map((v) => v.toFixed(2)) as [string, string, string])),
    uptime: k.uptime(Math.floor(m.uptimeSecs / 86400), Math.floor((m.uptimeSecs % 86400) / 3600), Math.floor((m.uptimeSecs % 3600) / 60)),
    network: hasNet ? k.network(formatRate(m.netRxBps ?? 0), formatRate(m.netTxBps ?? 0)) : k.waiting(t.metrics.network),
  };
  return (
    <div className="metrics" role="group">
      <Meter label={t.metrics.cpu} percent={cpu} tip={tips?.cpu}>
        {cpu == null ? DASH : `${Math.round(cpu)}%`}
      </Meter>
      <Meter label={t.metrics.memory} percent={memPct} tip={tips?.memory}>
        {m ? `${formatSize(m.memUsed)} / ${formatSize(m.memTotal)}` : DASH}
      </Meter>
      <Meter label={t.metrics.disk} percent={diskPct} tip={tips?.disk}>
        {m ? `${formatSize(m.diskUsed)} / ${formatSize(m.diskTotal)}` : DASH}
      </Meter>
      <Plain label={t.metrics.load} tip={tips?.load}>{m ? m.load.map((v) => v.toFixed(2)).join(" ") : DASH}</Plain>
      <Plain label={t.metrics.uptime} tip={tips?.uptime}>{m ? formatUptime(m.uptimeSecs, t) : DASH}</Plain>
      <Plain label={t.metrics.network} tip={tips?.network}>
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
