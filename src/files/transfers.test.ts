import { applyTransferEvent, percent, type TransferEvent, type TransferState } from "./transfers";

const ev = (over: Partial<TransferEvent> = {}): TransferEvent => ({
  transferId: "a", direction: "upload", name: "x.bin", done: 0, total: 100, state: "running", ...over,
});

test("a new transfer is appended and an existing one is updated in place", () => {
  let list: TransferState[] = [];
  list = applyTransferEvent(list, ev());
  list = applyTransferEvent(list, ev({ transferId: "b", name: "y" }));
  list = applyTransferEvent(list, ev({ done: 40 }));
  expect(list.map((t) => [t.id, t.done])).toEqual([["a", 40], ["b", 0]]);
});

test("finished states are kept until dismissed and carry error and local path", () => {
  let list = applyTransferEvent([], ev({ direction: "download", state: "done", done: 100, localPath: "/Users/u/Downloads/x.bin" }));
  expect(list[0]).toMatchObject({ state: "done", localPath: "/Users/u/Downloads/x.bin" });
  list = applyTransferEvent(list, ev({ transferId: "e", state: "error", error: { code: "permission_denied" } }));
  expect(list[1].error).toEqual({ code: "permission_denied" });
});

test("percent handles unknown and zero totals", () => {
  expect(percent({ done: 25, total: 100 })).toBe(25);
  expect(percent({ done: 0, total: 0 })).toBe(0);
  expect(percent({ done: 150, total: 100 })).toBe(100);
});
