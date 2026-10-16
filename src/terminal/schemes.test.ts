import { loadScheme, saveScheme, SCHEME_IDS, terminalTheme } from "./schemes";

beforeEach(() => localStorage.clear());

test("the default scheme follows the app theme", () => {
  expect(terminalTheme("default", true).background).toBe("#0c0c0c");
  expect(terminalTheme("default", false).background).toBe("#ffffff");
});

test("a named scheme keeps its own colors in both app themes", () => {
  expect(terminalTheme("dracula", true)).toEqual(terminalTheme("dracula", false));
  expect(terminalTheme("dracula", true).background).toBe("#282a36");
});

test("every named scheme defines the 16 ansi colors", () => {
  for (const id of SCHEME_IDS.filter((x) => x !== "default")) {
    const theme = terminalTheme(id, true);
    for (const key of ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const) {
      expect(theme[key], `${id}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  }
});

test("the chosen scheme is remembered and an unknown value falls back to default", () => {
  expect(loadScheme()).toBe("default");
  saveScheme("nord");
  expect(loadScheme()).toBe("nord");
  localStorage.setItem("ssh-istemci.termScheme", "bogus");
  expect(loadScheme()).toBe("default");
});

test("saving a scheme tells open terminals to repaint", () => {
  const seen: string[] = [];
  const on = (e: Event) => seen.push((e as CustomEvent<string>).detail);
  window.addEventListener("sshfire:term-scheme", on);
  saveScheme("gruvbox");
  window.removeEventListener("sshfire:term-scheme", on);
  expect(seen).toEqual(["gruvbox"]);
});
