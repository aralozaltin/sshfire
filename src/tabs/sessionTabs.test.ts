import { loadSavedTabs, saveTabs } from "./sessionTabs";

beforeEach(() => localStorage.clear());

test("tabs are saved with their server id and title, and read back in order", () => {
  saveTabs([{ sessionId: "a", title: "Prod" }, { sessionId: "b", title: "Dev" }]);
  expect(loadSavedTabs()).toEqual([{ sessionId: "a", title: "Prod" }, { sessionId: "b", title: "Dev" }]);
});

test("nothing saved, broken data and wrong shapes all read as an empty list", () => {
  expect(loadSavedTabs()).toEqual([]);
  localStorage.setItem("ssh-istemci.openTabs", "{not json");
  expect(loadSavedTabs()).toEqual([]);
  localStorage.setItem("ssh-istemci.openTabs", JSON.stringify([{ sessionId: 1 }, "x", null, { sessionId: "ok", title: "T" }]));
  expect(loadSavedTabs()).toEqual([{ sessionId: "ok", title: "T" }]);
});

test("an empty list clears the saved tabs", () => {
  saveTabs([{ sessionId: "a", title: "A" }]);
  saveTabs([]);
  expect(loadSavedTabs()).toEqual([]);
});
