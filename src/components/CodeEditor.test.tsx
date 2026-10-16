import { act, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeEditor } from "./CodeEditor";

const view = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;

test("shows the document and reports edits", async () => {
  const onChange = vi.fn();
  const { container } = render(<CodeEditor path="/etc/app.conf" value={"a=1\n"} onChange={onChange} onSave={() => {}} />);
  expect(view(container).state.doc.toString()).toBe("a=1\n");
  act(() => view(container).dispatch({ changes: { from: 4, insert: "b=2" } }));
  expect(onChange).toHaveBeenLastCalledWith("a=1\nb=2");
});

test("Mod-s saves and does not change the document", () => {
  const onSave = vi.fn();
  const { container } = render(<CodeEditor path="/x.txt" value="hi" onChange={() => {}} onSave={onSave} />);
  const el = container.querySelector(".cm-content") as HTMLElement;
  const e = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(e); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(e.defaultPrevented).toBe(true);
  expect(view(container).state.doc.toString()).toBe("hi");
});

test("shows line numbers", () => {
  const { container } = render(<CodeEditor path="/x.txt" value={"a\nb\nc"} onChange={() => {}} onSave={() => {}} />);
  expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
});

test("reports the cursor position as line and column", () => {
  const onCursor = vi.fn();
  const { container } = render(<CodeEditor path="/x.txt" value={"ab\ncde"} onChange={() => {}} onSave={() => {}} onCursor={onCursor} />);
  act(() => view(container).dispatch({ selection: { anchor: 5 } }));
  expect(onCursor).toHaveBeenLastCalledWith(2, 3);
});

test("wrapping can be switched on and off", () => {
  const { container, rerender } = render(<CodeEditor path="/x.txt" value="a" wrap onChange={() => {}} onSave={() => {}} />);
  expect(container.querySelector(".cm-lineWrapping")).not.toBeNull();
  rerender(<CodeEditor path="/x.txt" value="a" wrap={false} onChange={() => {}} onSave={() => {}} />);
  expect(container.querySelector(".cm-lineWrapping")).toBeNull();
});
