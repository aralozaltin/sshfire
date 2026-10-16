import { useEffect, useState } from "react";
import type { BackendError } from "../i18n";

export interface TransferEvent {
  transferId: string;
  direction: "upload" | "download";
  name: string;
  done: number;
  total: number;
  state: "running" | "done" | "error" | "cancelled";
  error?: BackendError;
  localPath?: string;
}

export interface TransferState extends Omit<TransferEvent, "transferId"> {
  id: string;
}

export function applyTransferEvent(list: TransferState[], ev: TransferEvent): TransferState[] {
  const { transferId, ...rest } = ev;
  const next: TransferState = { id: transferId, ...rest };
  const i = list.findIndex((t) => t.id === transferId);
  if (i === -1) return [...list, next];
  return list.map((t, idx) => (idx === i ? next : t));
}

export function percent(t: { done: number; total: number }): number {
  if (t.total <= 0) return 0;
  return Math.min(100, Math.floor((t.done / t.total) * 100));
}

export function useTransfers(subscribe: (cb: (e: TransferEvent) => void) => Promise<() => void>) {
  const [transfers, setTransfers] = useState<TransferState[]>([]);
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void subscribe((e) => setTransfers((cur) => applyTransferEvent(cur, e))).then((fn) => {
      if (cancelled) fn();
      else off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [subscribe]);
  const dismiss = (id: string) => setTransfers((cur) => cur.filter((t) => t.id !== id));
  return { transfers, dismiss };
}
