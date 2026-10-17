import type { Metrics } from "../metrics/types";

export type ShellStatus = "connecting" | "open" | "closed";

export interface TermLike {
  write(data: Uint8Array, done: () => void): void;
  onData(cb: (text: string) => void): void;
  onResize(cb: (cols: number, rows: number) => void): void;
  size(): { cols: number; rows: number };
  fit(): void;
  focus(): void;
  setTheme?(dark: boolean): void;
  find?(query: string, forward: boolean): boolean;
  clearFind?(): void;
  onFindRequest?(cb: () => void): void;
  dispose(): void;
}

export interface ShellApi {
  connect(sessionId: string, cols: number, rows: number, onData: (bytes: Uint8Array) => void): Promise<string>;
  shellWrite(tabId: string, data: Uint8Array): Promise<void>;
  shellResize(tabId: string, cols: number, rows: number): Promise<void>;
  shellAck(tabId: string, bytes: number): Promise<void>;
  shellClose(tabId: string): Promise<void>;
  onShellClosed(cb: (e: { tabId: string; reason: string | null }) => void): Promise<() => void>;
  metricsStart?(tabId: string, cb: (m: Metrics | null) => void): Promise<void>;
  metricsStop?(tabId: string): Promise<void>;
  cwdStart?(tabId: string, cb: (cwd: string) => void): Promise<void>;
  cwdStop?(tabId: string): Promise<void>;
  /** Kayıt dosyasını sorar; iptal edilirse `null`, aksi halde günlüğün yazıldığı yol. */
  logStart?(tabId: string, suggestedName: string): Promise<string | null>;
  logStop?(tabId: string): Promise<void>;
  /** Masaüstü bildirimi gönderir (izin gerekiyorsa ister). */
  notify?(title: string, body: string): Promise<void>;
}

export class ShellSession {
  status: ShellStatus = "connecting";
  closeReason: string | null = null;
  error: unknown = null;
  tabId: string | null = null;
  private pendingAck = 0;
  private unlisten: (() => void) | null = null;
  private encoder = new TextEncoder();
  private disposed = false;
  userInput: ((text: string) => void) | null = null;
  /** Son yazılan (ya da makroyla gönderilen) girdinin zamanı; boşta kalma süresi buradan hesaplanır. */
  lastActivity = Date.now();
  private stopped = false;

  constructor(
    private api: ShellApi,
    private term: TermLike,
    private onChange: () => void = () => {},
  ) {
    term.onData((text) => {
      this.send(text);
      this.userInput?.(text);
    });
    term.onResize((cols, rows) => this.resize(cols, rows));
  }

  async open(sessionId: string): Promise<void> {
    this.term.fit();
    const { cols, rows } = this.term.size();
    try {
      this.tabId = await this.api.connect(sessionId, cols, rows, (bytes) => this.handleData(bytes));
    } catch (e) {
      this.error = e ?? new Error("connect failed");
      this.setStatus("closed");
      return;
    }
    if (this.disposed) {
      await this.api.shellClose(this.tabId);
      this.setStatus("closed");
      return;
    }
    this.unlisten = await this.api.onShellClosed((ev) => {
      if (ev.tabId !== this.tabId) return;
      this.closeReason = ev.reason;
      this.setStatus("closed");
    });
    if (this.pendingAck > 0) {
      void this.api.shellAck(this.tabId, this.pendingAck);
      this.pendingAck = 0;
    }
    if (this.status === "connecting") this.setStatus("open");
  }

  /** Sunucudan her çıktı geldiğinde çağrılır. */
  onActivity?: () => void;

  handleData(bytes: Uint8Array): void {
    this.onActivity?.();
    this.term.write(bytes, () => {
      if (this.tabId) void this.api.shellAck(this.tabId, bytes.length);
      else this.pendingAck += bytes.length;
    });
  }

  send(text: string): void {
    if (!this.tabId || this.status !== "open") return;
    this.lastActivity = Date.now();
    void this.api.shellWrite(this.tabId, this.encoder.encode(text));
  }

  resize(cols: number, rows: number): void {
    if (!this.tabId || this.status !== "open") return;
    void this.api.shellResize(this.tabId, cols, rows);
  }

  /** Bağlantıyı bilerek keser (örn. boşta kalınca); terminal içeriği ekranda kalır. */
  async stop(reason: string): Promise<void> {
    if (this.status !== "open" || !this.tabId) return;
    this.stopped = true;
    this.closeReason = reason;
    this.setStatus("closed");
    await this.api.shellClose(this.tabId);
  }

  async close(): Promise<void> {
    this.disposed = true;
    this.unlisten?.();
    if (this.tabId && !this.stopped) await this.api.shellClose(this.tabId);
    this.term.dispose();
  }

  private setStatus(status: ShellStatus) {
    this.status = status;
    this.onChange();
  }
}
