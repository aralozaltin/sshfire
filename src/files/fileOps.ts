export interface ClipboardEntry {
  path: string;
  isDir: boolean;
}

export interface ClipboardItem {
  mode: "copy" | "cut";
  connectionKey: string;
  entries: ClipboardEntry[];
}

export type PasteStep =
  | { op: "copy"; from: string; to: string }
  | { op: "move"; from: string; to: string }
  | { op: "unsupported" };

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const i = trimmed.lastIndexOf("/");
  return i <= 0 ? "/" : trimmed.slice(0, i);
}

export function baseName(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
}

export function localBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
}

export function breadcrumbs(path: string): { name: string; path: string }[] {
  const out = [{ name: "/", path: "/" }];
  let acc = "";
  for (const part of path.split("/").filter(Boolean)) {
    acc += `/${part}`;
    out.push({ name: part, path: acc });
  }
  return out;
}

export function uniqueName(name: string, existing: Set<string>, label: (n: number) => string, isDir = false): string {
  if (!existing.has(name)) return name;
  const dot = isDir ? -1 : name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${label(n)})${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
}

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith("/") ? dir : `${dir}/`);
}

export function planPaste(
  clip: ClipboardItem,
  targetDir: string,
  existingNames: Set<string>,
  sameConnection: boolean,
  label: (n: number) => string,
): PasteStep[] {
  if (!sameConnection) return [{ op: "unsupported" }];
  const taken = new Set(existingNames);
  const steps: PasteStep[] = [];
  for (const entry of clip.entries) {
    if (entry.isDir && isInside(targetDir, entry.path)) continue;
    if (clip.mode === "cut" && parentPath(entry.path) === targetDir) continue;
    const name = uniqueName(baseName(entry.path), taken, label, entry.isDir);
    taken.add(name);
    steps.push({ op: clip.mode === "cut" ? "move" : "copy", from: entry.path, to: joinPath(targetDir, name) });
  }
  return steps;
}
