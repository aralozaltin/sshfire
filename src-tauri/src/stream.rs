use std::sync::Mutex;
use tokio::sync::Notify;

pub const HIGH_WATER: usize = 1024 * 1024;
pub const LOW_WATER: usize = 256 * 1024;

struct State {
    unacked: usize,
    paused: bool,
}

pub struct Throttle {
    high: usize,
    low: usize,
    state: Mutex<State>,
    notify: Notify,
}

impl Throttle {
    pub fn new(high: usize, low: usize) -> Throttle {
        Throttle { high, low, state: Mutex::new(State { unacked: 0, paused: false }), notify: Notify::new() }
    }

    pub fn on_sent(&self, bytes: usize) {
        self.state.lock().unwrap().unacked += bytes;
    }

    pub fn ack(&self, bytes: usize) {
        let mut st = self.state.lock().unwrap();
        st.unacked = st.unacked.saturating_sub(bytes);
        if st.unacked <= self.low {
            drop(st);
            self.notify.notify_one();
        }
    }

    pub async fn wait_ready(&self) {
        loop {
            {
                let mut st = self.state.lock().unwrap();
                if st.paused && st.unacked <= self.low {
                    st.paused = false;
                } else if !st.paused && st.unacked >= self.high {
                    st.paused = true;
                }
                if !st.paused {
                    return;
                }
            }
            self.notify.notified().await;
        }
    }

    #[cfg(test)]
    pub fn unacked(&self) -> usize {
        self.state.lock().unwrap().unacked
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn ready_below_high_water() {
        let t = Throttle::new(100, 25);
        t.on_sent(99);
        tokio::time::timeout(Duration::from_millis(50), t.wait_ready()).await.expect("should be ready");
    }

    #[tokio::test]
    async fn reading_pauses_above_high_water() {
        let t = Throttle::new(100, 25);
        t.on_sent(100);
        let waited = tokio::time::timeout(Duration::from_millis(50), t.wait_ready()).await;
        assert!(waited.is_err(), "must block at high water");
    }

    #[tokio::test]
    async fn ack_below_low_water_resumes() {
        let t = Arc::new(Throttle::new(100, 25));
        t.on_sent(100);
        let waiter = tokio::spawn({
            let t = t.clone();
            async move { t.wait_ready().await }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        t.ack(50);
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(!waiter.is_finished(), "50 left is still above low water");
        t.ack(30);
        tokio::time::timeout(Duration::from_millis(200), waiter).await.expect("resumes").unwrap();
    }

    #[tokio::test]
    async fn ack_never_underflows() {
        let t = Throttle::new(100, 25);
        t.on_sent(10);
        t.ack(500);
        assert_eq!(t.unacked(), 0);
    }

    #[tokio::test]
    async fn unacked_bytes_never_exceed_high_water_plus_one_chunk() {
        const CHUNK: usize = 16 * 1024;
        const TOTAL: usize = 500 * 1024 * 1024;
        let t = Arc::new(Throttle::new(HIGH_WATER, LOW_WATER));
        let peak = Arc::new(Mutex::new(0usize));
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<usize>();
        let producer = tokio::spawn({
            let (t, peak) = (t.clone(), peak.clone());
            async move {
                let mut sent = 0;
                while sent < TOTAL {
                    t.wait_ready().await;
                    t.on_sent(CHUNK);
                    sent += CHUNK;
                    {
                        let mut p = peak.lock().unwrap();
                        *p = (*p).max(t.unacked());
                    }
                    tx.send(CHUNK).unwrap();
                    if sent % (64 * CHUNK) == 0 {
                        tokio::task::yield_now().await;
                    }
                }
            }
        });
        let consumer = tokio::spawn({
            let t = t.clone();
            async move {
                while let Some(n) = rx.recv().await {
                    t.ack(n);
                }
            }
        });
        producer.await.unwrap();
        consumer.await.unwrap();
        assert!(*peak.lock().unwrap() <= HIGH_WATER + CHUNK, "peak {}", peak.lock().unwrap());
    }
}
