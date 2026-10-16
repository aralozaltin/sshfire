import { formatMode, formatModified, formatOctal, formatSize } from "./format";

test("formatSize picks readable binary units", () => {
  expect(formatSize(0)).toBe("0 B");
  expect(formatSize(512)).toBe("512 B");
  expect(formatSize(1536)).toBe("1.5 KB");
  expect(formatSize(12 * 1024)).toBe("12 KB");
  expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  expect(formatSize(3 * 1024 ** 3)).toBe("3.0 GB");
});

test("formatMode renders rwx with special bits", () => {
  expect(formatMode(0o755)).toBe("rwxr-xr-x");
  expect(formatMode(0o644)).toBe("rw-r--r--");
  expect(formatMode(0o4755)).toBe("rwsr-xr-x");
  expect(formatMode(0o4644)).toBe("rwSr--r--");
  expect(formatMode(0o1777)).toBe("rwxrwxrwt");
  expect(formatMode(0o2755)).toBe("rwxr-sr-x");
  expect(formatMode(0)).toBe("---------");
});

test("formatOctal pads to four digits", () => {
  expect(formatOctal(0o755)).toBe("0755");
  expect(formatOctal(0o4755)).toBe("4755");
});

test("formatModified formats a unix time and shows a dash for unknown", () => {
  expect(formatModified(1792142400, "en")).toContain("2026");
  expect(formatModified(null, "en")).toBe("—");
});
