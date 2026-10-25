/**
 * 線のアイコン。16 の格子に 1.5 の線で描き、色は文字色に従う
 */
const PATHS = {
  all: "M3.5 3.5h9v9h-9zM6 6.5h4M6 9.5h2.5",
  star: "M8 2.6l1.6 3.4 3.7.5-2.7 2.6.7 3.7L8 11l-3.3 1.8.7-3.7-2.7-2.6 3.7-.5z",
  clock: "M8 2.75a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5zM8 5v3.2l2 1.3",
  slot: "M2.5 5.25c0-.4.35-.75.75-.75h9.5c.4 0 .75.35.75.75v5.5c0 .4-.35.75-.75.75h-9.5a.75.75 0 0 1-.75-.75zM5.5 6.5v3",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5",
  folder: "M2.5 4.5c0-.6.4-1 1-1h3l1.3 1.5h4.7c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1h-9c-.6 0-1-.4-1-1z",
  hash: "M6.2 2.5l-1.4 11M11.2 2.5l-1.4 11M3 6h10.5M2.5 10h10.5",
  chevron: "M6 4l4 4-4 4",
  plus: "M8 3v10M3 8h10",
  search: "M7 2.75a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5zM10.2 10.2l3.3 3.3",
  graph:
    "M4 4.5a1.5 1.5 0 1 0 0-.01M12 3.5a1.5 1.5 0 1 0 0-.01M8.5 12a1.5 1.5 0 1 0 0-.01M5.3 5.2l2.6 5.4M10.6 4.6l-1.6 6M5.5 4.2l5-.6",
  settings:
    "M8 5.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5zM8 1.75v2M8 12.25v2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M1.75 8h2M12.25 8h2M3.6 12.4L5 11M11 5l1.4-1.4",
  copy: "M5.5 5.5h7v7.5h-7zM3.5 10.5V3h7",
  check: "M3.5 8.5l3 3 6-7",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
  sidebar: "M2.5 3.5h11v9h-11zM6 3.5v9",
  panel: "M2.5 3.5h11v9h-11zM10 3.5v9",
  link: "M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7",
  outline: "M3 4h10M5.5 8H13M8 12h5",
  spark: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2L12 12M12 4l-1.8 1.8M5.8 10.2L4 12",
  x: "M4 4l8 8M12 4l-8 8",
  restore: "M3.5 6.5h6a3 3 0 0 1 0 6H6M3.5 6.5L6 4M3.5 6.5L6 9",
  reveal:
    "M2.5 8s2-4 5.5-4 5.5 4 5.5 4-2 4-5.5 4-5.5-4-5.5-4zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  sort: "M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5",
  write: "M10.5 3l2.5 2.5-7 7H3.5V10z",
  read: "M2.5 4c2-.7 4-.7 5.5.5 1.5-1.2 3.5-1.2 5.5-.5v8.5c-2-.7-4-.7-5.5.5-1.5-1.2-3.5-1.2-5.5-.5zM8 4.5v8.5",
  split: "M2.5 3.5h11v9h-11zM8 3.5v9",
  duplicate: "M5.5 5.5h7v7.5h-7zM3.5 10.5V3h7M9 7.5v3.5M7.25 9.25h3.5",
  embed: "M3 5V3h2M11 3h2v2M13 11v2h-2M5 13H3v-2M6 8h4",
  note: "M4 2.5h5.5l2.5 2.5v8.5H4zM9.5 2.5V5H12",
  command:
    "M5.5 5.5h5v5h-5zM5.5 5.5H4a1.5 1.5 0 1 1 1.5-1.5zM10.5 5.5V4A1.5 1.5 0 1 1 12 5.5zM10.5 10.5H12a1.5 1.5 0 1 1-1.5 1.5zM5.5 10.5V12A1.5 1.5 0 1 1 4 10.5z",
  arrowRight: "M3 8h10M9 4l4 4-4 4",
  theme: "M8 2.75a5.25 5.25 0 1 0 0 10.5zM8 2.75a5.25 5.25 0 0 1 0 10.5",
} as const;

/**
 * アプリの印。シェルのプロンプト「❯ _」で、カーソルだけを変数の色で灯す。
 * 地の色を持つ小さな札として描くので、明るいテーマでも暗いまま置く
 */
export function Mark({ size = 24, blink = false }: { size?: number; blink?: boolean }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6.5" fill="#141414" />
      <path
        d="M7 7.5 10.5 12 7 16.5"
        fill="none"
        stroke="#e6e6e6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        className={blink ? "mark-cursor is-blinking" : "mark-cursor"}
        x="12.5"
        y="14.6"
        width="5"
        height="1.9"
        rx="0.5"
      />
    </svg>
  );
}

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const filled = name === "star" && className?.includes("filled");
  return (
    <svg
      className={`icon${className === undefined ? "" : ` ${className}`}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
