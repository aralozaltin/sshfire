use serde::Serialize;

pub const PROBE_COMMAND: &str = "head -n1 /proc/stat; echo ---; grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree):' /proc/meminfo; echo ---; cat /proc/loadavg; echo ---; cat /proc/uptime; echo ---; cat /proc/net/dev; echo ---; df -P / | tail -n1";

#[derive(Debug, Clone, PartialEq)]
pub struct RawSample {
    pub cpu_busy: u64,
    pub cpu_total: u64,
    pub mem_total: u64,
    pub mem_available: u64,
    pub swap_total: u64,
    pub swap_free: u64,
    pub load: [f32; 3],
    pub uptime_secs: u64,
    pub net_rx: u64,
    pub net_tx: u64,
    pub disk_total: u64,
    pub disk_used: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub cpu_percent: Option<f32>,
    pub mem_used: u64,
    pub mem_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub load: [f32; 3],
    pub uptime_secs: u64,
    pub net_rx_bps: Option<u64>,
    pub net_tx_bps: Option<u64>,
}

fn kib(text: &str, key: &str) -> Option<u64> {
    let line = text.lines().find(|l| l.starts_with(key))?;
    let value: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(value * 1024)
}

fn parse_cpu(line: &str) -> Option<(u64, u64)> {
    let mut parts = line.split_whitespace();
    if parts.next()? != "cpu" {
        return None;
    }
    let f: Vec<u64> = parts.take(8).map(|v| v.parse().ok()).collect::<Option<_>>()?;
    if f.len() < 4 {
        return None;
    }
    let total: u64 = f.iter().sum();
    let idle = f[3] + f.get(4).copied().unwrap_or(0);
    Some((total.saturating_sub(idle), total))
}

fn parse_net(text: &str) -> (u64, u64) {
    let (mut rx, mut tx) = (0u64, 0u64);
    for line in text.lines() {
        let Some((iface, rest)) = line.split_once(':') else { continue };
        if iface.trim() == "lo" {
            continue;
        }
        let cols: Vec<u64> = rest.split_whitespace().filter_map(|v| v.parse().ok()).collect();
        if cols.len() >= 9 {
            rx += cols[0];
            tx += cols[8];
        }
    }
    (rx, tx)
}

pub fn parse_sample(text: &str) -> Option<RawSample> {
    let sections: Vec<String> = text.split("\n---\n").map(|s| s.to_string()).collect();
    if sections.len() < 6 {
        return None;
    }
    let (cpu_busy, cpu_total) = parse_cpu(sections[0].lines().next()?)?;
    let mem = &sections[1];
    let mem_total = kib(mem, "MemTotal:")?;
    let mem_available = match kib(mem, "MemAvailable:") {
        Some(v) => v,
        None => kib(mem, "MemFree:")? + kib(mem, "Buffers:").unwrap_or(0) + kib(mem, "Cached:").unwrap_or(0),
    };
    let swap_total = kib(mem, "SwapTotal:").unwrap_or(0);
    let swap_free = kib(mem, "SwapFree:").unwrap_or(0);
    let load: Vec<f32> = sections[2].split_whitespace().take(3).filter_map(|v| v.parse().ok()).collect();
    if load.len() < 3 {
        return None;
    }
    let uptime_secs = sections[3].split_whitespace().next()?.parse::<f64>().ok()? as u64;
    let (net_rx, net_tx) = parse_net(&sections[4]);
    let df: Vec<&str> = sections[5].split_whitespace().collect();
    if df.len() < 4 {
        return None;
    }
    let disk_total = df[1].parse::<u64>().ok()? * 1024;
    let disk_used = df[2].parse::<u64>().ok()? * 1024;
    Some(RawSample {
        cpu_busy,
        cpu_total,
        mem_total,
        mem_available,
        swap_total,
        swap_free,
        load: [load[0], load[1], load[2]],
        uptime_secs,
        net_rx,
        net_tx,
        disk_total,
        disk_used,
    })
}

fn rate(prev: u64, cur: u64, dt: f32) -> Option<u64> {
    if dt <= 0.0 || cur < prev {
        return None;
    }
    Some(((cur - prev) as f64 / dt as f64) as u64)
}

pub fn compute(prev: Option<&RawSample>, cur: &RawSample, dt_secs: f32) -> Metrics {
    let cpu_percent = prev.and_then(|p| {
        if dt_secs <= 0.0 || cur.cpu_total <= p.cpu_total || cur.cpu_busy < p.cpu_busy {
            return None;
        }
        let busy = (cur.cpu_busy - p.cpu_busy) as f32;
        let total = (cur.cpu_total - p.cpu_total) as f32;
        Some((busy / total * 100.0).clamp(0.0, 100.0))
    });
    Metrics {
        cpu_percent,
        mem_used: cur.mem_total.saturating_sub(cur.mem_available),
        mem_total: cur.mem_total,
        swap_used: cur.swap_total.saturating_sub(cur.swap_free),
        swap_total: cur.swap_total,
        disk_used: cur.disk_used,
        disk_total: cur.disk_total,
        load: cur.load,
        uptime_secs: cur.uptime_secs,
        net_rx_bps: prev.and_then(|p| rate(p.net_rx, cur.net_rx, dt_secs)),
        net_tx_bps: prev.and_then(|p| rate(p.net_tx, cur.net_tx, dt_secs)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_1: &str = "cpu  6118 0 4171 2618537 1031 0 2526 0 0 0
---
MemTotal:        8126756 kB
MemFree:         6843644 kB
MemAvailable:    7456740 kB
Buffers:          281288 kB
Cached:           473608 kB
SwapTotal:       1048572 kB
SwapFree:        1048572 kB
---
0.22 0.11 0.08 1/319 428
---
3293.67 26185.40
---
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compress
    lo:     530       7    0    0    0     0          0         0      530       7    0    0    0     0       0         0
  eth0: 3962012   58472    0    0    0     0          0         0 308514714   81499    0    0    0     0       0         0
 wlan0: 1000   10    0    0    0     0          0         0 2000   20    0    0    0     0       0         0
---
overlay          234464232 9991024 212490312       5% /
";

    // 2 saniye sonra: cpu busy +100, total +900; eth0 rx +2000, tx +4000; wlan0 rx +0, tx +1000
    const SAMPLE_2: &str = "cpu  6168 0 4221 2619337 1031 0 2526 0 0 0
---
MemTotal:        8126756 kB
MemFree:         6843644 kB
MemAvailable:    7456740 kB
Buffers:          281288 kB
Cached:           473608 kB
SwapTotal:       1048572 kB
SwapFree:        1000000 kB
---
0.30 0.12 0.08 1/319 428
---
3295.67 26187.40
---
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compress
    lo:     999       9    0    0    0     0          0         0      999       9    0    0    0     0       0         0
  eth0: 3964012   58480    0    0    0     0          0         0 308518714   81510    0    0    0     0       0         0
 wlan0: 1000   10    0    0    0     0          0         0 3000   30    0    0    0     0       0         0
---
overlay          234464232 9991024 212490312       5% /
";

    #[test]
    fn parses_meminfo_into_used_and_total_bytes() {
        let s = parse_sample(SAMPLE_1).unwrap();
        assert_eq!(s.mem_total, 8126756 * 1024);
        assert_eq!(s.mem_available, 7456740 * 1024);
        let m = compute(None, &s, 2.0);
        assert_eq!(m.mem_used, (8126756 - 7456740) * 1024);
        assert_eq!(m.swap_total, 1048572 * 1024);
        assert_eq!(m.swap_used, 0);
    }

    #[test]
    fn parses_loadavg_uptime_and_disk() {
        let s = parse_sample(SAMPLE_1).unwrap();
        assert_eq!(s.load, [0.22, 0.11, 0.08]);
        assert_eq!(s.uptime_secs, 3293);
        assert_eq!(s.disk_total, 234464232 * 1024);
        assert_eq!(s.disk_used, 9991024 * 1024);
    }

    #[test]
    fn cpu_percent_is_none_on_first_sample_then_delta_based() {
        let a = parse_sample(SAMPLE_1).unwrap();
        let b = parse_sample(SAMPLE_2).unwrap();
        assert_eq!(compute(None, &a, 2.0).cpu_percent, None);
        let pct = compute(Some(&a), &b, 2.0).cpu_percent.unwrap();
        assert!((pct - 11.111).abs() < 0.01, "got {pct}");
    }

    #[test]
    fn net_rates_exclude_loopback_and_use_dt() {
        let a = parse_sample(SAMPLE_1).unwrap();
        let b = parse_sample(SAMPLE_2).unwrap();
        let m = compute(Some(&a), &b, 2.0);
        assert_eq!(m.net_rx_bps, Some(1000));
        assert_eq!(m.net_tx_bps, Some(2500));
        assert_eq!(compute(None, &b, 2.0).net_rx_bps, None);
    }

    #[test]
    fn counter_reset_or_zero_dt_yields_none_not_panic() {
        let a = parse_sample(SAMPLE_1).unwrap();
        let b = parse_sample(SAMPLE_2).unwrap();
        let m = compute(Some(&b), &a, 2.0);
        assert_eq!(m.cpu_percent, None);
        assert_eq!(m.net_rx_bps, None);
        let m = compute(Some(&a), &b, 0.0);
        assert_eq!(m.net_rx_bps, None);
        assert_eq!(m.cpu_percent, None);
    }

    #[test]
    fn falls_back_to_free_buffers_cached_without_memavailable() {
        let text = SAMPLE_1.replace("MemAvailable:    7456740 kB\n", "");
        let s = parse_sample(&text).unwrap();
        assert_eq!(s.mem_available, (6843644 + 281288 + 473608) * 1024);
    }

    #[test]
    fn garbage_or_empty_text_returns_none() {
        assert!(parse_sample("").is_none());
        assert!(parse_sample("command not found").is_none());
        assert!(parse_sample("---\n---\n---\n---\n---\n").is_none());
        assert!(parse_sample("cpu  1 2\n---\nMemTotal: x kB\n---\n").is_none());
    }
}
