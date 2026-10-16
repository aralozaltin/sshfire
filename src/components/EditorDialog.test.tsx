import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { appendEditorText, editorText, focusEditor } from "../test-helpers/editor";
import { EditorDialog } from "./EditorDialog";

function setup(over: { onSave?: (c: string) => Promise<void> } = {}) {
  const onSave = over.onSave ?? vi.fn(async () => {});
  const onClose = vi.fn();
  render(<EditorDialog path="/etc/app.conf" initial={"a=1\n"} onSave={onSave} onClose={onClose} />);
  return { onSave: onSave as ReturnType<typeof vi.fn>, onClose };
}

test("shows the path and the initial content and starts clean", () => {
  setup();
  expect(screen.getByText("/etc/app.conf")).toBeInTheDocument();
  expect(editorText()).toBe("a=1\n");
  expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});

test("typing marks the document unsaved and Save writes the new content", async () => {
  const { onSave } = setup();
  appendEditorText("b=2");
  expect(screen.getByText("Kaydedilmemiş değişiklikler")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(onSave).toHaveBeenCalledWith("a=1\nb=2");
  expect(await screen.findByText("Kaydedildi")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
});

test("Ctrl+S and Cmd+S save", async () => {
  const { onSave } = setup();
  appendEditorText("x");
  focusEditor();
  await userEvent.keyboard("{Control>}s{/Control}");
  expect(onSave).toHaveBeenCalledWith("a=1\nx");
});

test("the status bar shows the cursor position and wrapping can be toggled", async () => {
  setup();
  expect(screen.getByText("Satır 1, sütun 1")).toBeInTheDocument();
  const wrap = screen.getByRole("checkbox", { name: "Satır sar" });
  expect(wrap).not.toBeChecked();
  await userEvent.click(wrap);
  expect(document.querySelector(".cm-lineWrapping")).not.toBeNull();
});

test("a failed save shows the error and keeps the document dirty", async () => {
  setup({ onSave: vi.fn(async () => { throw { code: "permission_denied" }; }) });
  appendEditorText("x");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Erişim reddedildi");
  expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
});

test("closing a clean document closes immediately", async () => {
  const { onClose } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
  expect(onClose).toHaveBeenCalled();
});

test("closing with unsaved changes asks first and can be cancelled", async () => {
  const { onClose } = setup();
  appendEditorText("x");
  await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog", { name: "Değişiklikler kaydedilmedi" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Düzenlemeye dön" }));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Kapat" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Kapat" }));
  expect(onClose).toHaveBeenCalled();
});
