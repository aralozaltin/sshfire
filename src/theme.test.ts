import { applyTheme, loadThemeMode, resolveTheme, saveThemeMode } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test("resolveTheme follows the system only in system mode", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});

test("load returns system when storage is empty, invalid or throws", () => {
  expect(loadThemeMode()).toBe("system");
  localStorage.setItem("ssh-istemci.theme", "neon");
  expect(loadThemeMode()).toBe("system");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(loadThemeMode()).toBe("system");
});

test("save then load roundtrips and save never throws", () => {
  saveThemeMode("dark");
  expect(loadThemeMode()).toBe("dark");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveThemeMode("light")).not.toThrow();
});

test("applyTheme sets the data-theme attribute", () => {
  applyTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});
