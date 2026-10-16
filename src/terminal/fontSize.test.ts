import { clampFontSize, DEFAULT_FONT_SIZE, loadFontSize, saveFontSize, stepFontSize } from "./fontSize";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("the size stays between 8 and 32", () => {
  expect(clampFontSize(2)).toBe(8);
  expect(clampFontSize(99)).toBe(32);
  expect(clampFontSize(13.4)).toBe(13);
  expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
});

test("stepping zooms by one point and reset returns to the default", () => {
  expect(stepFontSize(13, "in")).toBe(14);
  expect(stepFontSize(13, "out")).toBe(12);
  expect(stepFontSize(32, "in")).toBe(32);
  expect(stepFontSize(8, "out")).toBe(8);
  expect(stepFontSize(20, "reset")).toBe(DEFAULT_FONT_SIZE);
});

test("the size roundtrips through storage and survives broken storage", () => {
  expect(loadFontSize()).toBe(DEFAULT_FONT_SIZE);
  saveFontSize(17);
  expect(loadFontSize()).toBe(17);
  localStorage.setItem("ssh-istemci.fontSize", "abc");
  expect(loadFontSize()).toBe(DEFAULT_FONT_SIZE);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(loadFontSize()).toBe(DEFAULT_FONT_SIZE);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveFontSize(10)).not.toThrow();
});
