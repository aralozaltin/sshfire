import { classifyAppKey } from "./appShortcuts";

const key = (k: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o,
});

describe("macOS", () => {
  test("Cmd+T opens a local terminal, Cmd+W closes the tab", () => {
    expect(classifyAppKey(key("t", { metaKey: true }), true)).toEqual({ type: "newLocal" });
    expect(classifyAppKey(key("w", { metaKey: true }), true)).toEqual({ type: "close" });
  });
  test("Cmd+K opens quick connect", () => {
    expect(classifyAppKey(key("k", { metaKey: true }), true)).toEqual({ type: "quickConnect" });
  });
  test("Cmd+1..9 jump to a tab and Cmd+Shift+[ ] cycle", () => {
    expect(classifyAppKey(key("3", { metaKey: true }), true)).toEqual({ type: "goto", index: 2 });
    expect(classifyAppKey(key("9", { metaKey: true }), true)).toEqual({ type: "goto", index: 8 });
    expect(classifyAppKey(key("}", { metaKey: true, shiftKey: true }), true)).toEqual({ type: "next" });
    expect(classifyAppKey(key("{", { metaKey: true, shiftKey: true }), true)).toEqual({ type: "prev" });
  });
  test("plain keys, Ctrl combinations and Cmd+0 are left alone", () => {
    expect(classifyAppKey(key("t"), true)).toBeNull();
    expect(classifyAppKey(key("w", { ctrlKey: true }), true)).toBeNull();
    expect(classifyAppKey(key("0", { metaKey: true }), true)).toBeNull();
  });
});

describe("Windows and Linux", () => {
  test("Ctrl+Shift+T / Ctrl+Shift+W because plain Ctrl+W belongs to the shell", () => {
    expect(classifyAppKey(key("T", { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: "newLocal" });
    expect(classifyAppKey(key("W", { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: "close" });
    expect(classifyAppKey(key("w", { ctrlKey: true }), false)).toBeNull();
    expect(classifyAppKey(key("t", { ctrlKey: true }), false)).toBeNull();
  });
  test("Ctrl+Shift+K opens quick connect while plain Ctrl+K stays with the shell", () => {
    expect(classifyAppKey(key("K", { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: "quickConnect" });
    expect(classifyAppKey(key("k", { ctrlKey: true }), false)).toBeNull();
  });
  test("Alt+1..9 jump to a tab and Ctrl+Tab / Ctrl+Shift+Tab cycle", () => {
    expect(classifyAppKey(key("1", { altKey: true }), false)).toEqual({ type: "goto", index: 0 });
    expect(classifyAppKey(key("Tab", { ctrlKey: true }), false)).toEqual({ type: "next" });
    expect(classifyAppKey(key("Tab", { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: "prev" });
  });
  test("Ctrl+PageUp/PageDown cycle too", () => {
    expect(classifyAppKey(key("PageDown", { ctrlKey: true }), false)).toEqual({ type: "next" });
    expect(classifyAppKey(key("PageUp", { ctrlKey: true }), false)).toEqual({ type: "prev" });
  });
});
