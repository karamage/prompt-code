import { useEffect, useMemo, useRef, useState } from "react";
import { extractLinks, resolveLink, titleOf } from "../../shared/notes.ts";
import {
  estimateTokens,
  extractVariables,
  type PromptVariable,
  resolveEmbeds,
} from "../../shared/prompt.ts";
import {
  clearValues,
  compileFor,
  copyCompiled,
  createNote,
  noteLookup,
  openNote,
  setUi,
  setValue,
} from "../actions.ts";
import { formatNumber, t } from "../i18n.ts";
import { type InspectorTab, getState, useApp } from "../store.ts";
import { activeEditor } from "./Editor.tsx";
import { Icon } from "./Icon.tsx";
import { useEmbedSources } from "./Preview.tsx";

/** 使うパネルのコピー。⌘↵ を入力欄の中で押したときに呼ぶ */
export const usePanelCopy: { current: (() => void) | null } = { current: null };

/** 値の前後に付ける印。結果の中で、埋めた値に色を付けるのに使う */
const OPEN = "\u0001";
const CLOSE = "\u0002";
/** まだ埋めていない変数の前後に付ける印 */
const HOLE_OPEN = "\u0003";
const HOLE_CLOSE = "\u0004";

function Field({
  variable,
  value,
  onChange,
}: {
  variable: PromptVariable;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const filled = value !== "" || variable.defaultValue !== "";
  return (
    <div className={`var-field${filled ? " is-filled" : ""}`}>
      <label className="var-name" htmlFor={`var-${variable.name}`}>
        <span className="var-brace">{"{{"}</span>
        {variable.name}
        <span className="var-brace">{"}}"}</span>
      </label>
      {variable.options.length > 0 ? (
        <div className="var-options" role="radiogroup" aria-label={variable.name}>
          {variable.options.map((option, i) => {
            const selected = value === "" ? i === 0 : value === option;
            return (
              <button
                type="button"
                key={option}
                role="radio"
                aria-checked={selected}
                className={selected ? "is-on" : ""}
                data-var-field={i === 0 ? "" : undefined}
                onClick={() => onChange(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={`var-${variable.name}`}
          className="var-input"
          rows={1}
          value={value}
          data-var-field=""
          placeholder={
            variable.defaultValue === "" ? t().inspector.valuePlaceholder : variable.defaultValue
          }
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/** できあがりの文字列を、埋めた値・埋めていない変数・そのほかに分けて描く */
function Result({ text, flash }: { text: string; flash: number }) {
  const parts = useMemo(() => {
    const out: { kind: "text" | "value" | "hole"; text: string }[] = [];
    const pattern = new RegExp(`(${OPEN}[\\s\\S]*?${CLOSE}|${HOLE_OPEN}[\\s\\S]*?${HOLE_CLOSE})`);
    for (const piece of text.split(pattern)) {
      if (piece === "") continue;
      if (piece.startsWith(OPEN)) out.push({ kind: "value", text: piece.slice(1, -1) });
      else if (piece.startsWith(HOLE_OPEN)) out.push({ kind: "hole", text: piece.slice(1, -1) });
      else out.push({ kind: "text", text: piece });
    }
    return out;
  }, [text]);

  return (
    <pre className="use-result" key={flash}>
      {parts.map((part, i) =>
        part.kind === "text" ? (
          part.text
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 並びは描くたびに作り直す
          <mark key={i} className={part.kind === "value" ? "is-value" : "is-hole"}>
            {part.text}
          </mark>
        ),
      )}
    </pre>
  );
}

function UsePanel() {
  const doc = useApp((s) => s.doc);
  const values = useApp((s) => (s.doc === null ? undefined : s.values[s.doc.path]));
  const copiedAt = useApp((s) => s.copiedAt);
  const stripComments = useApp((s) => s.settings.stripComments);
  const body = doc?.body ?? "";
  const sources = useEmbedSources(body);
  const notes = useApp((s) => s.index?.notes);
  const text = t().inspector;
  const [copied, setCopied] = useState(false);

  const path = doc?.path ?? "";
  const lookup = useMemo(
    () => noteLookup(sources, notes, { path, body }),
    [sources, notes, path, body],
  );
  const variables = useMemo(() => extractVariables(resolveEmbeds(body, lookup)), [body, lookup]);

  const current = useMemo(() => values ?? {}, [values]);
  // 印つきで組み立て、表示ではそれを色に、コピーでは印を外す
  const marked = useMemo(() => {
    const wrapped: Record<string, string> = {};
    for (const variable of variables) {
      const value = current[variable.name] ?? "";
      const effective = value !== "" ? value : variable.defaultValue;
      wrapped[variable.name] =
        effective !== ""
          ? `${OPEN}${effective}${CLOSE}`
          : `${HOLE_OPEN}{{${variable.name}}}${HOLE_CLOSE}`;
    }
    return compileFor(body, wrapped, lookup, !stripComments);
  }, [body, variables, current, lookup, stripComments]);
  // 埋めていない変数は {{名前}} のまま送る。送り先で気づけるように
  // eslint-disable-next-line no-control-regex -- 印に使った制御文字を外す
  const plain = marked.replace(/[\u0001-\u0004]/g, "");
  const unfilled = variables.filter(
    (v) => (current[v.name] ?? "") === "" && v.defaultValue === "",
  ).length;
  const tokens = estimateTokens(plain);

  const copy = () => {
    void copyCompiled(plain).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  useEffect(() => {
    usePanelCopy.current = copy;
    return () => {
      usePanelCopy.current = null;
    };
  });

  if (doc === null) return null;
  const progress = variables.length === 0 ? 1 : (variables.length - unfilled) / variables.length;

  return (
    <div className="use-panel">
      {variables.length === 0 ? (
        <div className="panel-empty">
          <p>{text.noVariables}</p>
          <p className="muted">{text.noVariablesHint}</p>
        </div>
      ) : (
        <>
          <div className="use-progress" style={{ ["--progress" as string]: progress }}>
            <span>{unfilled === 0 ? text.ready : text.unfilled(unfilled)}</span>
            <button
              type="button"
              className="text-button small"
              onClick={() => clearValues(doc.path)}
              disabled={values === undefined}
            >
              {text.reset}
            </button>
          </div>
          <div className="var-fields">
            {variables.map((variable) => (
              <Field
                key={variable.name}
                variable={variable}
                value={current[variable.name] ?? ""}
                onChange={(value) => setValue(doc.path, variable.name, value)}
              />
            ))}
          </div>
        </>
      )}

      <div className="use-result-wrap">
        <div className="use-result-head">
          <span>{text.result}</span>
          <span className="muted">{t().note.tokens(formatNumber(tokens))}</span>
        </div>
        <Result text={marked} flash={copiedAt} />
      </div>

      <div className="use-foot">
        <button type="button" className={`copy-button${copied ? " is-done" : ""}`} onClick={copy}>
          <span className="copy-icon">
            <Icon name={copied ? "check" : "copy"} />
          </span>
          <span>{copied ? text.copied : text.copy}</span>
          <kbd>⌘↵</kbd>
        </button>
      </div>
    </div>
  );
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

function headingsOf(body: string): Heading[] {
  const headings: Heading[] = [];
  let fence: string | null = null;
  body.split("\n").forEach((line, i) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker !== undefined && (fence === null || marker.startsWith(fence))) {
      fence = fence === null ? marker : null;
      return;
    }
    if (fence !== null) return;
    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match !== null)
      headings.push({ level: match[1]?.length ?? 1, text: match[2] ?? "", line: i + 1 });
  });
  return headings;
}

function OutlinePanel() {
  const body = useApp((s) => s.doc?.body ?? "");
  const headings = useMemo(() => headingsOf(body), [body]);
  if (headings.length === 0) return <p className="panel-empty muted">{t().inspector.noHeadings}</p>;
  const min = Math.min(...headings.map((h) => h.level));
  return (
    <ol className="outline">
      {headings.map((heading, i) => (
        <li key={`${heading.line}`} style={{ paddingLeft: `${(heading.level - min) * 14}px` }}>
          <button
            type="button"
            className={`outline-item level-${heading.level}`}
            onClick={() => {
              const editor = activeEditor;
              if (editor !== null && getState().ui.mode !== "read" && editor.dom.isConnected) {
                const line = editor.state.doc.line(Math.min(heading.line, editor.state.doc.lines));
                editor.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
                editor.focus();
              } else {
                document
                  .getElementById(`pc-h-${i}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            {heading.text}
          </button>
        </li>
      ))}
    </ol>
  );
}

function LinksPanel() {
  const doc = useApp((s) => s.doc);
  const index = useApp((s) => s.index);
  const text = t().inspector;
  const body = doc?.body ?? "";
  const { backlinks, outgoing } = useMemo(() => {
    const notes = index?.notes ?? [];
    const title = doc === null ? "" : titleOf(doc.path).toLowerCase();
    const pathKey = doc?.path.toLowerCase().replace(/\.md$/, "") ?? "";
    return {
      backlinks: notes.filter(
        (note) =>
          note.path !== doc?.path &&
          note.links.some((link) => link.toLowerCase() === title || link.toLowerCase() === pathKey),
      ),
      outgoing: extractLinks(body).map((target) => ({ target, meta: resolveLink(target, notes) })),
    };
  }, [index, doc, body]);

  return (
    <div className="links-panel">
      <h3>{text.backlinks}</h3>
      {backlinks.length === 0 ? (
        <p className="muted small">{text.noBacklinks}</p>
      ) : (
        <ul className="link-list">
          {backlinks.map((note) => (
            <li key={note.path}>
              <button type="button" onClick={() => void openNote(note.path)}>
                <Icon name="note" size={14} />
                <span>{note.title}</span>
                <span className="muted">{note.folder}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{text.outgoing}</h3>
      {outgoing.length === 0 ? (
        <p className="muted small">{text.noOutgoing}</p>
      ) : (
        <ul className="link-list">
          {outgoing.map(({ target, meta }) => (
            <li key={target}>
              <button
                type="button"
                className={meta === null ? "is-missing" : ""}
                onClick={() =>
                  meta === null ? void createNote(undefined, target) : void openNote(meta.path)
                }
              >
                <Icon name={meta === null ? "plus" : "link"} size={14} />
                <span>{target}</span>
                {meta === null && <span className="muted">{text.missingNote}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS: { id: InspectorTab; icon: "braces" | "outline" | "link" }[] = [
  { id: "use", icon: "braces" },
  { id: "outline", icon: "outline" },
  { id: "links", icon: "link" },
];

export function Inspector() {
  const tab = useApp((s) => s.ui.inspectorTab);
  const hasDoc = useApp((s) => s.doc !== null);
  const varCount = useApp((s) =>
    s.doc === null
      ? 0
      : (s.index?.notes.find((n) => n.path === s.doc?.path)?.variables.length ?? 0),
  );
  const text = t().inspector;
  return (
    <aside className="inspector" aria-label={text[tab]}>
      <header className="inspector-head" data-tauri-drag-region>
        <div className="tabs" role="tablist">
          {TABS.map(({ id, icon }) => (
            <button
              type="button"
              role="tab"
              key={id}
              aria-selected={tab === id}
              className={tab === id ? "is-on" : ""}
              onClick={() => setUi({ inspectorTab: id })}
            >
              <Icon name={icon} size={14} />
              {text[id]}
              {id === "use" && varCount > 0 && <span className="tab-badge">{varCount}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setUi({ showInspector: false })}
          title="Hide"
        >
          <Icon name="panel" />
        </button>
      </header>
      <div className="inspector-body">
        {!hasDoc ? null : tab === "use" ? (
          <UsePanel />
        ) : tab === "outline" ? (
          <OutlinePanel />
        ) : (
          <LinksPanel />
        )}
      </div>
    </aside>
  );
}
