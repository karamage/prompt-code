import { memo, useEffect, useRef } from "react";
import type { ClipboardItem, TrashEntry } from "../../shared/api.ts";
import type { NoteMeta } from "../../shared/notes.ts";
import type { SortKey } from "../../shared/settings.ts";
import {
  clearClipboard,
  copyCompiled,
  copyNote,
  createNote,
  deleteForever,
  duplicateNote,
  loadClipboard,
  openMenu,
  openNote,
  removeClip,
  restoreNote,
  reveal,
  saveClipAsNote,
  setFavorite,
  trashNote,
  updateSettings,
  viewTitle,
  visibleNotes,
} from "../actions.ts";
import { formatNumber, formatRelative, t } from "../i18n.ts";
import { isFresh, setState, useApp } from "../store.ts";
import { shortcutLabel } from "./Chrome.tsx";
import { Icon } from "./Icon.tsx";
import { DRAG_TYPE } from "./Sidebar.tsx";

const NoteItem = memo(function NoteItem({
  note,
  active,
  showFolder,
}: {
  note: NoteMeta;
  active: boolean;
  showFolder: boolean;
}) {
  const text = t();
  const summary = note.description !== "" ? note.description : note.excerpt;
  return (
    <li
      className={`note-item${active ? " is-active" : ""}`}
      data-path={note.path}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, note.path);
        event.dataTransfer.setData("text/plain", `[[${note.title}]]`);
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={() => void openNote(note.path)}
      onContextMenu={(event) =>
        openMenu(event, [
          { label: text.menu.copy, run: () => void copyNote(note.path), shortcut: "⇧⌘C" },
          { label: text.menu.duplicate, run: () => void duplicateNote(note.path) },
          {
            label: note.favorite ? text.menu.unfavorite : text.menu.favorite,
            run: () => void setFavorite(note.path, !note.favorite),
          },
          { label: text.menu.reveal, run: () => reveal(note.path) },
          { label: text.menu.trash, run: () => void trashNote(note.path), danger: true },
        ])
      }
    >
      <div className="note-item-head">
        <span className="note-item-title">{note.title}</span>
        {note.favorite && <Icon name="star" size={12} className="filled fav-mark" />}
      </div>
      {summary !== "" && <p className="note-item-excerpt">{summary}</p>}
      <div className="note-item-meta">
        <time>{formatRelative(note.updated)}</time>
        {showFolder && note.folder !== "" && (
          <span className="note-item-folder">{note.folder}</span>
        )}
        {note.variables.length > 0 && (
          <span className="var-count" title={text.list.vars(note.variables.length)}>
            {"{{"}
            {note.variables.length}
            {"}}"}
          </span>
        )}
        {note.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="note-item-tag">
            #{tag}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="quick-copy"
        title={text.list.copy}
        onClick={(event) => {
          event.stopPropagation();
          void copyNote(note.path);
        }}
      >
        <Icon name="copy" size={14} />
      </button>
    </li>
  );
});

function ClipboardList({ items }: { items: ClipboardItem[] | null }) {
  const text = t().clipboard;
  const enabled = useApp((s) => s.settings.clipboardHistory);
  const shortcut = useApp((s) => s.settings.quickPasteShortcut);
  // ほかのアプリでコピーしたものも映すよう、表示している間は読み直す
  useEffect(() => {
    const timer = setInterval(() => void loadClipboard(), 2000);
    const onFocus = () => void loadClipboard();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  if (items === null) return null;
  if (items.length === 0) {
    return (
      <div className="list-empty">
        <p>{enabled ? text.empty : text.disabled}</p>
        {enabled && <p className="muted">{text.emptyHint(shortcutLabel(shortcut))}</p>}
      </div>
    );
  }
  return (
    <ul className="note-list">
      {items.map((item) => (
        <li key={item.id} className="note-item clip-item">
          <p className="clip-text">{item.text}</p>
          <div className="note-item-meta">
            <time>{formatRelative(item.at)}</time>
            <span>{t().picker.chars(formatNumber([...item.text].length))}</span>
          </div>
          <div className="trash-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => void copyCompiled(item.text)}
            >
              <Icon name="copy" size={14} />
              {text.copy}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => void saveClipAsNote(item.text)}
            >
              <Icon name="note" size={14} />
              {text.saveAsNote}
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() => void removeClip(item.id)}
            >
              {text.remove}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TrashList({ entries }: { entries: TrashEntry[] | null }) {
  const text = t().list;
  if (entries === null) return null;
  if (entries.length === 0) {
    return (
      <div className="list-empty">
        <p>{text.trashEmpty}</p>
        <p className="muted">{text.trashHint}</p>
      </div>
    );
  }
  return (
    <ul className="note-list">
      {entries.map((entry) => (
        <li key={entry.path} className="note-item is-trash">
          <div className="note-item-head">
            <span className="note-item-title">{entry.title}</span>
          </div>
          {entry.excerpt !== "" && <p className="note-item-excerpt">{entry.excerpt}</p>}
          <div className="note-item-meta">
            <time>{formatRelative(entry.updated)}</time>
            {entry.folder !== "" && <span className="note-item-folder">{entry.folder}</span>}
          </div>
          <div className="trash-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => void restoreNote(entry.path)}
            >
              <Icon name="restore" size={14} />
              {text.restore}
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                setState({
                  confirm: {
                    text: t().confirm.deleteForever(entry.title),
                    confirmLabel: text.deleteForever,
                    run: () => void deleteForever(entry.path),
                  },
                })
              }
            >
              {text.deleteForever}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

const SORTS: SortKey[] = ["updated", "created", "title"];

export function NoteList() {
  const view = useApp((s) => s.ui.view);
  const openPath = useApp((s) => s.doc?.path ?? null);
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.settings.sort);
  const trash = useApp((s) => s.trash);
  const clipboard = useApp((s) => s.clipboard);
  const focus = useApp((s) => s.focus);
  // 一覧は index・表示・絞り込み・並びから決まる。どれかが変わったときだけ作り直す
  const notes = useApp(() => visibleNotes());
  const listRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const text = t().list;
  const isTrash = view.kind === "trash";
  const isClipboard = view.kind === "clipboard";

  useEffect(() => {
    if (focus?.target === "filter" && isFresh(focus)) filterRef.current?.focus();
  }, [focus]);

  // 開いているノートが見えるところまで送る
  useEffect(() => {
    if (openPath === null) return;
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(openPath)}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [openPath]);

  const move = (delta: number) => {
    const i = notes.findIndex((note) => note.path === openPath);
    const next = notes[Math.max(0, Math.min(notes.length - 1, i + delta))];
    if (next !== undefined) void openNote(next.path);
  };

  return (
    <section className="list-pane" aria-label={viewTitle(view)}>
      <header className="list-head" data-tauri-drag-region>
        <div className="list-title" data-tauri-drag-region>
          <h2>{viewTitle(view)}</h2>
          <span className="list-count">
            {isTrash
              ? text.trashCount(trash?.length ?? 0)
              : isClipboard
                ? t().clipboard.count(clipboard?.length ?? 0)
                : text.count(notes.length)}
          </span>
        </div>
        <div className="list-actions">
          {isClipboard ? (
            (clipboard?.length ?? 0) > 0 && (
              <button
                type="button"
                className="text-button danger"
                onClick={() =>
                  setState({
                    confirm: {
                      text: t().clipboard.clearConfirm,
                      confirmLabel: t().clipboard.clear,
                      run: () => void clearClipboard(),
                    },
                  })
                }
              >
                {t().clipboard.clear}
              </button>
            )
          ) : isTrash ? (
            (trash?.length ?? 0) > 0 && (
              <button
                type="button"
                className="text-button danger"
                onClick={() =>
                  setState({
                    confirm: {
                      text: t().confirm.emptyTrash,
                      confirmLabel: text.emptyTrash,
                      run: () => void deleteForever(null),
                    },
                  })
                }
              >
                {text.emptyTrash}
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                className="icon-button"
                title={text.sort[sort]}
                onClick={(event) =>
                  openMenu(
                    event,
                    SORTS.map((key) => ({
                      label: `${key === sort ? "✓ " : "   "}${text.sort[key]}`,
                      run: () => void updateSettings({ sort: key }),
                    })),
                  )
                }
              >
                <Icon name="sort" />
              </button>
              <button
                type="button"
                className="icon-button"
                title={`${text.newNote}  ⌘N`}
                onClick={() => void createNote()}
              >
                <Icon name="write" />
              </button>
            </>
          )}
        </div>
      </header>

      {!isTrash && !isClipboard && (
        <div className="filter">
          <Icon name="search" size={14} />
          <input
            ref={filterRef}
            value={filter}
            placeholder={text.filter}
            onChange={(event) => setState({ filter: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                listRef.current?.focus();
                move(1);
              }
              if (event.key === "Escape") setState({ filter: "" });
            }}
          />
          {filter !== "" && (
            <button
              type="button"
              className="icon-button small"
              onClick={() => setState({ filter: "" })}
              aria-label="Clear"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      )}

      <div className="list-scroll">
        {isClipboard ? (
          <ClipboardList items={clipboard} />
        ) : isTrash ? (
          <TrashList entries={trash} />
        ) : notes.length === 0 ? (
          <div className="list-empty">
            {filter !== "" ? (
              <p>{text.noMatch(filter)}</p>
            ) : (
              <>
                <p>{text.empty}</p>
                <button type="button" className="text-button" onClick={() => void createNote()}>
                  <Icon name="plus" size={14} />
                  {text.newNote}
                </button>
              </>
            )}
          </div>
        ) : (
          <ul
            className="note-list"
            ref={listRef}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "j") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp" || event.key === "k") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                setState({ focus: { target: "editor", at: Date.now() } });
              }
            }}
          >
            {notes.map((note) => (
              <NoteItem
                key={note.path}
                note={note}
                active={note.path === openPath}
                showFolder={view.kind !== "folder"}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
