import { act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

export function editorView(): EditorView {
  const el = document.querySelector(".cm-editor") as HTMLElement | null;
  if (!el) throw new Error("no editor on screen");
  return EditorView.findFromDOM(el)!;
}

export const editorText = () => editorView().state.doc.toString();

export function replaceEditorText(text: string): void {
  const view = editorView();
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
}

export function appendEditorText(text: string): void {
  const view = editorView();
  act(() => view.dispatch({ changes: { from: view.state.doc.length, insert: text } }));
}

export function focusEditor(): void {
  const view = editorView();
  act(() => view.focus());
}
