import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { resolveLink } from "../../shared/notes.ts";
import { createNote, openNote, updateBody } from "../actions.ts";
import { editorExtensions, type EditorHooks, lineNumbersSlot } from "../editor/extensions.ts";
import { lineNumbers } from "@codemirror/view";
import { t } from "../i18n.ts";
import { getState, isFresh, useApp } from "../store.ts";

/** 目次から見出しへ飛ぶときなどに使う、いま表示しているエディタ */
export let activeEditor: EditorView | null = null;

const hooks: EditorHooks = {
  notes: () =>
    (getState().index?.notes ?? []).map((note) => ({ title: note.title, folder: note.folder })),
  tags() {
    const tags = new Map<string, string>();
    for (const note of getState().index?.notes ?? []) {
      for (const tag of note.tags) tags.set(tag.toLowerCase(), tag);
    }
    return [...tags.values()];
  },
  variables() {
    const counts = new Map<string, number>();
    for (const note of getState().index?.notes ?? []) {
      for (const name of note.variables) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  },
  openLink(target) {
    const meta = resolveLink(target, getState().index?.notes ?? []);
    if (meta !== null) void openNote(meta.path);
    else void createNote(undefined, target);
  },
  placeholder: () => t().note.editorPlaceholder,
};

export function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const path = useApp((s) => s.doc?.path ?? null);
  const revision = useApp((s) => s.doc?.revision ?? 0);
  const showLineNumbers = useApp((s) => s.settings.lineNumbers);
  const focus = useApp((s) => s.focus);

  // エディタは 1 度だけ作り、ノートが替わったら中身ごと差し替える
  useEffect(() => {
    if (host.current === null) return;
    const editor = new EditorView({ parent: host.current });
    view.current = editor;
    activeEditor = editor;
    return () => {
      editor.destroy();
      view.current = null;
      if (activeEditor === editor) activeEditor = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    const doc = getState().doc;
    if (editor === null || doc === null) return;
    editor.setState(
      EditorState.create({
        doc: doc.body,
        extensions: [
          editorExtensions(hooks, getState().settings.lineNumbers),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) updateBody(update.state.doc.toString());
          }),
        ],
      }),
    );
    editor.scrollDOM.scrollTop = 0;
    // 中身の差し替えは revision で知る。path は名前を変えただけなら作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    view.current?.dispatch({
      effects: lineNumbersSlot.reconfigure(showLineNumbers ? lineNumbers() : []),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    const editor = view.current;
    if (focus?.target !== "editor" || !isFresh(focus) || editor === null) return;
    if (focus.line !== undefined) {
      const line = editor.state.doc.line(Math.max(1, Math.min(focus.line, editor.state.doc.lines)));
      editor.dispatch({
        selection: { anchor: line.from, head: line.to },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
    }
    editor.focus();
  }, [focus]);

  return <div className="editor" ref={host} data-path={path ?? undefined} />;
}
