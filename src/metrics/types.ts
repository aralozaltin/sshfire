export interface Metrics {
  cpuPercent: number | null;
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  diskUsed: number;
  diskTotal: number;
  load: [number, number, number];
  uptimeSecs: number;
  netRxBps: number | null;
  netTxBps: number | null;
}
