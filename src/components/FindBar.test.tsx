import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindBar } from "./FindBar";

test("focuses the search box and searches forward on Enter", async () => {
  const onFind = vi.fn();
  render(<FindBar onFind={onFind} onClose={() => {}} />);
  const box = screen.getByRole("searchbox", { name: "Terminalde ara" });
  expect(box).toHaveFocus();
  await userEvent.type(box, "hata{Enter}");
  expect(onFind).toHaveBeenLastCalledWith("hata", true);
});

test("Shift+Enter searches backwards and the buttons step through matches", async () => {
  const onFind = vi.fn();
  render(<FindBar onFind={onFind} onClose={() => {}} />);
  await userEvent.type(screen.getByRole("searchbox"), "x");
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
  expect(onFind).toHaveBeenLastCalledWith("x", false);
  await userEvent.click(screen.getByRole("button", { name: "Sonraki" }));
  expect(onFind).toHaveBeenLastCalledWith("x", true);
  await userEvent.click(screen.getByRole("button", { name: "Önceki" }));
  expect(onFind).toHaveBeenLastCalledWith("x", false);
});

test("typing searches incrementally and an empty query does not search", async () => {
  const onFind = vi.fn();
  render(<FindBar onFind={onFind} onClose={() => {}} />);
  await userEvent.keyboard("{Enter}");
  expect(onFind).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole("searchbox"), "ab");
  expect(onFind).toHaveBeenCalledWith("a", true);
  expect(onFind).toHaveBeenLastCalledWith("ab", true);
});

test("Escape and the close button close the bar", async () => {
  const onClose = vi.fn();
  render(<FindBar onFind={() => {}} onClose={onClose} />);
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Aramayı kapat" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
