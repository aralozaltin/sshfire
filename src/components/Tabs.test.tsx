import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";

const tabs = [
  { id: "a", title: "Test 3.81", status: "open" as const },
  { id: "b", title: "Prod API", status: "closed" as const },
];

test("renders one tab per connection and marks the active one", () => {
  render(<Tabs tabs={tabs} activeId="b" onSelect={() => {}} onClose={() => {}} />);
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.getByRole("tab", { name: /Prod API/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /Test 3.81/ })).toHaveAttribute("aria-selected", "false");
});

test("selecting a tab calls onSelect", async () => {
  const onSelect = vi.fn();
  render(<Tabs tabs={tabs} activeId="a" onSelect={onSelect} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: /Prod API/ }));
  expect(onSelect).toHaveBeenCalledWith("b");
});

test("the close button closes without selecting", async () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<Tabs tabs={tabs} activeId="a" onSelect={onSelect} onClose={onClose} />);
  await userEvent.click(screen.getByRole("button", { name: "Test 3.81 kapat" }));
  expect(onClose).toHaveBeenCalledWith("a");
  expect(onSelect).not.toHaveBeenCalled();
});

test("shows the empty hint when there are no tabs", () => {
  render(<Tabs tabs={[]} activeId={null} onSelect={() => {}} onClose={() => {}} />);
  expect(screen.getByText("Soldan bir sunucu seç")).toBeInTheDocument();
});

test("right clicking a tab reports which tab and where", () => {
  const onContextMenu = vi.fn();
  render(<Tabs tabs={tabs} activeId="a" onSelect={() => {}} onClose={() => {}} onContextMenu={onContextMenu} />);
  fireEvent.contextMenu(screen.getByRole("tab", { name: /Prod API/ }), { clientX: 40, clientY: 12 });
  expect(onContextMenu).toHaveBeenCalledWith("b", 40, 12);
});
