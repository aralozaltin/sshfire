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

test("a tab with a color label gets a stripe in that color", () => {
  render(<Tabs tabs={[{ id: "a", title: "Prod", status: "open", color: "#ef4444" }, { id: "b", title: "Dev", status: "open" }]} activeId="a" onSelect={() => {}} onClose={() => {}} />);
  expect(screen.getByRole("tab", { name: /Prod/ })).toHaveStyle({ borderTopColor: "#ef4444" });
  expect(screen.getByRole("tab", { name: /Dev/ }).style.borderTopColor).toBe("");
});

describe("reordering by dragging", () => {
  const three = [
    { id: "a", title: "Alfa", status: "open" as const },
    { id: "b", title: "Beta", status: "open" as const },
    { id: "c", title: "Gama", status: "open" as const },
  ];
  const dt = () => ({ setData: () => {}, getData: () => "", effectAllowed: "", dropEffect: "" });
  const item = (name: string) => screen.getByRole("tab", { name: new RegExp(name) }).closest(".tabs__item") as HTMLElement;

  test("dropping a tab on another asks to move it to that position", () => {
    const onReorder = vi.fn();
    render(<Tabs tabs={three} activeId="a" onSelect={() => {}} onClose={() => {}} onReorder={onReorder} />);
    fireEvent.dragStart(item("Alfa"), { dataTransfer: dt() });
    fireEvent.dragOver(item("Gama"), { dataTransfer: dt() });
    fireEvent.drop(item("Gama"), { dataTransfer: dt() });
    expect(onReorder).toHaveBeenCalledWith("a", "c");
  });

  test("dropping a tab on itself does nothing", () => {
    const onReorder = vi.fn();
    render(<Tabs tabs={three} activeId="a" onSelect={() => {}} onClose={() => {}} onReorder={onReorder} />);
    fireEvent.dragStart(item("Beta"), { dataTransfer: dt() });
    fireEvent.drop(item("Beta"), { dataTransfer: dt() });
    expect(onReorder).not.toHaveBeenCalled();
  });

  test("the tab under the pointer is highlighted while dragging and cleared afterwards", () => {
    render(<Tabs tabs={three} activeId="a" onSelect={() => {}} onClose={() => {}} onReorder={() => {}} />);
    fireEvent.dragStart(item("Alfa"), { dataTransfer: dt() });
    fireEvent.dragOver(item("Beta"), { dataTransfer: dt() });
    expect(item("Beta")).toHaveClass("is-drop-target");
    fireEvent.dragEnd(item("Alfa"));
    expect(item("Beta")).not.toHaveClass("is-drop-target");
  });

  test("tabs are not draggable when nothing handles the reorder", () => {
    render(<Tabs tabs={three} activeId="a" onSelect={() => {}} onClose={() => {}} />);
    expect(item("Alfa")).not.toHaveAttribute("draggable", "true");
  });
});
