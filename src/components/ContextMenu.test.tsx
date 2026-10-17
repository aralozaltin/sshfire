import { act, render, screen } from "@testing-library/react";
import { ContextMenu } from "./ContextMenu";

const items = [{ label: "Birinci", onClick: () => {} }];

test("the click that opened the menu, still bubbling to the window, does not close it", () => {
  const onClose = vi.fn();
  render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
  act(() => { window.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("menu")).toBeInTheDocument();
});

test("a later click anywhere closes it, and so does Escape", async () => {
  const onClose = vi.fn();
  render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  act(() => { window.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("choosing an item closes the menu and runs the action", async () => {
  const onClose = vi.fn();
  const action = vi.fn();
  render(<ContextMenu x={0} y={0} items={[{ label: "Çalıştır", onClick: action }]} onClose={onClose} />);
  screen.getByRole("menuitem", { name: "Çalıştır" }).click();
  expect(action).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
