import { useEffect, useMemo, useRef, useState } from "react";
import { type NoteMeta, resolveLink } from "../../shared/notes.ts";
import { closeOverlay, openNote, setUi, setView } from "../actions.ts";
import { t } from "../i18n.ts";
import { useApp } from "../store.ts";
import { Icon } from "./Icon.tsx";

interface GNode {
  id: string;
  label: string;
  kind: "note" | "tag" | "missing";
  degree: number;
  hasVars: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

interface GEdge {
  a: number;
  b: number;
}

function buildGraph(notes: readonly NoteMeta[], showTags: boolean) {
  const nodes: GNode[] = [];
  const ids = new Map<string, number>();
  const add = (id: string, label: string, kind: GNode["kind"], hasVars = false) => {
    const existing = ids.get(id);
    if (existing !== undefined) return existing;
    // 黄金角で渦巻き状に置くと、最初の形が偏らない
    const i = nodes.length;
    const r = 12 * Math.sqrt(i + 1);
    const angle = i * 2.39996;
    nodes.push({
      id,
      label,
      kind,
      degree: 0,
      hasVars,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      vx: 0,
      vy: 0,
      fixed: false,
    });
    ids.set(id, i);
    return i;
  };
  for (const note of notes) add(note.path, note.title, "note", note.variables.length > 0);
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b });
    const na = nodes[a];
    const nb = nodes[b];
    if (na !== undefined) na.degree += 1;
    if (nb !== undefined) nb.degree += 1;
  };
  for (const note of notes) {
    const from = ids.get(note.path) ?? -1;
    for (const target of note.links) {
      const meta = resolveLink(target, notes);
      link(
        from,
        meta === null
          ? add(`missing:${target.toLowerCase()}`, target, "missing")
          : (ids.get(meta.path) ?? -1),
      );
    }
    if (showTags) {
      for (const tag of note.tags) link(from, add(`tag:${tag.toLowerCase()}`, `#${tag}`, "tag"));
    }
  }
  return { nodes, edges };
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Graph() {
  const showTags = useApp((s) => s.ui.graphTags);
  const index = useApp((s) => s.index);
  const openPath = useApp((s) => s.doc?.path ?? null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const text = t().graph;
  const notes = index?.notes;
  // 数を見せるためだけに作る。動かすものは effect の中で別に作る
  const stats = useMemo(() => {
    const { nodes, edges } = buildGraph(notes ?? [], showTags);
    return { notes: nodes.filter((n) => n.kind === "note").length, links: edges.length };
  }, [notes, showTags]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const { nodes, edges } = buildGraph(notes ?? [], showTags);
    const neighbors = nodes.map(() => new Set<number>());
    for (const { a, b } of edges) {
      neighbors[a]?.add(b);
      neighbors[b]?.add(a);
    }
    const colors = {
      bg: cssVar("--bg"),
      node: cssVar("--text-3"),
      text: cssVar("--text"),
      muted: cssVar("--text-2"),
      edge: cssVar("--line-strong"),
      accent: cssVar("--accent"),
      var: cssVar("--var"),
      tag: cssVar("--accent-soft-strong"),
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    // ノートが少なければ大きく見せる
    const view = { x: 0, y: 0, k: nodes.length < 30 ? 1.5 : 1 };
    let alpha = 1;
    let hover = -1;
    let drag: { node: number; moved: boolean } | null = null;
    let pan: { x: number; y: number } | null = null;
    let frame = 0;
    const focusIndex = nodes.findIndex((node) => node.id === openPath);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      kick(0);
    };

    const radius = (node: GNode) =>
      node.kind === "note" ? 3.2 + Math.sqrt(node.degree) * 1.8 : 2.6;

    /** 引き合う力と反発する力を 1 歩進める。ノードが数百なら総当たりで足りる */
    const tick = () => {
      const n = nodes.length;
      for (let i = 0; i < n; i += 1) {
        const a = nodes[i] as GNode;
        for (let j = i + 1; j < n; j += 1) {
          const b = nodes[j] as GNode;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 0.5;
          }
          if (d2 > 250000) continue;
          const f = (2400 / d2) * alpha;
          a.vx += dx * f * 0.05;
          a.vy += dy * f * 0.05;
          b.vx -= dx * f * 0.05;
          b.vy -= dy * f * 0.05;
        }
      }
      for (const { a: ai, b: bi } of edges) {
        const a = nodes[ai] as GNode;
        const b = nodes[bi] as GNode;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 96) / d) * 0.06 * alpha;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      for (const node of nodes) {
        // 中心へゆるく寄せる。つながりの無いノードが遠くへ散らないように
        node.vx -= node.x * 0.0025 * alpha;
        node.vy -= node.y * 0.0025 * alpha;
        if (node.fixed) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx *= 0.6;
        node.vy *= 0.6;
        node.x += node.vx;
        node.y += node.vy;
      }
      alpha *= 0.985;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + view.x, height / 2 + view.y);
      ctx.scale(view.k, view.k);
      const active = hover !== -1 ? hover : -1;
      const near = active === -1 ? null : (neighbors[active] ?? null);

      ctx.lineWidth = 1 / view.k;
      for (const { a, b } of edges) {
        const na = nodes[a] as GNode;
        const nb = nodes[b] as GNode;
        const lit = active !== -1 && (a === active || b === active);
        ctx.strokeStyle = lit ? colors.accent : colors.edge;
        ctx.globalAlpha = active === -1 || lit ? (lit ? 0.9 : 0.7) : 0.15;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
      }

      nodes.forEach((node, i) => {
        const lit = active === -1 || i === active || (near?.has(i) ?? false);
        ctx.globalAlpha = lit ? 1 : 0.18;
        const r = radius(node);
        ctx.beginPath();
        if (node.kind === "tag") ctx.rect(node.x - r, node.y - r, r * 2, r * 2);
        else ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          i === focusIndex || i === active
            ? colors.accent
            : node.kind === "tag"
              ? colors.tag
              : node.kind === "missing"
                ? colors.bg
                : colors.node;
        ctx.fill();
        if (node.kind === "missing") {
          ctx.strokeStyle = colors.node;
          ctx.setLineDash([2 / view.k, 2 / view.k]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (node.hasVars) {
          // 変数のあるノートには、変数の色の輪を付ける
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2.6, 0, Math.PI * 2);
          ctx.strokeStyle = colors.var;
          ctx.lineWidth = 1.2 / view.k;
          ctx.stroke();
          ctx.lineWidth = 1 / view.k;
        }
        const showLabel =
          i === active ||
          i === focusIndex ||
          (near?.has(i) ?? false) ||
          (active === -1 && (view.k > 1.15 || nodes.length <= 80)) ||
          node.degree > 3;
        if (showLabel) {
          ctx.font = `${i === active ? 600 : 500} ${12 / view.k}px "Instrument Sans Variable", system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = i === active || i === focusIndex ? colors.text : colors.muted;
          ctx.fillText(node.label, node.x, node.y + r + 14 / view.k);
        }
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      frame = 0;
      if (alpha > 0.004) {
        tick();
        frame = requestAnimationFrame(loop);
      }
      draw();
    };

    function kick(next = 0.4) {
      alpha = Math.max(alpha, next);
      if (frame === 0) frame = requestAnimationFrame(loop);
    }

    if (reduceMotion) {
      // 動きを減らす設定なら、落ち着いた形を先に計算して 1 度だけ描く
      for (let i = 0; i < 300; i += 1) tick();
      alpha = 0;
    }

    const toWorld = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - width / 2 - view.x) / view.k,
        y: (event.clientY - rect.top - height / 2 - view.y) / view.k,
      };
    };
    const hit = (event: { clientX: number; clientY: number }) => {
      const p = toWorld(event);
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((node, i) => {
        const d = Math.hypot(node.x - p.x, node.y - p.y);
        if (d < radius(node) + 6 / view.k && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      return best;
    };

    const onMove = (event: PointerEvent) => {
      if (drag !== null) {
        const node = nodes[drag.node] as GNode;
        const p = toWorld(event);
        node.x = p.x;
        node.y = p.y;
        drag.moved = true;
        kick(0.25);
        return;
      }
      if (pan !== null) {
        view.x += event.clientX - pan.x;
        view.y += event.clientY - pan.y;
        pan = { x: event.clientX, y: event.clientY };
        if (frame === 0) draw();
        return;
      }
      const found = hit(event);
      if (found !== hover) {
        hover = found;
        canvas.style.cursor = found === -1 ? "grab" : "pointer";
        setHoverLabel(found === -1 ? null : (nodes[found]?.label ?? null));
        if (frame === 0) draw();
      }
    };
    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const found = hit(event);
      if (found !== -1) {
        drag = { node: found, moved: false };
        (nodes[found] as GNode).fixed = true;
      } else {
        pan = { x: event.clientX, y: event.clientY };
        canvas.style.cursor = "grabbing";
      }
    };
    const onUp = () => {
      if (drag !== null) {
        const node = nodes[drag.node] as GNode;
        node.fixed = false;
        if (!drag.moved) {
          if (node.kind === "note") {
            closeOverlay();
            void openNote(node.id);
          } else if (node.kind === "tag") {
            closeOverlay();
            setView({ kind: "tag", tag: node.label.slice(1) });
          }
        }
      }
      drag = null;
      pan = null;
      canvas.style.cursor = hover === -1 ? "grab" : "pointer";
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        // トラックパッドのピンチは ctrlKey つきの wheel で来る
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left - width / 2;
        const my = event.clientY - rect.top - height / 2;
        const k = Math.min(4, Math.max(0.25, view.k * Math.exp(-event.deltaY * 0.01)));
        view.x = mx - ((mx - view.x) * k) / view.k;
        view.y = my - ((my - view.y) * k) / view.k;
        view.k = k;
      } else {
        view.x -= event.deltaX;
        view.y -= event.deltaY;
      }
      if (frame === 0) draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [notes, showTags, openPath]);

  return (
    <div className="overlay graph-overlay" role="dialog" aria-modal="true" aria-label={text.title}>
      <div className="graph">
        <header className="graph-head">
          <div>
            <h2>{text.title}</h2>
            <p className="muted">{text.stats(stats.notes, stats.links)}</p>
          </div>
          <div className="graph-tools">
            <label className="switch">
              <input
                type="checkbox"
                checked={showTags}
                onChange={(event) => setUi({ graphTags: event.target.checked })}
              />
              <span className="switch-track" aria-hidden="true" />
              {text.tags}
            </label>
            <button
              type="button"
              className="icon-button"
              onClick={closeOverlay}
              aria-label={text.close}
            >
              <Icon name="x" />
            </button>
          </div>
        </header>
        <canvas ref={canvasRef} className="graph-canvas" />
        {hoverLabel !== null && <div className="graph-hover">{hoverLabel}</div>}
        <p className="graph-hint">{text.hint}</p>
      </div>
    </div>
  );
}
