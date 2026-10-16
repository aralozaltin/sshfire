import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiExecBar } from "./MultiExecBar";

const tabs = [
  { id: "a", title: "Test 3.81" },
  { id: "b", title: "Prod API" },
];

test("is hidden until there are at least two tabs", () => {
  const { container } = render(<MultiExecBar tabs={tabs.slice(0, 1)} enabled={false} selected={[]} onToggle={() => {}} onSelect={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test("the toggle reports the new state and exposes pressed state", async () => {
  const onToggle = vi.fn();
  const { rerender } = render(<MultiExecBar tabs={tabs} enabled={false} selected={[]} onToggle={onToggle} onSelect={() => {}} />);
  const button = screen.getByRole("button", { name: "MultiExec" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(button);
  expect(onToggle).toHaveBeenCalledWith(true);
  rerender(<MultiExecBar tabs={tabs} enabled selected={["a", "b"]} onToggle={onToggle} onSelect={() => {}} />);
  expect(screen.getByRole("button", { name: "MultiExec" })).toHaveAttribute("aria-pressed", "true");
});

test("when enabled each tab has a checkbox that selects or deselects it", async () => {
  const onSelect = vi.fn();
  render(<MultiExecBar tabs={tabs} enabled selected={["a", "b"]} onToggle={() => {}} onSelect={onSelect} />);
  expect(screen.getByRole("checkbox", { name: "Test 3.81" })).toBeChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: "Prod API" }));
  expect(onSelect).toHaveBeenCalledWith(["a"]);
});

test("explains what is happening while enabled", () => {
  render(<MultiExecBar tabs={tabs} enabled selected={["a"]} onToggle={() => {}} onSelect={() => {}} />);
  expect(screen.getByText(/Yazdıkların seçili sekmelere gönderilir/)).toBeInTheDocument();
});
