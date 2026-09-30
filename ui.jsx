/** ---------- Shared UI pieces used by every game ---------- **/
import React, { useEffect, useRef } from "react";

export const SUIT_NAMES = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
export const isRed = (s) => s === "♥" || s === "♦";

export const SPEEDS = {
  slow: { bid: 1200, play: 950, trick: 1700 },
  normal: { bid: 800, play: 620, trick: 1150 },
  fast: { bid: 380, play: 300, trick: 650 },
};

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — the game still works, it just won't resume */
  }
}

export function Card({ c, size = "md", onClick, disabled, dim, glow, selected, lifted, tag, className = "", style }) {
  const cls = [
    "card",
    `card-${size}`,
    isRed(c.s) ? "red" : "black",
    onClick && !disabled ? "tappable" : "",
    disabled ? "disabled" : "",
    dim ? "dim" : "",
    glow ? "glow" : "",
    selected ? "selected" : "",
    lifted ? "lifted" : "",
    className,
  ].join(" ");
  const face = (
    <>
      <span className="corner tl">
        <span className="cr">{c.r}</span>
        <span className="cs">{c.s}</span>
      </span>
      <span className="pip">{c.s}</span>
      <span className="corner br">
        <span className="cr">{c.r}</span>
        <span className="cs">{c.s}</span>
      </span>
      {tag && <span className="cardTag">{tag}</span>}
    </>
  );
  const title = `${c.r} of ${SUIT_NAMES[c.s]}`;
  if (!onClick) {
    return (
      <div className={cls} title={title} style={style}>
        {face}
      </div>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick} title={title} style={style}>
      {face}
    </button>
  );
}

export function CardBack({ size = "md", className = "", style }) {
  return <div className={`card card-${size} back ${className}`} style={style} />;
}

export function Modal({ children, onClose, className = "" }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function LogList({ log, nm }) {
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [log.length]);
  return (
    <div className="logList">
      {log.length ? (
        log.map((e) => (
          <div key={e.id} className={`logRow ${e.kind}`}>
            {nm(e.text)}
          </div>
        ))
      ) : (
        <div className="muted">Nothing yet.</div>
      )}
      <div ref={end} />
    </div>
  );
}

/** Segmented control: a row of mutually exclusive buttons. */
export function Seg({ options, value, onChange, disabled = [] }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={value === k ? "on" : ""}
          disabled={disabled.includes(k)}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
