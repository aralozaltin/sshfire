import { MultiExecHub } from "./multiExec";

function setup() {
  const hub = new MultiExecHub();
  const got: Record<string, string[]> = { a: [], b: [], c: [] };
  for (const k of ["a", "b", "c"]) hub.register(k, (t) => got[k].push(t));
  return { hub, got };
}

test("nothing is broadcast until targets are set", () => {
  const { hub, got } = setup();
  hub.broadcast("a", "ls\n");
  expect(got).toEqual({ a: [], b: [], c: [] });
});

test("input typed in a targeted tab goes to the other targeted tabs, not back to itself", () => {
  const { hub, got } = setup();
  hub.setTargets(["a", "b", "c"]);
  hub.broadcast("a", "uptime\n");
  expect(got).toEqual({ a: [], b: ["uptime\n"], c: ["uptime\n"] });
});

test("input typed in a tab outside the target set is not broadcast", () => {
  const { hub, got } = setup();
  hub.setTargets(["b", "c"]);
  hub.broadcast("a", "x");
  expect(got).toEqual({ a: [], b: [], c: [] });
  hub.broadcast("b", "y");
  expect(got.c).toEqual(["y"]);
  expect(got.a).toEqual([]);
});

test("clearing the targets stops broadcasting and unregistering removes a tab", () => {
  const { hub, got } = setup();
  const off = hub.register("d", () => got.a.push("never"));
  off();
  hub.setTargets(["a", "d"]);
  hub.broadcast("a", "x");
  expect(got.a).toEqual([]);
  hub.setTargets(null);
  hub.broadcast("a", "y");
  expect(got.b).toEqual([]);
  expect(hub.isActive("a")).toBe(false);
});

test("send delivers text to one tab and, when it is targeted, to the other targeted tabs", () => {
  const { hub, got } = setup();
  hub.send("a", "ls\r");
  expect(got).toEqual({ a: ["ls\r"], b: [], c: [] });
  hub.setTargets(["a", "b"]);
  hub.send("a", "pwd\r");
  expect(got).toEqual({ a: ["ls\r", "pwd\r"], b: ["pwd\r"], c: [] });
});

test("input listeners see what the user typed and can be removed", () => {
  const { hub } = setup();
  const seen: [string, string][] = [];
  const off = hub.onInput((key, text) => seen.push([key, text]));
  hub.userTyped("a", "x");
  off();
  hub.userTyped("b", "y");
  expect(seen).toEqual([["a", "x"]]);
});

test("userTyped also broadcasts to targeted tabs", () => {
  const { hub, got } = setup();
  hub.setTargets(["a", "c"]);
  hub.userTyped("a", "q");
  expect(got).toEqual({ a: [], b: [], c: ["q"] });
});
