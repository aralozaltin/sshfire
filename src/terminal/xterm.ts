import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import type { TermLike } from "./shellSession";
import { classifyKey } from "./shortcuts";
import { loadFontSize, saveFontSize, stepFontSize } from "./fontSize";

const DARK = { background: "#0c0c0c", foreground: "#d4d4d4", cursor: "#d4d4d4" };
const LIGHT = { background: "#ffffff", foreground: "#1a1a1a", cursor: "#1a1a1a", selectionBackground: "#cfe3f8" };

export function createXterm(el: HTMLElement): TermLike {
  const term = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: 'Menlo, "SF Mono", Consolas, monospace',
    fontSize: loadFontSize(),
    allowProposedApi: true,
    theme: document.documentElement.dataset.theme === "light" ? LIGHT : DARK,
  });
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  let findRequested: () => void = () => {};

  const copySelection = () => {
    void navigator.clipboard.writeText(term.getSelection());
    term.clearSelection();
  };
  const pasteClipboard = () => {
    void navigator.clipboard.readText().then((text) => text && term.paste(text));
  };
  const zoom = (direction: "in" | "out" | "reset") => {
    const size = stepFontSize(term.options.fontSize ?? 13, direction);
    term.options.fontSize = size;
    saveFontSize(size);
    fit.fit();
  };

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const action = classifyKey(e, term.hasSelection(), isMac);
    if (!action) return true;
    // macOS'ta ⌘C/⌘V'yi tarayıcı kendi yönetir; elle işlersek çift yapıştırma olur.
    if (isMac && (action === "copy" || action === "paste")) return true;
    e.preventDefault();
    if (action === "copy") copySelection();
    else if (action === "paste") pasteClipboard();
    else if (action === "find") findRequested();
    else zoom(action === "zoom-in" ? "in" : action === "zoom-out" ? "out" : "reset");
    return false;
  });

  // MobaXterm gibi: sağ tık seçim varsa kopyalar, yoksa yapıştırır.
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (term.hasSelection()) copySelection();
    else pasteClipboard();
  });
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
    find: (query, forward) => (forward ? search.findNext(query) : search.findPrevious(query)),
    clearFind: () => search.clearDecorations(),
    onFindRequest: (cb) => {
      findRequested = cb;
    },
    setTheme: (dark) => {
      term.options.theme = dark ? DARK : LIGHT;
    },
    dispose: () => term.dispose(),
  };
}
