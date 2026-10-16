export class MultiExecHub {
  private senders = new Map<string, (text: string) => void>();
  private targets: Set<string> | null = null;
  private listeners = new Set<(key: string, text: string) => void>();

  register(key: string, send: (text: string) => void): () => void {
    this.senders.set(key, send);
    return () => {
      this.senders.delete(key);
    };
  }

  setTargets(keys: Iterable<string> | null): void {
    this.targets = keys ? new Set(keys) : null;
  }

  isActive(key: string): boolean {
    return this.targets?.has(key) ?? false;
  }

  /** Belirli bir sekmeye metin gönderir; sekme MultiExec hedefindeyse diğer hedeflere de gider. */
  send(key: string, text: string): void {
    this.senders.get(key)?.(text);
    this.broadcast(key, text);
  }

  /** Kullanıcının bir terminale yazdığı girdi: dinleyicilere (makro kaydı) bildirilir ve hedeflere yayılır. */
  userTyped(key: string, text: string): void {
    this.listeners.forEach((l) => l(key, text));
    this.broadcast(key, text);
  }

  onInput(listener: (key: string, text: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(from: string, text: string): void {
    if (!this.targets?.has(from)) return;
    for (const key of this.targets) {
      if (key !== from) this.senders.get(key)?.(text);
    }
  }
}
