import { loadMacros, newMacro, previewText, saveMacros, textToInput, type Macro } from "./macros";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("macros roundtrip through storage and bad data is ignored", () => {
  expect(loadMacros()).toEqual([]);
  const list: Macro[] = [{ id: "1", name: "Disk", text: "df -h\n" }];
  saveMacros(list);
  expect(loadMacros()).toEqual(list);
  localStorage.setItem("ssh-istemci.macros", "{bozuk");
  expect(loadMacros()).toEqual([]);
  localStorage.setItem("ssh-istemci.macros", JSON.stringify([{ id: 1 }, { id: "a", name: "ok", text: "ls" }, "x"]));
  expect(loadMacros()).toEqual([{ id: "a", name: "ok", text: "ls" }]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(loadMacros()).toEqual([]);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveMacros(list)).not.toThrow();
});

test("typed text is converted to terminal input: newlines become Enter", () => {
  expect(textToInput("ls -la\ndf -h")).toBe("ls -la\rdf -h\r");
  expect(textToInput("ls\r\npwd\r\n")).toBe("ls\rpwd\r");
  expect(textToInput("tek satır")).toBe("tek satır\r");
  expect(textToInput("")).toBe("");
});

test("recorded input is kept as typed, only completed with a final Enter when missing", () => {
  expect(textToInput("cd /tmp\r")).toBe("cd /tmp\r");
});

test("previewText makes control characters visible and shortens long text", () => {
  expect(previewText("ls\r")).toBe("ls ⏎");
  expect(previewText("a\x1b[Ab\t")).toBe("a␛[Ab ⇥");
  expect(previewText("x".repeat(100)).length).toBeLessThanOrEqual(41);
  expect(previewText("x".repeat(100)).endsWith("…")).toBe(true);
});

test("new macros get distinct ids", () => {
  const a = newMacro("a", "ls");
  const b = newMacro("b", "ls");
  expect(a.id).not.toBe(b.id);
  expect(a).toMatchObject({ name: "a", text: "ls" });
});
