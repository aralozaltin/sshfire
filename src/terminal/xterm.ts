import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { TermLike } from "./shellSession";

const DARK = { background: "#0c0c0c", foreground: "#d4d4d4", cursor: "#d4d4d4" };
const LIGHT = { background: "#ffffff", foreground: "#1a1a1a", cursor: "#1a1a1a", selectionBackground: "#cfe3f8" };

export function createXterm(el: HTMLElement): TermLike {
  const term = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: 'Menlo, "SF Mono", Consolas, monospace',
    fontSize: 13,
    allowProposedApi: true,
    theme: document.documentElement.dataset.theme === "light" ? LIGHT : DARK,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // WebGL yoksa xterm kendi varsayılan çizicisine döner.
  }
  fit.fit();
  return {
    write: (data, done) => term.write(data, done),
    onData: (cb) => void term.onData(cb),
    onResize: (cb) => void term.onResize(({ cols, rows }) => cb(cols, rows)),
    size: () => ({ cols: term.cols, rows: term.rows }),
    fit: () => fit.fit(),
    focus: () => term.focus(),
    setTheme: (dark) => {
      term.options.theme = dark ? DARK : LIGHT;
    },
    dispose: () => term.dispose(),
  };
}
