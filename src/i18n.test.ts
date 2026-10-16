import { detectLocale, errorText, loadLocaleSetting, resolveLocale, saveLocaleSetting } from "./i18n";
import { en } from "./locales/en";
import { tr } from "./locales/tr";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function keyShape(o: unknown): unknown {
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, keyShape(v)]));
  }
  return typeof o;
}

test("detectLocale maps tr variants to tr and everything else to en", () => {
  expect(detectLocale("tr")).toBe("tr");
  expect(detectLocale("tr-TR")).toBe("tr");
  expect(detectLocale("en-US")).toBe("en");
  expect(detectLocale("de-DE")).toBe("en");
  expect(detectLocale(undefined)).toBe("en");
});

test("resolveLocale uses the setting unless it is system", () => {
  expect(resolveLocale("system", "tr-TR")).toBe("tr");
  expect(resolveLocale("system", "fr")).toBe("en");
  expect(resolveLocale("en", "tr-TR")).toBe("en");
  expect(resolveLocale("tr", "en-US")).toBe("tr");
});

test("locale setting roundtrips and survives broken storage", () => {
  expect(loadLocaleSetting()).toBe("system");
  saveLocaleSetting("en");
  expect(loadLocaleSetting()).toBe("en");
  localStorage.setItem("ssh-istemci.locale", "klingon");
  expect(loadLocaleSetting()).toBe("system");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(loadLocaleSetting()).toBe("system");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  expect(() => saveLocaleSetting("tr")).not.toThrow();
});

test("en has exactly the same keys and value types as tr", () => {
  expect(keyShape(en)).toEqual(keyShape(tr));
});

test("errorText translates backend error codes in both languages", () => {
  const changed = { code: "host_key_changed", previous: "SHA256:eski", current: "SHA256:yeni" };
  expect(errorText(tr, changed)).toContain("SHA256:eski");
  expect(errorText(en, changed)).toContain("SHA256:yeni");
  expect(errorText(tr, { code: "auth_failed" })).toBe("Kimlik doğrulama başarısız.");
  expect(errorText(en, { code: "auth_failed" })).toBe("Authentication failed.");
  expect(errorText(en, { code: "unreachable", detail: "timeout" })).toContain("timeout");
});

test("errorText falls back to plain strings and unknown codes without throwing", () => {
  expect(errorText(en, "düz metin")).toBe("düz metin");
  expect(errorText(en, { code: "from_the_future", detail: "x" })).toContain("x");
  expect(errorText(en, undefined)).toBe(en.errors.unknown);
});

test("the new authentication error codes are translated in both languages", () => {
  expect(errorText(tr, { code: "wrong_passphrase" })).toBe("Anahtar parolası yanlış.");
  expect(errorText(en, { code: "wrong_passphrase" })).toBe("The key passphrase is wrong.");
  expect(errorText(en, { code: "agent_unavailable", detail: "no socket" })).toContain("no socket");
  expect(errorText(tr, { code: "auth_cancelled" })).toBe("Doğrulamadan vazgeçildi.");
  expect(errorText(en, { code: "passphrase_required" })).toContain("passphrase");
});
