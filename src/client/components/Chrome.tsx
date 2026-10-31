/**
 * 画面の脇役たち。設定、通知、右クリックのメニュー、確認、ペインの幅の調整
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DesktopStatus } from "../../shared/api.ts";
import {
  type Accent,
  ACCENTS,
  FONT_SIZE_RANGE,
  HISTORY_LIMITS,
  type Settings,
  THEMES,
} from "../../shared/settings.ts";
import { api } from "../api.ts";
import { closeOverlay, dismissToast, setUi, updateSettings } from "../actions.ts";
import { t } from "../i18n.ts";
import { setState, type UiState, useApp } from "../store.ts";
import { Icon } from "./Icon.tsx";

// ---------------------------------------------------------------- 設定

function Choice<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented wide" role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          key={option}
          aria-checked={value === option}
          className={value === option ? "is-on" : ""}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      {label}
    </label>
  );
}

/** アクセラレータ（Shift+Command+V）を、Mac のキーの記号（⇧⌘V）で見せる */
export function shortcutLabel(accelerator: string): string {
  const symbols: Record<string, string> = {
    Control: "⌃",
    Alt: "⌥",
    Option: "⌥",
    Shift: "⇧",
    Command: "⌘",
    Super: "⌘",
    CmdOrCtrl: "⌘",
    Space: "Space",
  };
  const order = ["Control", "Alt", "Option", "Shift", "Command", "Super", "CmdOrCtrl"];
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const mods = parts
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((part) => symbols[part] ?? part);
  return `${mods.join("")}${symbols[key] ?? key}`;
}

/** 押したキーをアクセラレータにする。修飾キーだけ、または ⌘⌃⌥ の無い組み合わせは null */
function acceleratorFrom(event: KeyboardEvent): string | null {
  const code = event.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (
    [
      "Space",
      "Backquote",
      "Minus",
      "Equal",
      "Comma",
      "Period",
      "Slash",
      "Semicolon",
      "Quote",
      "BracketLeft",
      "BracketRight",
      "Backslash",
    ].includes(code)
  )
    key = code;
  if (key === null || !(event.metaKey || event.ctrlKey || event.altKey)) return null;
  const mods = [
    event.ctrlKey ? "Control" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    event.metaKey ? "Command" : null,
  ].filter((mod) => mod !== null);
  return [...mods, key].join("+");
}

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const text = t().settings;
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const accelerator = acceleratorFrom(event);
      if (accelerator !== null) {
        onChange(accelerator);
        setRecording(false);
      }
    };
    // コマンドのキー操作より先に拾う
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange]);
  return (
    <button
      type="button"
      className={`shortcut-recorder${recording ? " is-recording" : ""}`}
      onClick={() => setRecording((on) => !on)}
      title={text.shortcutHint}
    >
      {recording ? text.shortcutRecording : <kbd>{shortcutLabel(value)}</kbd>}
    </button>
  );
}

function QuickPasteSettings({
  settings,
  set,
}: {
  settings: Settings;
  set: (patch: Partial<Settings>) => void;
}) {
  const text = t().settings;
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  useEffect(() => {
    void api.desktop().then(setStatus, () => setStatus(null));
  }, []);
  return (
    <section className="settings-section">
      <h3>{text.quickPaste}</h3>
      <div className="settings-row">
        <span>{text.shortcut}</span>
        <ShortcutRecorder
          value={settings.quickPasteShortcut}
          onChange={(quickPasteShortcut) => {
            set({ quickPasteShortcut });
            // 登録できたかは殻が少し後に知らせてくる
            setTimeout(() => void api.desktop().then(setStatus, () => {}), 600);
          }}
        />
      </div>
      {status?.shortcutError === settings.quickPasteShortcut && (
        <p className="muted small settings-note is-warning">{text.shortcutTaken}</p>
      )}
      <Toggle
        checked={settings.autoPaste}
        label={text.autoPaste}
        onChange={(autoPaste) => set({ autoPaste })}
      />
      {status?.desktop === true && settings.autoPaste && status.accessibility !== null && (
        <p className={`muted small settings-note${status.accessibility ? "" : " is-warning"}`}>
          {status.accessibility ? text.accessibilityOk : text.accessibilityMissing}
        </p>
      )}
      <Toggle
        checked={settings.clipboardHistory}
        label={text.clipboardHistory}
        onChange={(clipboardHistory) => set({ clipboardHistory })}
      />
      <div className="settings-row">
        <span>{text.historyLimit}</span>
        <Choice
          value={String(settings.historyLimit)}
          options={HISTORY_LIMITS.map(String)}
          label={(limit) => text.historyItems(Number(limit))}
          onChange={(limit) => set({ historyLimit: Number(limit) })}
        />
      </div>
      {status?.desktop === true && (
        <Toggle
          checked={settings.openAtLogin}
          label={text.openAtLogin}
          onChange={(openAtLogin) => set({ openAtLogin })}
        />
      )}
    </section>
  );
}

export function SettingsDialog() {
  const settings = useApp((s) => s.settings);
  const root = useApp((s) => s.index?.root ?? "");
  const text = t().settings;
  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  const langValue = settings.lang ?? "auto";

  return (
    <div
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}
    >
      <div
        className="dialog settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="dialog-head">
          <h2 id="settings-title">{text.title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={closeOverlay}
            aria-label={text.close}
          >
            <Icon name="x" />
          </button>
        </header>

        <section className="settings-section">
          <h3>{text.vault}</h3>
          <div className="vault-path">
            <code title={root}>{root}</code>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                void api.chooseFolder().then((path) => {
                  if (path !== null) set({ vaultPath: path });
                })
              }
            >
              {text.change}
            </button>
            {settings.vaultPath !== null && (
              <button
                type="button"
                className="text-button"
                onClick={() => set({ vaultPath: null })}
              >
                {text.useDefault}
              </button>
            )}
          </div>
          <p className="muted small">{text.vaultHint}</p>
        </section>

        <section className="settings-section">
          <h3>{text.appearance}</h3>
          <div className="settings-row">
            <span>{text.theme}</span>
            <Choice
              value={settings.theme}
              options={THEMES}
              label={(theme) => text.themes[theme]}
              onChange={(theme) => set({ theme })}
            />
          </div>
          <div className="settings-row">
            <span>{text.accent}</span>
            <div className="accent-swatches" role="radiogroup">
              {ACCENTS.map((accent: Accent) => (
                <button
                  type="button"
                  role="radio"
                  key={accent}
                  aria-checked={settings.accent === accent}
                  aria-label={accent}
                  className={`swatch swatch-${accent}${settings.accent === accent ? " is-on" : ""}`}
                  onClick={() => set({ accent })}
                />
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span>{text.language}</span>
            <Choice
              value={langValue}
              options={["auto", "ja", "en"] as const}
              label={(lang) => text.languages[lang]}
              onChange={(lang) => set({ lang: lang === "auto" ? null : lang })}
            />
          </div>
        </section>

        <section className="settings-section">
          <h3>{text.editor}</h3>
          <div className="settings-row">
            <span>{text.fontSize}</span>
            <div className="range">
              <input
                type="range"
                min={FONT_SIZE_RANGE.min}
                max={FONT_SIZE_RANGE.max}
                value={settings.editorFontSize}
                onChange={(event) => set({ editorFontSize: Number(event.target.value) })}
              />
              <output>{settings.editorFontSize}</output>
            </div>
          </div>
          <Toggle
            checked={settings.readableWidth}
            label={text.readableWidth}
            onChange={(readableWidth) => set({ readableWidth })}
          />
          <Toggle
            checked={settings.lineNumbers}
            label={text.lineNumbers}
            onChange={(lineNumbers) => set({ lineNumbers })}
          />
        </section>

        <QuickPasteSettings settings={settings} set={set} />

        <section className="settings-section">
          <h3>{text.copying}</h3>
          <Toggle
            checked={settings.stripComments}
            label={text.stripComments}
            onChange={(stripComments) => set({ stripComments })}
          />
        </section>

        <footer className="dialog-foot">
          <p className="muted small">{text.about}</p>
          <button type="button" className="primary-button" onClick={closeOverlay}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 通知

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const online = useApp((s) => s.online);
  return (
    <div className="toasts" aria-live="polite">
      {!online && <div className="toast is-error">{t().connection}</div>}
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.tone}`}>
          <span>{toast.text}</span>
          {toast.action !== undefined && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 右クリックのメニュー

export function ContextMenu() {
  const menu = useApp((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(-1);

  // 画面の端からはみ出さないよう、描いてから位置を直す
  useLayoutEffect(() => {
    if (menu === null || ref.current === null) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    });
    setActive(-1);
    ref.current.focus();
  }, [menu]);

  useEffect(() => {
    if (menu === null) return;
    const close = () => setState({ menu: null });
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  if (menu === null) return null;
  const run = (i: number) => {
    setState({ menu: null });
    menu.items[i]?.run();
  };
  return (
    <div
      className="menu-backdrop"
      onMouseDown={() => setState({ menu: null })}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={ref}
        className="menu"
        role="menu"
        tabIndex={-1}
        style={{ left: position.x, top: position.y }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") setState({ menu: null });
          if (event.key === "ArrowDown") setActive((i) => (i + 1) % menu.items.length);
          if (event.key === "ArrowUp") setActive((i) => (i <= 0 ? menu.items.length - 1 : i - 1));
          if (event.key === "Enter" && active !== -1) run(active);
        }}
      >
        {menu.items.map((item, i) => (
          <button
            type="button"
            role="menuitem"
            key={item.label}
            className={`menu-item${item.danger === true ? " is-danger" : ""}${i === active ? " is-active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => run(i)}
          >
            <span>{item.label}</span>
            {item.shortcut !== undefined && <kbd>{item.shortcut}</kbd>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 確認

/**
 * 保管庫のフォルダを読めないときに出す。App Store 版では、選んだフォルダを移動したり名前を変えたりすると、
 * 使う許可が失われる。黙って空の保管庫に見せず、選び直してもらう
 */
export function VaultAccessDialog() {
  const index = useApp((s) => s.index);
  const vaultPath = useApp((s) => s.settings.vaultPath);
  if (index === null || index.readable) return null;
  const text = t().vaultAccess;
  return (
    <div className="overlay">
      <div className="dialog confirm" role="alertdialog" aria-modal="true">
        <h3>{text.title}</h3>
        <p>{text.body(index.root)}</p>
        <div className="dialog-actions">
          {vaultPath !== null && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => void updateSettings({ vaultPath: null })}
            >
              {text.useDefault}
            </button>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              void api.chooseFolder().then((path) => {
                if (path !== null) void updateSettings({ vaultPath: path });
              })
            }
          >
            {text.choose}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const confirm = useApp((s) => s.confirm);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [confirm]);
  if (confirm === null) return null;
  const close = () => setState({ confirm: null });
  return (
    <div
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="dialog confirm"
        role="alertdialog"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <p>{confirm.text}</p>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={close}>
            {t().confirm.cancel}
          </button>
          <button
            type="button"
            ref={ok}
            className="primary-button danger"
            onClick={() => {
              close();
              confirm.run();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ペインの幅

type WidthKey = keyof Pick<UiState, "sidebarWidth" | "listWidth" | "inspectorWidth">;

const LIMITS: Record<WidthKey, [number, number]> = {
  sidebarWidth: [180, 360],
  listWidth: [240, 480],
  inspectorWidth: [280, 560],
};

/** ドラッグでペインの幅を変える。edge は、つまみがペインのどちら側にあるか */
export function Resizer({ target, edge }: { target: WidthKey; edge: "right" | "left" }) {
  const width = useApp((s) => s.ui[target]);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`resizer${dragging ? " is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const start = width;
        const [min, max] = LIMITS[target];
        setDragging(true);
        document.body.classList.add("is-resizing");
        const move = (e: PointerEvent) => {
          const delta = (e.clientX - startX) * (edge === "right" ? 1 : -1);
          setState((s) => ({
            ui: { ...s.ui, [target]: Math.round(Math.max(min, Math.min(max, start + delta))) },
          }));
        };
        const up = () => {
          setDragging(false);
          document.body.classList.remove("is-resizing");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          // 幅を保存する
          setUi({});
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onKeyDown={(event) => {
        const [min, max] = LIMITS[target];
        const step =
          (event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0) *
          (edge === "right" ? 1 : -1);
        if (step !== 0) setUi({ [target]: Math.max(min, Math.min(max, width + step)) });
      }}
      onDoubleClick={() => setUi({ [target]: (LIMITS[target][0] + LIMITS[target][1]) / 2 })}
    />
  );
}
