import { formatRate, formatUptime, level } from "./format";
import { en } from "../locales/en";
import { tr } from "../locales/tr";

test("formatUptime shows days and hours, hours and minutes, or minutes", () => {
  expect(formatUptime(3 * 86400 + 4 * 3600 + 120, tr)).toBe("3g 4s");
  expect(formatUptime(3 * 86400 + 4 * 3600, en)).toBe("3d 4h");
  expect(formatUptime(5 * 3600 + 7 * 60, en)).toBe("5h 7m");
  expect(formatUptime(42 * 60 + 5, en)).toBe("42m");
  expect(formatUptime(10, en)).toBe("0m");
});

test("formatRate appends per-second", () => {
  expect(formatRate(1536)).toBe("1.5 KB/s");
  expect(formatRate(0)).toBe("0 B/s");
});

test("level maps usage percentages to normal, warn and crit", () => {
  expect(level(10)).toBe("ok");
  expect(level(79.9)).toBe("ok");
  expect(level(80)).toBe("warn");
  expect(level(89.9)).toBe("warn");
  expect(level(90)).toBe("crit");
  expect(level(null)).toBe("ok");
});
