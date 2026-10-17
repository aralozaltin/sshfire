import { IDLE_CHOICES, loadIdleMinutes, saveIdleMinutes } from "./idle";

beforeEach(() => localStorage.clear());

test("the default is never", () => {
  expect(loadIdleMinutes()).toBe(0);
});

test("a chosen value is remembered, unknown values fall back to never", () => {
  saveIdleMinutes(30);
  expect(loadIdleMinutes()).toBe(30);
  localStorage.setItem("ssh-istemci.idleMinutes", "7");
  expect(loadIdleMinutes()).toBe(0);
  localStorage.setItem("ssh-istemci.idleMinutes", "abc");
  expect(loadIdleMinutes()).toBe(0);
});

test("the choices start with off and are increasing", () => {
  expect(IDLE_CHOICES[0]).toBe(0);
  expect([...IDLE_CHOICES].slice(1)).toEqual([...IDLE_CHOICES].slice(1).sort((a, b) => a - b));
});
