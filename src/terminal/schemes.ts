import type { ITheme } from "@xterm/xterm";

const KEY = "ssh-istemci.termScheme";
export const SCHEME_EVENT = "sshfire:term-scheme";

const DEFAULT_DARK: ITheme = { background: "#0c0c0c", foreground: "#d4d4d4", cursor: "#d4d4d4" };
const DEFAULT_LIGHT: ITheme = { background: "#ffffff", foreground: "#1a1a1a", cursor: "#1a1a1a", selectionBackground: "#cfe3f8" };

const palette = (c: string[]): ITheme => ({
  black: c[0], red: c[1], green: c[2], yellow: c[3], blue: c[4], magenta: c[5], cyan: c[6], white: c[7],
  brightBlack: c[8], brightRed: c[9], brightGreen: c[10], brightYellow: c[11], brightBlue: c[12], brightMagenta: c[13], brightCyan: c[14], brightWhite: c[15],
});

const NAMED: Record<string, ITheme> = {
  dracula: {
    background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", selectionBackground: "#44475a",
    ...palette(["#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2", "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff"]),
  },
  nord: {
    background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", selectionBackground: "#434c5e",
    ...palette(["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0", "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"]),
  },
  "solarized-dark": {
    background: "#002b36", foreground: "#839496", cursor: "#93a1a1", selectionBackground: "#073642",
    ...palette(["#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5", "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3"]),
  },
  "tokyo-night": {
    background: "#1a1b26", foreground: "#c0caf5", cursor: "#c0caf5", selectionBackground: "#33467c",
    ...palette(["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"]),
  },
  gruvbox: {
    background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", selectionBackground: "#504945",
    ...palette(["#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984", "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2"]),
  },
};

export const SCHEME_IDS = ["default", ...Object.keys(NAMED)];

/** Adlandırılmış şemalar uygulama temasından bağımsızdır; "default" açık/koyu temaya uyar. */
export function terminalTheme(id: string, dark: boolean): ITheme {
  return NAMED[id] ?? (dark ? DEFAULT_DARK : DEFAULT_LIGHT);
}

export function loadScheme(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && SCHEME_IDS.includes(v) ? v : "default";
  } catch {
    return "default";
  }
}

export function saveScheme(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Depolama kapalıysa şema yalnızca bu oturumda geçerli olur.
  }
  window.dispatchEvent(new CustomEvent(SCHEME_EVENT, { detail: id }));
}
