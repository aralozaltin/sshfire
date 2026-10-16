export class MultiExecHub {
  private senders = new Map<string, (text: string) => void>();
  private targets: Set<string> | null = null;

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

  broadcast(from: string, text: string): void {
    if (!this.targets?.has(from)) return;
    for (const key of this.targets) {
      if (key !== from) this.senders.get(key)?.(text);
    }
  }
}
