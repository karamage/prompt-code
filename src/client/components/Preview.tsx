import { useDeferredValue, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { resolveLink } from "../../shared/notes.ts";
import {
  createNote,
  type EmbedSources,
  getSources,
  loadEmbeds,
  noteLookup,
  openNote,
  setView,
  subscribeSources,
} from "../actions.ts";
import { copyText } from "../desktop.ts";
import { api } from "../api.ts";
import { highlightBlocks } from "../lib/highlight.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { getState, useApp } from "../store.ts";

/** 埋め込み先の本文。読み終えたら新しい値が返り、描き直される */
export function useEmbedSources(body: string): EmbedSources {
  const version = useApp((s) => s.index?.version ?? 0);
  useEffect(() => {
    // 保管庫が変わったら（version）、埋め込み先も読み直す
    void loadEmbeds(body, version);
  }, [body, version]);
  return useSyncExternalStore(subscribeSources, getSources);
}

export function Preview({ body, folder }: { body: string; folder: string }) {
  const deferred = useDeferredValue(body);
  const index = useApp((s) => s.index);
  const sources = useEmbedSources(deferred);
  const ref = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    const notes = index?.notes ?? [];
    return renderMarkdown(deferred, {
      folder,
      lookup: noteLookup(sources, notes),
      exists: (target) => resolveLink(target, notes) !== null,
    });
  }, [deferred, folder, index, sources]);

  useEffect(() => {
    if (ref.current !== null) void highlightBlocks(ref.current);
  }, [html]);

  return (
    <div
      className="preview prose"
      ref={ref}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: DOMPurify で消毒済み
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        const link = target.closest<HTMLElement>("[data-link]");
        if (link !== null) {
          event.preventDefault();
          const name = link.dataset.link ?? "";
          const meta = resolveLink(name, getState().index?.notes ?? []);
          if (meta !== null) void openNote(meta.path);
          else void createNote(undefined, name);
          return;
        }
        const tag = target.closest<HTMLElement>("[data-tag]");
        if (tag !== null) {
          setView({ kind: "tag", tag: tag.dataset.tag ?? "" });
          return;
        }
        const copy = target.closest<HTMLButtonElement>(".pc-copy-code");
        if (copy !== null) {
          const code = copy.closest(".pc-codeblock")?.querySelector("code")?.textContent ?? "";
          void copyText(api.post, code).then(() => {
            copy.textContent = "✓";
            setTimeout(() => {
              copy.textContent = "Copy";
            }, 1200);
          });
        }
      }}
    />
  );
}
