/**
 * クイックペースト。どのアプリからでもグローバルショートカットで出す小さなウィンドウ。
 * クリップボードの履歴とプロンプトを選び、元のアプリへそのまま貼り付ける
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ClipboardItem, CompiledNote, DesktopStatus } from "../shared/api.ts";
import type { NoteMeta } from "../shared/notes.ts";
import { defaultSettings, type Settings } from "../shared/settings.ts";
import { api } from "./api.ts";
import { applyAppearance } from "./appearance.ts";
import { Icon, Mark } from "./components/Icon.tsx";
import { formatNumber, formatRelative, t } from "./i18n.ts";
import { fuzzy } from "./lib/fuzzy.ts";
import "./styles.css";

type Tab = "history" | "prompts";

type Row =
  | { kind: "clip"; key: string; item: ClipboardItem }
  | { kind: "note"; key: string; note: NoteMeta; indices: number[] };

interface FillState {
  note: NoteMeta;
  compiled: CompiledNote;
  values: Record<string, string>;
}

function firstLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 印を付けた文字を太くする */
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  return (
    <>
      {[...text].map((char, i) =>
        set.has(i) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 文字の位置がそのまま鍵になる
          <mark key={i}>{char}</mark>
        ) : (
          char
        ),
      )}
    </>
  );
}

function Picker() {
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [desktop, setDesktop] = useState<DesktopStatus | null>(null);
  const [history, setHistory] = useState<ClipboardItem[]>([]);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [tab, setTab] = useState<Tab>("history");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [fill, setFill] = useState<FillState | null>(null);
  const [preview, setPreview] = useState<CompiledNote | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const text = t().picker;

  /** 開くたびに読み直し、検索語と選択を最初に戻す */
  const reload = useCallback(async () => {
    const [nextSettings, clips, index, status] = await Promise.all([
      api.settings(),
      api.clipboard(),
      api.vault(),
      api.desktop().catch(() => null),
    ]);
    applyAppearance(nextSettings);
    setSettings(nextSettings);
    setHistory(clips);
    setNotes(index.notes);
    setDesktop(status);
    setQuery("");
    setSelected(0);
    setFill(null);
    input.current?.focus();
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    if (tab === "history") {
      return history
        .filter((item) => q === "" || item.text.toLowerCase().includes(q))
        .map((item) => ({ kind: "clip", key: item.id, item }));
    }
    if (q === "") {
      return [...notes]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updated - a.updated)
        .map((note) => ({ kind: "note", key: note.path, note, indices: [] }));
    }
    return notes
      .map((note) => ({
        note,
        match:
          fuzzy(q, note.title) ?? (fuzzy(q, note.tags.join(" ")) && { score: -100, indices: [] }),
      }))
      .filter((entry) => entry.match !== null)
      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
      .map((entry) => ({
        kind: "note",
        key: entry.note.path,
        note: entry.note,
        indices: entry.match?.indices ?? [],
      }));
  }, [tab, query, history, notes]);

  const current = rows[Math.min(selected, rows.length - 1)];

  // プロンプトは、貼り付けるものをそのまま右に見せる（既定値で埋めた形）
  useEffect(() => {
    if (current?.kind !== "note" || fill !== null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.compile(current.note.path, {}).then((compiled) => {
        if (!cancelled) setPreview(compiled);
      });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [current, fill]);

  // 埋めている途中は、値に合わせて組み立て直す
  useEffect(() => {
    if (fill === null) return;
    const timer = setTimeout(() => {
      void api
        .compile(fill.note.path, fill.values)
        .then((compiled) =>
          setFill((state) =>
            state === null || state.note.path !== fill.note.path ? state : { ...state, compiled },
          ),
        );
    }, 120);
    return () => clearTimeout(timer);
    // compiled を変えるたびに走らないよう、値だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.values, fill?.note.path]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const activate = async (row: Row | undefined, paste: boolean) => {
    if (row === undefined) return;
    if (row.kind === "clip") {
      await api.useClip(row.item.id, paste);
      return;
    }
    const compiled = await api.compile(row.note.path, {});
    if (compiled.variables.length === 0) {
      await api.useNote(row.note.path, {}, paste);
      return;
    }
    // 変数があれば、その場で埋めてもらう
    setFill({
      note: row.note,
      compiled,
      // 選択肢は最初のものを選んでおく。文字の欄は空にして、既定値は薄く見せる（空なら既定値で埋まる）
      values: Object.fromEntries(
        compiled.variables.map((v) => [v.name, v.options.length > 0 ? v.defaultValue : ""]),
      ),
    });
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-fill-field]")?.focus());
  };

  const submitFill = (paste: boolean) => {
    if (fill !== null) void api.useNote(fill.note.path, fill.values, paste);
  };

  const remove = async (row: Row | undefined) => {
    if (row?.kind !== "clip") return;
    await api.removeClip(row.item.id);
    setHistory((items) => items.filter((item) => item.id !== row.item.id));
  };

  const close = () => void api.hidePicker();

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      event.preventDefault();
      if (fill !== null) {
        setFill(null);
        input.current?.focus();
      } else close();
      return;
    }
    if (fill !== null) {
      // 埋めている途中: ↵ で貼り付け、⇧↵ は改行、⌘↵ はコピーだけ
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitFill(!mod);
      }
      return;
    }
    if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
      event.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
      event.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (event.key === "Tab") {
      event.preventDefault();
      setTab((value) => (value === "history" ? "prompts" : "history"));
      setSelected(0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void activate(current, !mod);
    } else if (mod && event.key === "Backspace") {
      event.preventDefault();
      void remove(current);
    } else if (mod && /^[1-9]$/.test(event.key)) {
      // ⌘1〜⌘9 で、その番号の行をすぐ貼り付ける（Clipy の数字キーと同じ）
      event.preventDefault();
      void activate(rows[Number(event.key) - 1], true);
    }
  };

  const showHint =
    settings.autoPaste && desktop?.desktop === true && desktop.accessibility === false;

  return (
    <div className="picker" onKeyDown={onKeyDown} role="dialog" aria-label="Quick Paste">
      <header className="picker-head">
        <Mark size={22} />
        <input
          ref={input}
          className="picker-search"
          value={query}
          placeholder={text.placeholder}
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
            setFill(null);
          }}
        />
        <div className="segmented" role="tablist">
          {(["history", "prompts"] as const).map((value) => (
            <button
              type="button"
              role="tab"
              key={value}
              aria-selected={tab === value}
              className={tab === value ? "is-on" : ""}
              tabIndex={-1}
              onClick={() => {
                setTab(value);
                setSelected(0);
                setFill(null);
                input.current?.focus();
              }}
            >
              <Icon name={value === "history" ? "clock" : "slot"} size={14} />
              {value === "history" ? text.history : text.prompts}
            </button>
          ))}
        </div>
      </header>

      <div className="picker-body">
        <ul className="picker-list" ref={list} role="listbox">
          {rows.length === 0 && (
            <li className="picker-empty">
              {tab === "history" ? text.emptyHistory : text.emptyPrompts}
            </li>
          )}
          {rows.map((row, i) => (
            <li
              key={row.key}
              data-index={i}
              role="option"
              aria-selected={i === selected}
              className={`picker-row${i === selected ? " is-active" : ""}`}
              onMouseMove={() => setSelected(i)}
              onClick={() => void activate(row, true)}
            >
              <span className="picker-no">{i < 9 ? `⌘${i + 1}` : ""}</span>
              {row.kind === "clip" ? (
                <>
                  <span className="picker-text">{firstLine(row.item.text)}</span>
                  <time className="picker-meta">{formatRelative(row.item.at)}</time>
                </>
              ) : (
                <>
                  <span className="picker-text">
                    {row.note.favorite && (
                      <Icon name="star" size={12} className="filled picker-fav" />
                    )}
                    <Highlight text={row.note.title} indices={row.indices} />
                  </span>
                  {row.note.variables.length > 0 && (
                    <span className="var-count">{`{{${row.note.variables.length}}}`}</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <section className="picker-preview" aria-live="polite">
          {fill !== null ? (
            <div className="picker-fill">
              <h2>{fill.note.title}</h2>
              <div className="var-fields">
                {fill.compiled.variables.map((variable, i) => (
                  <div key={variable.name} className="var-field is-filled">
                    <label className="var-name" htmlFor={`fill-${variable.name}`}>
                      <span className="var-brace">{"{{"}</span>
                      {variable.name}
                      <span className="var-brace">{"}}"}</span>
                    </label>
                    {variable.options.length > 0 ? (
                      <div className="var-options">
                        {variable.options.map((option) => (
                          <button
                            type="button"
                            key={option}
                            className={fill.values[variable.name] === option ? "is-on" : ""}
                            data-fill-field={
                              i === 0 && option === variable.options[0] ? "" : undefined
                            }
                            onClick={() =>
                              setFill({
                                ...fill,
                                values: { ...fill.values, [variable.name]: option },
                              })
                            }
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        id={`fill-${variable.name}`}
                        className="var-input"
                        rows={1}
                        spellCheck={false}
                        data-fill-field={i === 0 ? "" : undefined}
                        value={fill.values[variable.name] ?? ""}
                        placeholder={
                          variable.defaultValue === ""
                            ? t().inspector.valuePlaceholder
                            : variable.defaultValue
                        }
                        onChange={(event) =>
                          setFill({
                            ...fill,
                            values: { ...fill.values, [variable.name]: event.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <pre className="picker-pre">{fill.compiled.text}</pre>
            </div>
          ) : current?.kind === "clip" ? (
            <>
              <pre className="picker-pre">{current.item.text}</pre>
              <p className="picker-preview-meta">
                {text.chars(formatNumber([...current.item.text].length))}
              </p>
            </>
          ) : current?.kind === "note" ? (
            <>
              <h2>{current.note.title}</h2>
              {current.note.description !== "" && (
                <p className="picker-description">{current.note.description}</p>
              )}
              <pre className="picker-pre">{preview?.text ?? ""}</pre>
            </>
          ) : null}
        </section>
      </div>

      {showHint && <p className="picker-hint">{text.accessibility}</p>}

      <footer className="picker-foot">
        {fill !== null ? (
          <>
            <span>
              <kbd>↵</kbd> {text.paste}
            </span>
            <span>
              <kbd>⌘↵</kbd> {text.copyOnly}
            </span>
            <span>
              <kbd>esc</kbd> {text.back}
            </span>
          </>
        ) : (
          <>
            <span>
              <kbd>↵</kbd>{" "}
              {current?.kind === "note" && current.note.variables.length > 0
                ? text.fill
                : text.paste}
            </span>
            <span>
              <kbd>⌘↵</kbd> {text.copyOnly}
            </span>
            {tab === "history" && (
              <span>
                <kbd>⌘⌫</kbd> {text.remove}
              </span>
            )}
            <span>
              <kbd>tab</kbd> {text.switchTab}
            </span>
            <span>
              <kbd>esc</kbd> {text.close}
            </span>
          </>
        )}
      </footer>
    </div>
  );
}

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <Picker />
    </StrictMode>,
  );
}
