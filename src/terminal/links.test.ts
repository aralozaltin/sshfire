import { isSafeUrl } from "./links";

test("only http and https links are opened", () => {
  expect(isSafeUrl("https://example.com/a?b=1")).toBe(true);
  expect(isSafeUrl("http://192.168.3.81:9000/")).toBe(true);
  expect(isSafeUrl("HTTPS://EXAMPLE.COM")).toBe(true);
});

test("other schemes and malformed values are refused", () => {
  expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  expect(isSafeUrl("ssh://host")).toBe(false);
  expect(isSafeUrl("data:text/html;base64,AAAA")).toBe(false);
  expect(isSafeUrl("not a url")).toBe(false);
  expect(isSafeUrl("")).toBe(false);
});
