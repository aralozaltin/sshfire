import type { Extension } from "@codemirror/state";
import { StreamLanguage, type StreamParser } from "@codemirror/language";

const BY_EXTENSION: Record<string, string> = {
  json: "json", jsonc: "json",
  yml: "yaml", yaml: "yaml",
  sh: "shell", bash: "shell", zsh: "shell",
  py: "python",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "javascript", tsx: "javascript",
  md: "markdown", markdown: "markdown",
  html: "html", htm: "html",
  css: "css",
  xml: "xml", svg: "xml",
  sql: "sql",
  properties: "properties", env: "properties", ini: "properties", cfg: "properties",
  toml: "toml",
  diff: "diff", patch: "diff",
};

const BY_NAME: Record<string, string> = {
  dockerfile: "dockerfile",
  ".bashrc": "shell", ".bash_profile": "shell", ".bash_aliases": "shell", ".zshrc": "shell", ".profile": "shell",
  ".env": "properties",
};

/** Dosya yolundan düzenleyici dilini seçer; tanınmayan dosya düz metin olur (`null`). */
export function languageId(path: string): string | null {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (BY_NAME[name]) return BY_NAME[name];
  if (/(^|\/)nginx(\/|$)/i.test(path) || name === "nginx.conf") return "nginx";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? BY_EXTENSION[name.slice(dot + 1)] ?? null : null;
}

const legacy = (parser: StreamParser<unknown>): Extension => StreamLanguage.define(parser);

/** Dil paketini ihtiyaç anında yükler; böylece açılış paketi küçük kalır. */
export async function loadLanguage(id: string): Promise<Extension | null> {
  switch (id) {
    case "json": return (await import("@codemirror/lang-json")).json();
    case "yaml": return (await import("@codemirror/lang-yaml")).yaml();
    case "python": return (await import("@codemirror/lang-python")).python();
    case "javascript": return (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true });
    case "markdown": return (await import("@codemirror/lang-markdown")).markdown();
    case "html": return (await import("@codemirror/lang-html")).html();
    case "css": return (await import("@codemirror/lang-css")).css();
    case "xml": return (await import("@codemirror/lang-xml")).xml();
    case "sql": return (await import("@codemirror/lang-sql")).sql();
    case "shell": return legacy((await import("@codemirror/legacy-modes/mode/shell")).shell);
    case "nginx": return legacy((await import("@codemirror/legacy-modes/mode/nginx")).nginx);
    case "dockerfile": return legacy((await import("@codemirror/legacy-modes/mode/dockerfile")).dockerFile);
    case "properties": return legacy((await import("@codemirror/legacy-modes/mode/properties")).properties);
    case "toml": return legacy((await import("@codemirror/legacy-modes/mode/toml")).toml);
    case "diff": return legacy((await import("@codemirror/legacy-modes/mode/diff")).diff);
    default: return null;
  }
}
