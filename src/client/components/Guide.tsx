/**
 * 使い方のガイド。初めて起動したときに開き、あとからはコマンドやサイドバーの ? から開く
 */
import { useEffect, useRef, useState } from "react";
import { closeOverlay } from "../actions.ts";
import { t } from "../i18n.ts";
import { useApp } from "../store.ts";
import { shortcutLabel } from "./Chrome.tsx";
import { Icon, Mark } from "./Icon.tsx";

export function Guide() {
  const shortcut = useApp((s) => s.settings.quickPasteShortcut);
  const text = t().guide;
  const steps = text.steps(shortcutLabel(shortcut));
  const [index, setIndex] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => next.current?.focus(), [index]);

  if (step === undefined) return null;
  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));

  return (
    <div
      className="overlay"
      onMouseDown={(event) => event.target === event.currentTarget && closeOverlay()}
    >
      <div
        className="dialog guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
      >
        <header className="dialog-head">
          <span className="guide-kicker">
            <Mark size={20} blink={index === 0} />
            {text.title}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={closeOverlay}
            aria-label={t().settings.close}
          >
            <Icon name="x" />
          </button>
        </header>

        <section className="guide-body" key={index}>
          <h2 id="guide-title">{step.title}</h2>
          <p className="guide-lead">{step.lead}</p>
          <dl className="guide-points">
            {step.points.map((point) => (
              <div key={point.keys} className="guide-point">
                <dt>
                  <code>{point.keys}</code>
                </dt>
                <dd>{point.text}</dd>
              </div>
            ))}
          </dl>
          {step.note !== undefined && <p className="muted small guide-note">{step.note}</p>}
          {last && <p className="muted small guide-note">{text.reopen}</p>}
        </section>

        <footer className="dialog-foot">
          <div className="guide-dots" aria-label={text.step(index + 1, steps.length)}>
            {steps.map((item, i) => (
              <button
                type="button"
                key={item.title}
                className={i === index ? "is-on" : ""}
                aria-label={text.step(i + 1, steps.length)}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <div className="dialog-actions">
            {index === 0 ? (
              <button type="button" className="ghost-button" onClick={closeOverlay}>
                {text.skip}
              </button>
            ) : (
              <button type="button" className="ghost-button" onClick={() => go(-1)}>
                {text.back}
              </button>
            )}
            <button
              type="button"
              ref={next}
              className="primary-button"
              onClick={() => (last ? closeOverlay() : go(1))}
            >
              {last ? text.done : text.next}
              {!last && <Icon name="arrowRight" />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
