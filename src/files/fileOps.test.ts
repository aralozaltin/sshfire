import { breadcrumbs, joinPath, localBaseName, parentPath, planPaste, uniqueName, type ClipboardItem } from "./fileOps";

const label = (n: number) => (n === 1 ? "kopya" : `kopya ${n}`);

test("uniqueName adds the label before the extension, then numbers", () => {
  expect(uniqueName("rapor.txt", new Set(["rapor.txt"]), label)).toBe("rapor (kopya).txt");
  expect(uniqueName("rapor.txt", new Set(["rapor.txt", "rapor (kopya).txt"]), label)).toBe("rapor (kopya 2).txt");
  expect(uniqueName("yeni.txt", new Set(["rapor.txt"]), label)).toBe("yeni.txt");
});

test("uniqueName keeps dotfiles whole and does not split folder names", () => {
  expect(uniqueName(".bashrc", new Set([".bashrc"]), label)).toBe(".bashrc (kopya)");
  expect(uniqueName("v1.2", new Set(["v1.2"]), label, true)).toBe("v1.2 (kopya)");
  expect(uniqueName("arsiv.tar.gz", new Set(["arsiv.tar.gz"]), label)).toBe("arsiv.tar (kopya).gz");
});

test("path helpers", () => {
  expect(joinPath("/home/a", "b.txt")).toBe("/home/a/b.txt");
  expect(joinPath("/", "etc")).toBe("/etc");
  expect(parentPath("/home/a/b.txt")).toBe("/home/a");
  expect(parentPath("/home")).toBe("/");
  expect(parentPath("/")).toBe("/");
});

test("breadcrumbs of root and nested paths", () => {
  expect(breadcrumbs("/")).toEqual([{ name: "/", path: "/" }]);
  expect(breadcrumbs("/home/a")).toEqual([
    { name: "/", path: "/" },
    { name: "home", path: "/home" },
    { name: "a", path: "/home/a" },
  ]);
});

const clip = (mode: "copy" | "cut", paths: [string, boolean][], key = "c1"): ClipboardItem => ({
  mode,
  connectionKey: key,
  entries: paths.map(([path, isDir]) => ({ path, isDir })),
});

test("pasting a copy into the same directory gets a unique name instead of overwriting", () => {
  const steps = planPaste(clip("copy", [["/h/rapor.txt", false]]), "/h", new Set(["rapor.txt"]), true, label);
  expect(steps).toEqual([{ op: "copy", from: "/h/rapor.txt", to: "/h/rapor (kopya).txt" }]);
});

test("pasting several items keeps their names unique among each other", () => {
  const steps = planPaste(clip("copy", [["/a/x.txt", false], ["/b/x.txt", false]]), "/h", new Set(), true, label);
  expect(steps.map((s) => s.op === "copy" && s.to)).toEqual(["/h/x.txt", "/h/x (kopya).txt"]);
});

test("cut and paste on the same connection is a move, never overwriting", () => {
  expect(planPaste(clip("cut", [["/a/x.txt", false]]), "/h", new Set(), true, label)).toEqual([
    { op: "move", from: "/a/x.txt", to: "/h/x.txt" },
  ]);
  expect(planPaste(clip("cut", [["/a/x.txt", false]]), "/h", new Set(["x.txt"]), true, label)).toEqual([
    { op: "move", from: "/a/x.txt", to: "/h/x (kopya).txt" },
  ]);
});

test("cutting into the same parent directory does nothing", () => {
  expect(planPaste(clip("cut", [["/h/x.txt", false]]), "/h", new Set(["x.txt"]), true, label)).toEqual([]);
});

test("a folder cannot be pasted into itself or its own subfolder", () => {
  expect(planPaste(clip("copy", [["/h/proj", true]]), "/h/proj", new Set(), true, label)).toEqual([]);
  expect(planPaste(clip("cut", [["/h/proj", true]]), "/h/proj/sub", new Set(), true, label)).toEqual([]);
  expect(planPaste(clip("copy", [["/h/proj", true]]), "/h/project2", new Set(), true, label)).toHaveLength(1);
});

test("pasting across connections is reported as unsupported", () => {
  expect(planPaste(clip("copy", [["/a/x", false]]), "/h", new Set(), false, label)).toEqual([{ op: "unsupported" }]);
});

test("localBaseName handles unix and windows paths and trailing separators", () => {
  expect(localBaseName("/Users/u/foto.png")).toBe("foto.png");
  expect(localBaseName("C:\\Users\\u\\foto.png")).toBe("foto.png");
  expect(localBaseName("/Users/u/klasor/")).toBe("klasor");
  expect(localBaseName("\\\\sunucu\\paylasim\\x.txt")).toBe("x.txt");
});
