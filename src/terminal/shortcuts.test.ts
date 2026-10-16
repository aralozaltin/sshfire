import { classifyKey } from "./shortcuts";

const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, ...mods,
});

test("on macOS Cmd+C copies only when there is a selection, Cmd+V pastes, Cmd+F finds", () => {
  expect(classifyKey(k("c", { metaKey: true }), true, true)).toBe("copy");
  expect(classifyKey(k("c", { metaKey: true }), false, true)).toBeNull();
  expect(classifyKey(k("v", { metaKey: true }), false, true)).toBe("paste");
  expect(classifyKey(k("f", { metaKey: true }), false, true)).toBe("find");
});

test("on macOS plain Ctrl+C is never intercepted so it can interrupt a program", () => {
  expect(classifyKey(k("c", { ctrlKey: true }), true, true)).toBeNull();
  expect(classifyKey(k("v", { ctrlKey: true }), false, true)).toBeNull();
});

test("on Windows and Linux Ctrl+C copies only with a selection, otherwise it reaches the shell", () => {
  expect(classifyKey(k("c", { ctrlKey: true }), true, false)).toBe("copy");
  expect(classifyKey(k("c", { ctrlKey: true }), false, false)).toBeNull();
});

test("Ctrl+Shift+C and Ctrl+Shift+V always copy and paste on Windows and Linux", () => {
  expect(classifyKey(k("C", { ctrlKey: true, shiftKey: true }), false, false)).toBe("copy");
  expect(classifyKey(k("V", { ctrlKey: true, shiftKey: true }), false, false)).toBe("paste");
  expect(classifyKey(k("F", { ctrlKey: true, shiftKey: true }), false, false)).toBe("find");
});

test("zoom shortcuts work with the platform modifier and accept + and =", () => {
  expect(classifyKey(k("=", { metaKey: true }), false, true)).toBe("zoom-in");
  expect(classifyKey(k("+", { metaKey: true }), false, true)).toBe("zoom-in");
  expect(classifyKey(k("-", { metaKey: true }), false, true)).toBe("zoom-out");
  expect(classifyKey(k("0", { metaKey: true }), false, true)).toBe("zoom-reset");
  expect(classifyKey(k("=", { ctrlKey: true }), false, false)).toBe("zoom-in");
  expect(classifyKey(k("0", { ctrlKey: true }), false, false)).toBe("zoom-reset");
});

test("ordinary keys are left alone", () => {
  expect(classifyKey(k("a"), true, true)).toBeNull();
  expect(classifyKey(k("Enter", { metaKey: true }), true, true)).toBeNull();
});
