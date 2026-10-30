import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createFolder,
  createNote,
  moveToFolder,
  openMenu,
  openOverlay,
  recentSince,
  renameFolder,
  reveal,
  setView,
  toggleFolder,
  trashFolder,
} from "../actions.ts";
import { t } from "../i18n.ts";
import { setState, useApp, type View } from "../store.ts";
import { Icon, type IconName, Mark } from "./Icon.tsx";

export const DRAG_TYPE = "application/x-prompt-code-path";

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "folder" && b.kind === "folder") return a.path === b.path;
  if (a.kind === "tag" && b.kind === "tag") return a.tag.toLowerCase() === b.tag.toLowerCase();
  return true;
}

/** ノートやフォルダを落とせる場所にする */
function useDrop(folder: string) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver(event: DragEvent) {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave() {
        setOver(false);
      },
      onDrop(event: DragEvent) {
        setOver(false);
        const path = event.dataTransfer.getData(DRAG_TYPE);
        if (path === "") return;
        event.preventDefault();
        void moveToFolder(path, folder);
      },
    },
  };
}

function Row({
  icon,
  label,
  count,
  view,
  className,
}: {
  icon: IconName;
  label: string;
  count?: number;
  view: View;
  className?: string;
}) {
  const active = useApp((s) => sameView(s.ui.view, view));
  return (
    <button
      type="button"
      className={`nav-row${active ? " is-active" : ""}${className === undefined ? "" : ` ${className}`}`}
      onClick={() => setView(view)}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="rename-input"
      defaultValue={initial}
      onBlur={(event) => onDone(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = initial;
          onDone(null);
        }
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
}

function buildTree(folders: readonly string[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  for (const path of [...folders].sort((a, b) => a.localeCompare(b))) {
    const index = path.lastIndexOf("/");
    const node: FolderNode = { path, name: path.slice(index + 1), children: [] };
    nodes.set(path, node);
    const parent = index === -1 ? undefined : nodes.get(path.slice(0, index));
    (parent?.children ?? roots).push(node);
  }
  return roots;
}

function FolderItem({
  node,
  depth,
  counts,
}: {
  node: FolderNode;
  depth: number;
  counts: Map<string, number>;
}) {
  const open = useApp((s) => s.ui.expanded.includes(node.path));
  const active = useApp((s) => s.ui.view.kind === "folder" && s.ui.view.path === node.path);
  const renaming = useApp((s) => s.renaming?.kind === "folder" && s.renaming.path === node.path);
  const drop = useDrop(node.path);
  const text = t().menu;

  return (
    <li>
      <div
        className={`nav-row folder-row${active ? " is-active" : ""}${drop.over ? " is-drop" : ""}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        role="button"
        tabIndex={0}
        draggable={!renaming}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => {
          setView({ kind: "folder", path: node.path });
          if (!open) toggleFolder(node.path, true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") setView({ kind: "folder", path: node.path });
          if (event.key === "ArrowRight") toggleFolder(node.path, true);
          if (event.key === "ArrowLeft") toggleFolder(node.path, false);
        }}
        onContextMenu={(event) =>
          openMenu(event, [
            { label: text.newNote, run: () => void createNote(node.path) },
            { label: text.newFolder, run: () => void createFolder(node.path) },
            { label: text.rename, run: () => startRenaming(node.path) },
            { label: text.reveal, run: () => reveal(node.path) },
            { label: text.trash, run: () => void trashFolder(node.path), danger: true },
          ])
        }
        {...drop.handlers}
      >
        <button
          type="button"
          className={`twisty${open ? " is-open" : ""}${node.children.length === 0 ? " is-leaf" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleFolder(node.path);
          }}
          tabIndex={-1}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <Icon name="chevron" size={12} />
        </button>
        <Icon name="folder" />
        {renaming ? (
          <RenameInput
            initial={node.name}
            onDone={(value) => void renameFolder(node.path, value ?? node.name)}
          />
        ) : (
          <span className="nav-label">{node.name}</span>
        )}
        <span className="nav-count">{counts.get(node.path) ?? ""}</span>
      </div>
      {open && node.children.length > 0 && (
        <ul className="tree">
          {node.children.map((child) => (
            <FolderItem key={child.path} node={child} depth={depth + 1} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

function startRenaming(path: string): void {
  setState({ renaming: { kind: "folder", path } });
}

export function Sidebar() {
  const index = useApp((s) => s.index);
  const tagFilter = useApp((s) => (s.ui.view.kind === "tag" ? s.ui.view.tag : null));
  const rootDrop = useDrop("");
  const text = t().library;

  const { tree, counts, tags, favorites, recent, withVariables } = useMemo(() => {
    const notes = index?.notes ?? [];
    const folderCounts = new Map<string, number>();
    const tagCounts = new Map<string, { tag: string; count: number }>();
    const weekAgo = recentSince();
    for (const note of notes) {
      // 入れ子のフォルダは、親にも数える
      let folder = note.folder;
      while (folder !== "") {
        folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
        const slash = folder.lastIndexOf("/");
        folder = slash === -1 ? "" : folder.slice(0, slash);
      }
      for (const tag of note.tags) {
        const key = tag.toLowerCase();
        const entry = tagCounts.get(key) ?? { tag, count: 0 };
        entry.count += 1;
        tagCounts.set(key, entry);
      }
    }
    return {
      tree: buildTree(index?.folders ?? []),
      counts: folderCounts,
      tags: [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      favorites: notes.filter((note) => note.favorite).length,
      recent: notes.filter((note) => note.updated > weekAgo).length,
      withVariables: notes.filter((note) => note.variables.length > 0).length,
    };
  }, [index]);

  const vaultName = index?.root.split("/").pop() ?? "";

  return (
    <nav className="sidebar" aria-label={text.folders}>
      <div className="titlebar-space" data-tauri-drag-region />
      <div className="vault-head" data-tauri-drag-region>
        <button type="button" className="vault-name" onClick={() => reveal("")} title={index?.root}>
          <Mark />
          <span>{vaultName}</span>
        </button>
      </div>
      <button type="button" className="search-trigger" onClick={() => openOverlay("palette")}>
        <Icon name="search" />
        <span>{t().palette.notes}</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="sidebar-scroll">
        <div className="nav-group">
          <Row icon="all" label={text.all} count={index?.notes.length} view={{ kind: "all" }} />
          <Row icon="star" label={text.favorites} count={favorites} view={{ kind: "favorites" }} />
          <Row icon="clock" label={text.recent} count={recent} view={{ kind: "recent" }} />
          <Row
            icon="slot"
            label={text.variables}
            count={withVariables}
            view={{ kind: "variables" }}
            className="is-var"
          />
          <Row icon="copy" label={text.clipboard} view={{ kind: "clipboard" }} />
        </div>

        <div className="nav-group">
          <div className={`nav-heading${rootDrop.over ? " is-drop" : ""}`} {...rootDrop.handlers}>
            <span>{text.folders}</span>
            <button
              type="button"
              className="icon-button small"
              onClick={() => void createFolder("")}
              title={text.newFolder}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
          <ul className="tree">
            {tree.map((node) => (
              <FolderItem key={node.path} node={node} depth={0} counts={counts} />
            ))}
          </ul>
        </div>

        <div className="nav-group">
          <div className="nav-heading">
            <span>{text.tags}</span>
          </div>
          {tags.length === 0 ? (
            <p className="nav-empty">{text.noTags}</p>
          ) : (
            <div className="tag-cloud">
              {tags.map(({ tag, count }) => (
                <button
                  type="button"
                  key={tag}
                  className={`tag-chip${tagFilter?.toLowerCase() === tag.toLowerCase() ? " is-active" : ""}`}
                  onClick={() =>
                    setView(
                      tagFilter?.toLowerCase() === tag.toLowerCase()
                        ? { kind: "all" }
                        : { kind: "tag", tag },
                    )
                  }
                >
                  <span className="tag-hash">#</span>
                  {tag}
                  <span className="tag-count">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-foot">
        <Row icon="trash" label={text.trash} view={{ kind: "trash" }} />
        <div className="foot-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => openOverlay("guide")}
            title={t().commands.guide}
          >
            <Icon name="help" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => openOverlay("graph")}
            title={`${t().commands.graph}  ⌘G`}
          >
            <Icon name="graph" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => openOverlay("settings")}
            title={`${t().commands.settings}  ⌘,`}
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>
    </nav>
  );
}
