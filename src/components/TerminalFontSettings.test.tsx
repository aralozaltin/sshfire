import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../i18n";
import { TerminalFontSettings } from "./TerminalFontSettings";
import { loadFontFamily } from "../terminal/font";
import { loadFontSize } from "../terminal/fontSize";

afterEach(() => localStorage.clear());

function setup() {
  return render(<I18nProvider locale="tr"><TerminalFontSettings /></I18nProvider>);
}

test("typing a font saves it", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Terminal yazı tipi"), "Hack Nerd Font");
  expect(loadFontFamily()).toBe("Hack Nerd Font");
});

test("the size is clamped and saved", async () => {
  setup();
  const input = screen.getByLabelText("Yazı boyutu");
  await userEvent.clear(input);
  await userEvent.type(input, "99");
  expect(loadFontSize()).toBe(32);
});

test("reset brings back the defaults", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Terminal yazı tipi"), "Hack");
  await userEvent.click(screen.getByRole("button", { name: "Yazı tipini sıfırla" }));
  expect(loadFontFamily()).toBe("");
  expect(loadFontSize()).toBe(13);
});
