import { DEFAULT_COLUMNS, loadColumns, resizeColumn, saveColumns } from "./columns";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("resizeColumn changes only the chosen column, never below the minimum, without mutating", () => {
  const start = [200, 80, 150, 100];
  expect(resizeColumn(start, 1, 30)).toEqual([200, 110, 150, 100]);
  expect(resizeColumn(start, 1, -500)).toEqual([200, 48, 150, 100]);
  expect(start).toEqual([200, 80, 150, 100]);
});

test("columns roundtrip through storage; invalid data falls back to the defaults", () => {
  expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
  saveColumns([300, 90, 160, 110]);
  expect(loadColumns()).toEqual([300, 90, 160, 110]);
  localStorage.setItem("ssh-istemci.fileColumns", "[1,2]");
  expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
  localStorage.setItem("ssh-istemci.fileColumns", "{bozuk");
  expect(loadColumns()).toEqual(DEFAULT_COLUMNS);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveColumns([1, 2, 3, 4])).not.toThrow();
});
