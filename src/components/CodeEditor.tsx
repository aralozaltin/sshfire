import { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { languageId, loadLanguage } from "../editor/languages";

export interface CodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCursor?: (line: number, column: number) => void;
  wrap?: boolean;
  dark?: boolean;
  label?: string;
}

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { fontFamily: 'Menlo, "SF Mono", Consolas, monospace', lineHeight: "1.45" },
});

export function CodeEditor({ path, value, onChange, onSave, onCursor, wrap = false, dark = true, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onSave, onCursor });
  handlers.current = { onChange, onSave, onCursor };
  const wrapping = useRef(new Compartment()).current;
  const theme = useRef(new Compartment()).current;
  const language = useRef(new Compartment()).current;

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        baseTheme,
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => (handlers.current.onSave(), true) },
          indentWithTab,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        theme.of(dark ? oneDark : syntaxHighlighting(defaultHighlightStyle)),
        language.of([]),
        EditorView.contentAttributes.of(label ? { "aria-label": label } : {}),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          if (u.docChanged || u.selectionSet) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            handlers.current.onCursor?.(line.number, head - line.from + 1);
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current as HTMLElement });
    view.current = v;
    const id = languageId(path);
    let alive = true;
    if (id) void loadLanguage(id).then((ext) => alive && ext && v.dispatch({ effects: language.reconfigure(ext) }));
    return () => {
      alive = false;
      v.destroy();
      view.current = null;
    };
    // Belge yalnızca açılışta okunur; sonraki değişiklikler düzenleyicinin kendisinden gelir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap, wrapping]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.reconfigure(dark ? oneDark : syntaxHighlighting(defaultHighlightStyle)) });
  }, [dark, theme]);

  return <div ref={host} className="code-editor" />;
}
