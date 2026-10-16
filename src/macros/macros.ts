export interface Macro {
  id: string;
  name: string;
  text: string;
}

const KEY = "ssh-istemci.macros";

export function loadMacros(): Macro[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is Macro => !!m && typeof m === "object" && typeof (m as Macro).id === "string" && typeof (m as Macro).name === "string" && typeof (m as Macro).text === "string",
    );
  } catch {
    return [];
  }
}

export function saveMacros(macros: Macro[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(macros));
  } catch {
    // Depolama kapalıysa makrolar yalnızca bu oturumda geçerli olur.
  }
}

/** Yazılmış metni terminal girdisine çevirir: her satır Enter (\r) ile biter; kaydedilmiş girdi olduğu gibi kalır. */
export function textToInput(text: string): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n/g, "\r");
  return normalized.endsWith("\r") ? normalized : `${normalized}\r`;
}

export function previewText(text: string, max = 40): string {
  const shown = text
    .replace(/\r\n|\r|\n/g, " ⏎")
    .replace(/\x1b/g, "␛")
    .replace(/\t/g, " ⇥");
  return shown.length > max ? `${shown.slice(0, max)}…` : shown;
}

let counter = 0;
export function newMacro(name: string, text: string): Macro {
  counter += 1;
  return { id: `m-${Date.now().toString(36)}-${counter}`, name, text };
}
