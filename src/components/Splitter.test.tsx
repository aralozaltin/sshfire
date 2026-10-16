import { fireEvent, render, screen } from "@testing-library/react";
import { Splitter } from "./Splitter";

function setup(width = 250) {
  const onChange = vi.fn();
  render(<Splitter width={width} onChange={onChange} />);
  return { onChange, bar: screen.getByRole("separator", { name: "Kenar çubuğu genişliği" }) };
}

test("exposes its current value for assistive technology", () => {
  const { bar } = setup(250);
  expect(bar).toHaveAttribute("aria-valuenow", "250");
  expect(bar).toHaveAttribute("aria-orientation", "vertical");
});

test("dragging with the mouse resizes relative to where the drag started", () => {
  const { onChange, bar } = setup(250);
  fireEvent.mouseDown(bar, { clientX: 250 });
  fireEvent.mouseMove(window, { clientX: 310 });
  expect(onChange).toHaveBeenLastCalledWith(310);
  fireEvent.mouseMove(window, { clientX: 100 });
  expect(onChange).toHaveBeenLastCalledWith(180);
  fireEvent.mouseUp(window);
  onChange.mockClear();
  fireEvent.mouseMove(window, { clientX: 400 });
  expect(onChange).not.toHaveBeenCalled();
});

test("arrow keys resize in small steps, shift in large steps", () => {
  const { onChange, bar } = setup(250);
  fireEvent.keyDown(bar, { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith(266);
  fireEvent.keyDown(bar, { key: "ArrowLeft" });
  expect(onChange).toHaveBeenLastCalledWith(234);
  fireEvent.keyDown(bar, { key: "ArrowRight", shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith(314);
});

test("double clicking restores the default width", () => {
  const { onChange, bar } = setup(400);
  fireEvent.doubleClick(bar);
  expect(onChange).toHaveBeenLastCalledWith(250);
});
