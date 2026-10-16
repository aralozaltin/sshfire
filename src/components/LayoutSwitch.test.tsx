import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutSwitch } from "./LayoutSwitch";

test("is hidden with fewer than two tabs", () => {
  const { container } = render(<LayoutSwitch tabCount={1} layout="single" onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("offers the four layouts and marks the current one", () => {
  render(<LayoutSwitch tabCount={2} layout="cols" onChange={() => {}} />);
  for (const name of ["Tek", "Yan yana", "Alt alta", "Izgara"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Yan yana" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Tek" })).toHaveAttribute("aria-pressed", "false");
});

test("choosing a layout reports it", async () => {
  const onChange = vi.fn();
  render(<LayoutSwitch tabCount={3} layout="single" onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "Izgara" }));
  expect(onChange).toHaveBeenCalledWith("grid");
});
