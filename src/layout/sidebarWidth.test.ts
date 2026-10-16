import { clampWidth, DEFAULT_SIDEBAR_WIDTH, loadSidebarWidth, saveSidebarWidth } from "./sidebarWidth";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("clampWidth keeps the sidebar between 180 and 600 and falls back for garbage", () => {
  expect(clampWidth(100)).toBe(180);
  expect(clampWidth(900)).toBe(600);
  expect(clampWidth(333.7)).toBe(334);
  expect(clampWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
});

test("the width roundtrips through storage and survives broken storage", () => {
  expect(loadSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  saveSidebarWidth(320);
  expect(loadSidebarWidth()).toBe(320);
  localStorage.setItem("ssh-istemci.sidebarWidth", "abc");
  expect(loadSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  localStorage.setItem("ssh-istemci.sidebarWidth", "5000");
  expect(loadSidebarWidth()).toBe(600);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(loadSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveSidebarWidth(300)).not.toThrow();
});
