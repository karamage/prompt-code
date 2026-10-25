import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeTag } from "../../shared/frontmatter.ts";
import { titleOf } from "../../shared/notes.ts";
import { estimateTokens, extractVariables } from "../../shared/prompt.ts";
import {
  copyNote,
  createNote,
  duplicateNote,
  openMenu,
  openOverlay,
  renameOpenNote,
  reveal,
  setMode,
  setUi,
  setView,
  trashNote,
  updateFrontmatter,
} from "../actions.ts";
import { formatNumber, t } from "../i18n.ts";
import { isFresh, type Mode, setState, useApp } from "../store.ts";
import { Editor } from "./Editor.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { Preview } from "./Preview.tsx";

function TitleInput({ path }: { path: string }) {
  const title = titleOf(path);
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focus = useApp((s) => s.focus);

  useEffect(() => {
    if (focus?.target === "title" && isFresh(focus) && ref.current !== null) {
      ref.current.focus();
      ref.current.select();
    }
  }, [focus]);

  // 長いタイトルは折り返して、高さを中身に合わせる
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="note-title"
      value={value}
      rows={1}
      spellCheck={false}
      placeholder={t().note.untitled}
      onChange={(event) => setValue(event.target.value.replace(/\n/g, ""))}
      onBlur={() => {
        if (value.trim() === "") setValue(title);
        else void renameOpenNote(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "ArrowDown") {
          event.preventDefault();
          void renameOpenNote(value);
          setState({ focus: { target: "editor", at: Date.now() } });
        }
        if (event.key === "Escape") {
          setValue(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** input の size に使う桁数。全角の文字は 2 桁に数える */
function columns(value: string): number {
  return [...value].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1), 0);
}

function TagEditor({ tags }: { tags: string[] }) {
  const [draft, setDraft] = useState("");
  const index = useApp((s) => s.index);
  const text = t().note;
  const all = useMemo(() => {
    const set = new Map<string, string>();
    for (const note of index?.notes ?? [])
      for (const tag of note.tags) set.set(tag.toLowerCase(), tag);
    return [...set.values()].sort();
  }, [index]);

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft("");
    if (tag === "" || tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    updateFrontmatter({ tags: [...tags, tag] });
  };

  return (
    <div className="tag-editor">
      {tags.map((tag) => (
        <span key={tag} className="tag-pill">
          <button
            type="button"
            className="tag-pill-label"
            onClick={() => setView({ kind: "tag", tag })}
          >
            #{tag}
          </button>
          <button
            type="button"
            className="tag-pill-remove"
            aria-label={`Remove ${tag}`}
            onClick={() => updateFrontmatter({ tags: tags.filter((item) => item !== tag) })}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        value={draft}
        list="pc-all-tags"
        placeholder={`+ ${text.addTag}`}
        onChange={(event) => {
          const value = event.target.value;
          if (/[,\s]$/.test(value)) add(value.slice(0, -1));
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
          if (event.key === "Backspace" && draft === "" && tags.length > 0) {
            updateFrontmatter({ tags: tags.slice(0, -1) });
          }
        }}
        onBlur={() => add(draft)}
        size={Math.max(columns(`+ ${text.addTag}`), columns(draft)) + 1}
      />
      <datalist id="pc-all-tags">
        {all.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
}

const MODES: { mode: Mode; icon: IconName }[] = [
  { mode: "write", icon: "write" },
  { mode: "split", icon: "split" },
  { mode: "read", icon: "read" },
];

function StatusBar({ body, status }: { body: string; status: string }) {
  const text = t().note;
  const stats = useMemo(
    () => ({
      tokens: estimateTokens(body),
      chars: [...body].length,
      vars: extractVariables(body).length,
      embeds: (body.match(/!\[\[[^[\]\n]+\]\]/g) ?? []).length,
    }),
    [body],
  );
  return (
    <footer className="status-bar">
      <span title={text.tokens(formatNumber(stats.tokens))}>
        {text.tokens(formatNumber(stats.tokens))}
      </span>
      <span>{text.chars(formatNumber(stats.chars))}</span>
      {stats.vars > 0 && (
        <button
          type="button"
          className="status-var"
          onClick={() => setUi({ showInspector: true, inspectorTab: "use" })}
        >
          {t().list.vars(stats.vars)}
        </button>
      )}
      {stats.embeds > 0 && <span>{t().inspector.embeds(stats.embeds)}</span>}
      <span className={`save-state is-${status}`}>
        <i aria-hidden="true" />
        {status === "saved"
          ? text.saved
          : status === "saving"
            ? text.saving
            : status === "error"
              ? text.saveFailed
              : text.unsaved}
      </span>
    </footer>
  );
}

export function NoteView() {
  const doc = useApp((s) => s.doc);
  const mode = useApp((s) => s.ui.mode);
  const showSidebar = useApp((s) => s.ui.showSidebar);
  const showInspector = useApp((s) => s.ui.showInspector);
  const text = t();

  if (doc === null) return <EmptyNote />;

  const folder = doc.path.includes("/") ? doc.path.slice(0, doc.path.lastIndexOf("/")) : "";
  const { frontmatter } = doc;

  return (
    <section className={`note-pane mode-${mode}`} aria-label={titleOf(doc.path)}>
      <header className="note-bar" data-tauri-drag-region>
        <div className="note-bar-left" data-tauri-drag-region>
          {!showSidebar && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setUi({ showSidebar: true })}
              title="⌘\"
            >
              <Icon name="sidebar" />
            </button>
          )}
          <nav className="crumbs" aria-label="Folder">
            <button type="button" onClick={() => setView({ kind: "all" })}>
              {text.note.rootFolder}
            </button>
            {folder !== "" &&
              folder.split("/").map((part, i, parts) => {
                const path = parts.slice(0, i + 1).join("/");
                return (
                  <span key={path}>
                    <span className="crumb-sep">/</span>
                    <button type="button" onClick={() => setView({ kind: "folder", path })}>
                      {part}
                    </button>
                  </span>
                );
              })}
          </nav>
        </div>
        <div className="note-bar-right">
          <div className="segmented" role="radiogroup" aria-label="Mode">
            {MODES.map(({ mode: value, icon }) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={mode === value}
                className={mode === value ? "is-on" : ""}
                onClick={() => setMode(value)}
                title={`${text.note.modes[value]}  ⌘E`}
              >
                <Icon name={icon} size={14} />
                <span>{text.note.modes[value]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`icon-button fav-toggle${frontmatter.favorite ? " is-on" : ""}`}
            onClick={() => updateFrontmatter({ favorite: !frontmatter.favorite })}
            title={frontmatter.favorite ? text.note.unfavorite : text.note.favorite}
            aria-pressed={frontmatter.favorite}
          >
            <Icon name="star" className={frontmatter.favorite ? "filled" : undefined} />
          </button>
          <button
            type="button"
            className="icon-button"
            title={text.note.more}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu(
                { clientX: rect.right - 200, clientY: rect.bottom + 6, preventDefault() {} },
                [
                  { label: text.menu.copy, run: () => void copyNote(doc.path), shortcut: "⇧⌘C" },
                  {
                    label: text.note.duplicate,
                    run: () => void duplicateNote(doc.path),
                    shortcut: "⌘D",
                  },
                  { label: text.note.reveal, run: () => reveal(doc.path), shortcut: "⌥⌘R" },
                  { label: text.commands.graph, run: () => openOverlay("graph"), shortcut: "⌘G" },
                  {
                    label: text.note.moveToTrash,
                    run: () => void trashNote(doc.path),
                    danger: true,
                    shortcut: "⌘⌫",
                  },
                ],
              );
            }}
          >
            <Icon name="more" />
          </button>
          {!showInspector && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setUi({ showInspector: true })}
              title={text.inspector.use}
            >
              <Icon name="panel" />
            </button>
          )}
        </div>
      </header>

      {doc.missing && <div className="banner">{text.note.missing}</div>}

      <div className="note-scroll">
        <div className="note-body">
          <div className="note-head">
            <TitleInput key={doc.path} path={doc.path} />
            <input
              className="note-description"
              value={frontmatter.description}
              placeholder={text.note.descriptionPlaceholder}
              onChange={(event) => updateFrontmatter({ description: event.target.value })}
            />
            <TagEditor tags={frontmatter.tags} />
          </div>
          <div className="note-content">
            {mode !== "read" && <Editor />}
            {mode !== "write" && <Preview body={doc.body} folder={folder} />}
          </div>
        </div>
      </div>

      <StatusBar body={doc.body} status={doc.status} />
    </section>
  );
}

function EmptyNote() {
  const text = t().note;
  const showSidebar = useApp((s) => s.ui.showSidebar);
  return (
    <section className="note-pane is-empty">
      <header className="note-bar" data-tauri-drag-region>
        {!showSidebar && (
          <button
            type="button"
            className="icon-button"
            onClick={() => setUi({ showSidebar: true })}
          >
            <Icon name="sidebar" />
          </button>
        )}
      </header>
      <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">
          <span>{"{{"}</span>
          <span className="empty-caret" />
          <span>{"}}"}</span>
        </div>
        <h2>{text.emptyTitle}</h2>
        <p>{text.emptyBody}</p>
        <div className="empty-actions">
          <button type="button" className="primary-button" onClick={() => void createNote()}>
            <Icon name="plus" size={14} />
            {text.emptyNew}
            <kbd>⌘N</kbd>
          </button>
          <button type="button" className="ghost-button" onClick={() => openOverlay("palette")}>
            <Icon name="search" size={14} />
            {text.emptySearch}
            <kbd>⌘K</kbd>
          </button>
        </div>
      </div>
    </section>
  );
}
