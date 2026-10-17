use vcore::metrics::{compute, parse_sample, Metrics, RawSample};

/// Bir yoklama sonucunu işler: ayrıştırılabilirse metrik döner ve `prev` güncellenir,
/// ayrıştırılamazsa (Linux olmayan sunucu, komut hatası) `None` döner ve `prev` sıfırlanır.
/// İki ölçüm arasındaki bekleme (ölçüm süresi buna eklenir; hızlar gerçek geçen süreyle hesaplanır).
pub const METRICS_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);

pub fn step(prev: &mut Option<RawSample>, probe_output: Option<&str>, dt_secs: f32) -> Option<Metrics> {
    let Some(sample) = probe_output.and_then(parse_sample) else {
        *prev = None;
        return None;
    };
    let metrics = compute(prev.as_ref(), &sample, dt_secs);
    *prev = Some(sample);
    Some(metrics)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(cpu_busy: u64, cpu_idle: u64) -> String {
        format!(
            "cpu  {cpu_busy} 0 0 {cpu_idle} 0 0 0 0 0 0\n---\nMemTotal: 1000 kB\nMemAvailable: 400 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n---\n0.1 0.2 0.3 1/2 3\n---\n100.0 50.0\n---\nInter-|a\n face |b\n  eth0: 10 0 0 0 0 0 0 0 20 0 0 0 0 0 0 0\n---\nfs 1000 250 750 25% /\n"
        )
    }

    fn text_net(rx: u64, tx: u64) -> String {
        text(100, 900).replace("eth0: 10 0 0 0 0 0 0 0 20", &format!("eth0: {rx} 0 0 0 0 0 0 0 {tx}"))
    }

    #[test]
    fn network_rates_follow_the_time_between_probes() {
        for (dt, expected_rx, expected_tx) in [(1.0_f32, 2000, 4000), (2.0, 1000, 2000)] {
            let mut prev = None;
            step(&mut prev, Some(&text_net(10, 20)), 0.0).unwrap();
            let second = step(&mut prev, Some(&text_net(2010, 4020)), dt).unwrap();
            assert_eq!(second.net_rx_bps, Some(expected_rx), "rx at dt={dt}");
            assert_eq!(second.net_tx_bps, Some(expected_tx), "tx at dt={dt}");
        }
    }

    #[test]
    fn the_probe_runs_once_a_second() {
        assert_eq!(METRICS_INTERVAL, std::time::Duration::from_secs(1));
    }

    #[test]
    fn first_sample_has_no_cpu_second_has_cpu() {
        let mut prev = None;
        let first = step(&mut prev, Some(&text(100, 900)), 2.0).unwrap();
        assert_eq!(first.cpu_percent, None);
        assert_eq!(first.mem_used, 600 * 1024);
        let second = step(&mut prev, Some(&text(200, 1800)), 2.0).unwrap();
        assert!((second.cpu_percent.unwrap() - 10.0).abs() < 0.01);
    }

    #[test]
    fn unparsable_output_gives_none_and_resets_the_baseline() {
        let mut prev = None;
        step(&mut prev, Some(&text(100, 900)), 2.0).unwrap();
        assert!(step(&mut prev, Some("sh: /proc/stat: not found"), 2.0).is_none());
        assert!(prev.is_none());
        let after = step(&mut prev, Some(&text(300, 2000)), 2.0).unwrap();
        assert_eq!(after.cpu_percent, None);
    }

    #[test]
    fn failed_probe_gives_none() {
        let mut prev = None;
        assert!(step(&mut prev, None, 2.0).is_none());
    }
}
