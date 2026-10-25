import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "../../shared/api.ts";
import type { NoteMeta } from "../../shared/notes.ts";
import { api } from "../api.ts";
import { closeOverlay, createNote, openNote } from "../actions.ts";
import { type Command, paletteCommands } from "../commands.ts";
import { formatRelative, t } from "../i18n.ts";
import { fuzzy } from "../lib/fuzzy.ts";
import { useApp } from "../store.ts";
import { Icon } from "./Icon.tsx";

type Item =
  | { kind: "note"; note: NoteMeta; indices: number[] }
  | { kind: "create"; title: string }
  | { kind: "command"; command: Command; indices: number[] }
  | { kind: "hit"; hit: SearchHit; line: number; text: string; first: boolean };

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  const out: ReactNode[] = [];
  let run = "";
  let on = false;
  const flush = (key: number) => {
    if (run === "") return;
    out.push(on ? <mark key={key}>{run}</mark> : run);
    run = "";
  };
  [...text].forEach((char, i) => {
    const hit = set.has(i);
    if (hit !== on) {
      flush(i);
      on = hit;
    }
    run += char;
  });
  flush(text.length);
  return <>{out}</>;
}

/** 検索語を含むところに印を付ける */
function markTerms(text: string, query: string): ReactNode {
  const terms = query.split(/\s+/).filter((term) => term !== "");
  if (terms.length === 0) return text;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return text.split(pattern).map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: 並びは固定
    i % 2 === 1 ? <mark key={i}>{part}</mark> : part,
  );
}

export function Palette({ mode }: { mode: "palette" | "commands" | "search" }) {
  const index = useApp((s) => s.index);
  const [query, setQuery] = useState(mode === "commands" ? ">" : "");
  const [selected, setSelected] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const text = t().palette;
  const isSearch = mode === "search";
  const isCommand = !isSearch && query.startsWith(">");

  useEffect(() => input.current?.focus(), []);

  // 全文検索はサーバに聞く。打ち終わるのを少し待つ
  useEffect(() => {
    if (!isSearch) return;
    const q = query.trim();
    if (q === "") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.search(q).then((result) => {
        if (!cancelled) setHits(result);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isSearch]);

  const items = useMemo<Item[]>(() => {
    if (isSearch) {
      // 語を消したら、前の結果は出さない
      if (query.trim() === "") return [];
      return hits.flatMap((hit) =>
        hit.matches.length === 0
          ? [{ kind: "hit" as const, hit, line: 1, text: "", first: true }]
          : hit.matches.map((match, i) => ({
              kind: "hit" as const,
              hit,
              line: match.line,
              text: match.text,
              first: i === 0,
            })),
      );
    }
    if (isCommand) {
      const q = query.slice(1).trim();
      return paletteCommands()
        .map((command) => ({ command, match: fuzzy(q, command.label()) }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
        .map((entry) => ({
          kind: "command" as const,
          command: entry.command,
          indices: entry.match?.indices ?? [],
        }));
    }
    const notes = index?.notes ?? [];
    const q = query.trim();
    if (q === "") {
      return [...notes]
        .sort((a, b) => b.updated - a.updated)
        .slice(0, 30)
        .map((note) => ({ kind: "note" as const, note, indices: [] }));
    }
    const matched = notes
      .map((note) => ({
        note,
        match: fuzzy(q, note.title) ?? (fuzzy(q, note.path) && { score: -500, indices: [] }),
      }))
      .filter((entry) => entry.match !== null)
      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
      .slice(0, 50)
      .map((entry) => ({
        kind: "note" as const,
        note: entry.note,
        indices: entry.match?.indices ?? [],
      }));
    const exact = notes.some((note) => note.title.toLowerCase() === q.toLowerCase());
    return exact ? matched : [...matched, { kind: "create" as const, title: q }];
  }, [query, index, hits, isSearch, isCommand]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const run = (item: Item | undefined) => {
    if (item === undefined) return;
    closeOverlay();
    if (item.kind === "note") void openNote(item.note.path);
    else if (item.kind === "create") void createNote(undefined, item.title);
    else if (item.kind === "command") item.command.run();
    else void openNote(item.hit.path, { focus: "editor", line: item.line });
  };

  return (
    <div
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}
    >
      <div className={`palette${isSearch ? " is-search" : ""}`} role="dialog" aria-modal="true">
        <div className="palette-input">
          <Icon name={isCommand ? "command" : "search"} />
          <input
            ref={input}
            value={query}
            placeholder={isSearch ? text.searchPlaceholder : text.placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
                event.preventDefault();
                setSelected((i) => Math.min(items.length - 1, i + 1));
              } else if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
                event.preventDefault();
                setSelected((i) => Math.max(0, i - 1));
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                run(items[selected]);
              }
            }}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {items.length === 0 && query.trim() !== "" && query.trim() !== ">" && (
            <p className="palette-empty">{text.noResults}</p>
          )}
          {items.map((item, i) => {
            const active = i === selected;
            const common = {
              "data-index": i,
              role: "option",
              "aria-selected": active,
              className: `palette-item${active ? " is-active" : ""}`,
              onMouseMove: () => setSelected(i),
              onClick: () => run(item),
            } as const;
            if (item.kind === "note") {
              return (
                <div key={item.note.path} {...common}>
                  <Icon name="note" />
                  <span className="palette-title">
                    <Highlight text={item.note.title} indices={item.indices} />
                  </span>
                  <span className="palette-meta">{item.note.folder}</span>
                  <span className="palette-time">{formatRelative(item.note.updated)}</span>
                </div>
              );
            }
            if (item.kind === "create") {
              return (
                <div key="create" {...common}>
                  <Icon name="plus" />
                  <span className="palette-title">{text.create(item.title)}</span>
                </div>
              );
            }
            if (item.kind === "command") {
              return (
                <div key={item.command.id} {...common}>
                  <Icon name={item.command.icon} />
                  <span className="palette-title">
                    <Highlight text={item.command.label()} indices={item.indices} />
                  </span>
                  {item.command.keys !== undefined && <kbd>{item.command.keys}</kbd>}
                </div>
              );
            }
            const { first } = item;
            return (
              <div
                key={`${item.hit.path}:${item.line}`}
                {...common}
                className={`${common.className} is-hit${first ? " is-first" : ""}`}
              >
                {first ? (
                  <span className="hit-title">
                    <Icon name="note" size={14} />
                    {markTerms(item.hit.title, query)}
                    <span className="palette-meta">{item.hit.folder}</span>
                  </span>
                ) : null}
                {item.text !== "" && (
                  <span className="hit-line">
                    <span className="hit-no">{item.line}</span>
                    <span className="hit-text">{markTerms(item.text, query)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {text.hint.navigate}
          </span>
          <span>
            <kbd>↵</kbd> {text.hint.open}
          </span>
          {!isSearch && (
            <span>
              <kbd>&gt;</kbd> {text.commands}
            </span>
          )}
          <span>
            <kbd>esc</kbd> {text.hint.close}
          </span>
        </div>
      </div>
    </div>
  );
}
