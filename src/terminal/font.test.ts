import { BASE_FONTS, cleanFontName, fontStack, FONT_EVENT, loadFontFamily, saveFontFamily } from "./font";

afterEach(() => localStorage.clear());

test("no custom font gives the system stack", () => {
  expect(fontStack("")).toBe(BASE_FONTS);
  expect(fontStack("   ")).toBe(BASE_FONTS);
});

test("a custom font goes first and keeps the system fonts as fallback", () => {
  expect(fontStack("JetBrainsMono Nerd Font")).toBe(`"JetBrainsMono Nerd Font", ${BASE_FONTS}`);
});

test("characters that could break out of the css value are removed", () => {
  expect(cleanFontName('Fira"; color: red; x\'')).toBe("Fira color: red x");
  expect(fontStack('a", evil')).toBe(`"a evil", ${BASE_FONTS}`);
});

test("the choice is saved, announced and can be cleared", () => {
  const seen = vi.fn();
  window.addEventListener(FONT_EVENT, seen);
  saveFontFamily("Hack Nerd Font");
  expect(loadFontFamily()).toBe("Hack Nerd Font");
  saveFontFamily("");
  expect(loadFontFamily()).toBe("");
  expect(seen).toHaveBeenCalledTimes(2);
  window.removeEventListener(FONT_EVENT, seen);
});
