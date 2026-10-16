import { loadAutoUpdate, loadLastCheck, saveAutoUpdate, saveLastCheck, shouldCheckNow } from "./updates";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const HOUR = 3600_000;

test("automatic checking is on by default and the choice is remembered", () => {
  expect(loadAutoUpdate()).toBe(true);
  saveAutoUpdate(false);
  expect(loadAutoUpdate()).toBe(false);
  saveAutoUpdate(true);
  expect(loadAutoUpdate()).toBe(true);
});

test("the last check time roundtrips and garbage is ignored", () => {
  expect(loadLastCheck()).toBeNull();
  saveLastCheck(1234);
  expect(loadLastCheck()).toBe(1234);
  localStorage.setItem("ssh-istemci.lastUpdateCheck", "abc");
  expect(loadLastCheck()).toBeNull();
});

test("storage failures never throw", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(loadAutoUpdate()).toBe(true);
  expect(loadLastCheck()).toBeNull();
  expect(() => saveAutoUpdate(false)).not.toThrow();
  expect(() => saveLastCheck(1)).not.toThrow();
});

test("a check is due when automatic checking is on and the last one was more than a day ago or never", () => {
  expect(shouldCheckNow(true, null, 1000)).toBe(true);
  expect(shouldCheckNow(true, 0, 25 * HOUR)).toBe(true);
  expect(shouldCheckNow(true, 0, 23 * HOUR)).toBe(false);
  expect(shouldCheckNow(false, null, 1000)).toBe(false);
  expect(shouldCheckNow(true, 5000, 1000)).toBe(true);
});
