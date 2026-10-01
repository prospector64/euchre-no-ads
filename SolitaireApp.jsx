import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Card, CardBack, Modal, Seg, load, save } from "./ui.jsx";
import {
  SUITS,
  applyAction,
  newGame,
  movingCards,
  isLegalMove,
  autoTarget,
  hasUsefulMove,
  canAutoFinish,
  nextFinishMove,
  firstUp,
  cardKey,
} from "./solitaire-engine.js";

const GAME_KEY = "solitaire.game.v1";
const SETTINGS_KEY = "solitaire.settings.v1";
const EMPTY_STATS = { played: 0, won: 0, bestMoves: null, bestTime: null };
const DEFAULT_SETTINGS = { drawCount: 1, stats: { 1: EMPTY_STATS, 3: EMPTY_STATS }, lastCounted: null, lastWon: null };

function loadSettings() {
  const s = load(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...s, stats: { ...DEFAULT_SETTINGS.stats, ...(s.stats ?? {}) } };
}

function initialGame() {
  const saved = load(GAME_KEY, null);
  if (saved && saved.v === 1 && Array.isArray(saved.tableau)) return saved;
  return newGame(loadSettings().drawCount);
}

const reducer = (s, a) => (a.type === "load" ? a.state : applyAction(s, a));
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export default function SolitaireApp({ onHome }) {
  const [settings, setSettings] = useState(loadSettings);
  const [game, dispatch] = useReducer(reducer, undefined, initialGame);
  const [drag, setDrag] = useState(null); // { from, x, y, offX, offY }
  const [shake, setShake] = useState(null); // key of a card that couldn't move
  const [finishing, setFinishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [board, setBoard] = useState({ w: 360, h: 600 });
  const history = useRef([]);
  const gameRef = useRef(game);
  const dragRef = useRef(null);
  const boardRef = useRef(null);
  gameRef.current = game;

  useEffect(() => save(GAME_KEY, game), [game]);
  useEffect(() => save(SETTINGS_KEY, settings), [settings]);

  // Measure the play area so cards and column spacing fit the screen
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBoard({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clock: counts while the page is visible, from the first move until the game is won
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") dispatch({ type: "tick" });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Stats: a game counts as played on its first move
  useEffect(() => {
    if (game.moves > 0 && settings.lastCounted !== game.gameId) {
      setSettings((s) => {
        const st = s.stats[game.drawCount] ?? EMPTY_STATS;
        return { ...s, lastCounted: game.gameId, stats: { ...s.stats, [game.drawCount]: { ...st, played: st.played + 1 } } };
      });
    }
    if (game.won && settings.lastWon !== game.gameId) {
      setSettings((s) => {
        const st = s.stats[game.drawCount] ?? EMPTY_STATS;
        return {
          ...s,
          lastWon: game.gameId,
          stats: {
            ...s.stats,
            [game.drawCount]: {
              ...st,
              won: st.won + 1,
              bestMoves: st.bestMoves === null ? game.moves : Math.min(st.bestMoves, game.moves),
              bestTime: st.bestTime === null ? game.elapsed : Math.min(st.bestTime, game.elapsed),
            },
          },
        };
      });
    }
  }, [game.moves, game.won, game.gameId, game.drawCount, game.elapsed, settings.lastCounted, settings.lastWon]);

  // Auto-finish: play the remaining cards up one at a time
  useEffect(() => {
    if (!finishing) return;
    const next = nextFinishMove(game);
    if (!next) {
      setFinishing(false);
      return;
    }
    const t = setTimeout(() => act(next), 90);
    return () => clearTimeout(t);
  }, [finishing, game]);

  /** ---------- Actions ---------- */
  function act(a) {
    const before = gameRef.current;
    const after = applyAction(before, a);
    if (after === before) return false;
    history.current = [...history.current.slice(-150), before];
    dispatch({ type: "load", state: after });
    return true;
  }

  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    // Undo still counts as a move, like most solitaire games
    dispatch({ type: "load", state: { ...prev, moves: game.moves + 1, elapsed: game.elapsed } });
  }

  function deal(drawCount = settings.drawCount) {
    history.current = [];
    setFinishing(false);
    setConfirmNew(false);
    dispatch({ type: "load", state: newGame(drawCount) });
  }

  function tryTap(from, key) {
    const to = autoTarget(gameRef.current, from);
    if (!to || !act({ type: "move", from, to })) {
      setShake(key);
      setTimeout(() => setShake(null), 350);
    }
  }

  /** ---------- Drag and drop (mouse and touch) ---------- */
  function onPointerDown(e, from, key) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!movingCards(gameRef.current, from)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { from, key, sx: e.clientX, sy: e.clientY, offX: e.clientX - rect.left, offY: e.clientY - rect.top, moved: false };
    window.addEventListener("pointermove", ptr.current.move);
    window.addEventListener("pointerup", ptr.current.up);
    window.addEventListener("pointercancel", ptr.current.cancel);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 7) return;
    d.moved = true;
    setDrag({ from: d.from, x: e.clientX, y: e.clientY, offX: d.offX, offY: d.offY });
  }

  function endPointer() {
    window.removeEventListener("pointermove", ptr.current.move);
    window.removeEventListener("pointerup", ptr.current.up);
    window.removeEventListener("pointercancel", ptr.current.cancel);
    dragRef.current = null;
    setDrag(null);
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    if (!d) return endPointer();
    if (!d.moved) {
      endPointer();
      tryTap(d.from, d.key);
      return;
    }
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.dataset && el.dataset.drop);
    endPointer();
    if (!target) return;
    const to =
      target.dataset.drop === "foundation"
        ? { type: "foundation", suit: target.dataset.suit }
        : { type: "tableau", col: +target.dataset.col };
    if (isLegalMove(gameRef.current, d.from, to)) act({ type: "move", from: d.from, to });
  }

  function onPointerCancel() {
    endPointer();
  }

  // One stable set of window listeners for the whole drag (only refs and setters inside, so first-render copies are fine)
  const ptr = useRef(null);
  if (!ptr.current) ptr.current = { move: (e) => onPointerMove(e), up: (e) => onPointerUp(e), cancel: () => onPointerCancel() };

  /** ---------- Layout ---------- */
  const gap = board.w < 500 ? 4 : 10;
  const cardW = Math.min(104, Math.floor((board.w - 16 - gap * 6) / 7)); // 16 = board padding
  const cardH = Math.round(cardW * 1.4);
  const tabTop = cardH + gap * 3;
  const tabAvail = Math.max(cardH, board.h - tabTop - 6);
  const colOffsets = (pile) => {
    let down = cardH * 0.12;
    let up = cardH * 0.27;
    const fu = firstUp(pile);
    const needed = cardH + down * Math.min(fu, Math.max(0, pile.length - 1)) + up * Math.max(0, pile.length - 1 - fu);
    if (needed > tabAvail && pile.length > 1) {
      const scale = (tabAvail - cardH) / (needed - cardH);
      down *= scale;
      up *= scale;
    }
    let y = 0;
    return pile.map((e, i) => {
      const top = y;
      y += i < fu ? down : up;
      return top;
    });
  };

  const stuck = useMemo(() => !game.won && !hasUsefulMove(game), [game]);
  const autoFinish = canAutoFinish(game);
  const hiddenFrom = drag?.from;
  const isHidden = (where, col, index) =>
    hiddenFrom &&
    ((where === "tableau" && hiddenFrom.type === "tableau" && hiddenFrom.col === col && index >= hiddenFrom.index) ||
      (where === "waste" && hiddenFrom.type === "waste") ||
      (where === "foundation" && hiddenFrom.type === "foundation" && hiddenFrom.suit === col));
  const dragCards = drag ? movingCards(game, drag.from) ?? [] : [];
  const st = settings.stats[game.drawCount] ?? EMPTY_STATS;
  const wasteShown = game.drawCount === 3 ? game.waste.slice(-3) : game.waste.slice(-1);

  return (
    <div className="app solitaire" style={{ "--w-sol": `${cardW}px` }}>
      <header className="topbar">
        <button className="iconBtn" type="button" onClick={onHome} aria-label="All games">
          ⌂
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
        <div className="heartsTitle solTitle">
          <span className="htName">Solitaire</span>
          <span className="htMeta">
            Draw {game.drawCount} · <b>{game.moves}</b> moves · {fmtTime(game.elapsed)}
          </span>
        </div>
        <button className="iconBtn" type="button" onClick={undo} disabled={!history.current.length || game.won} aria-label="Undo">
          ↶
        </button>
        <button
          className="iconBtn"
          type="button"
          onClick={() => (game.moves > 0 && !game.won && !stuck ? setConfirmNew(true) : deal())}
          aria-label="New deal"
        >
          ↻
        </button>
      </header>

      {stuck && (
        <div className="stuckBanner">
          <span>
            <b>No more useful moves.</b> This deal is stuck.
          </span>
          <span className="btnRow">
            <button className="btn ghost small" type="button" onClick={undo} disabled={!history.current.length}>
              Undo
            </button>
            <button className="btn primary small" type="button" onClick={() => deal()}>
              Redeal
            </button>
          </span>
        </div>
      )}
      {autoFinish && !finishing && !stuck && (
        <div className="stuckBanner finish">
          <span>Every card is face up.</span>
          <button className="btn gold small" type="button" onClick={() => setFinishing(true)}>
            Finish
          </button>
        </div>
      )}

      <main className="solBoard" ref={boardRef}>
        {/* Top row: stock, waste, foundations */}
        <div className="solRow" style={{ gap }}>
          <button
            type="button"
            className="solSlot stock"
            onClick={() => act({ type: "draw" })}
            aria-label={game.stock.length ? "Draw" : "Turn the waste over"}
          >
            {game.stock.length ? <CardBack size="sol" /> : <span className="recycle">{game.waste.length ? "↻" : ""}</span>}
          </button>
          <div className="solWaste" style={{ width: cardW * 2 + gap }}>
            {wasteShown.map((c, i) => {
              const isTop = i === wasteShown.length - 1;
              return (
                <div
                  key={cardKey(c)}
                  className={`solCard ${isTop && isHidden("waste") ? "ghost" : ""} ${shake === cardKey(c) ? "shake" : ""}`}
                  style={{ left: i * cardW * 0.3, zIndex: i }}
                  onPointerDown={isTop ? (e) => onPointerDown(e, { type: "waste" }, cardKey(c)) : undefined}
                >
                  <Card c={c} size="sol" />
                </div>
              );
            })}
          </div>
          {SUITS.map((suit) => {
            const pile = game.foundations[suit];
            const top = pile[pile.length - 1];
            return (
              <div key={suit} className="solSlot foundation" data-drop="foundation" data-suit={suit}>
                <span className={`fSuit ${suit === "♥" || suit === "♦" ? "red" : ""}`}>{suit}</span>
                {top && (
                  <div
                    className={`solCard ${isHidden("foundation", suit) ? "ghost" : ""}`}
                    style={{ top: 0, left: 0 }}
                    onPointerDown={(e) => onPointerDown(e, { type: "foundation", suit }, cardKey(top))}
                  >
                    <Card c={top} size="sol" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tableau */}
        <div className="solTableau" style={{ gap, top: tabTop }}>
          {game.tableau.map((pile, col) => {
            const tops = colOffsets(pile);
            return (
              <div key={col} className="solCol" data-drop="tableau" data-col={col}>
                {!pile.length && <div className="solSlot emptyCol">K</div>}
                {pile.map((e, index) => (
                  <div
                    key={cardKey(e.card)}
                    className={`solCard ${isHidden("tableau", col, index) ? "ghost" : ""} ${shake === cardKey(e.card) ? "shake" : ""}`}
                    style={{ top: tops[index], zIndex: index }}
                    onPointerDown={e.up ? (ev) => onPointerDown(ev, { type: "tableau", col, index }, cardKey(e.card)) : undefined}
                  >
                    {e.up ? <Card c={e.card} size="sol" /> : <CardBack size="sol" />}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </main>

      {/* The cards being dragged follow your finger */}
      {drag && dragCards.length > 0 && (
        <div className="solDrag" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY }}>
          {dragCards.map((c, i) => (
            <div key={cardKey(c)} className="solCard" style={{ top: i * cardH * 0.27 }}>
              <Card c={c} size="sol" />
            </div>
          ))}
        </div>
      )}

      {game.won && (
        <Modal className="result good">
          <div className="bigTitle">You won! 🎉</div>
          <div className="pointsLine">
            {game.moves} moves · {fmtTime(game.elapsed)}
          </div>
          <div className="sub muted">
            Best (draw {game.drawCount}): {st.bestMoves ?? "—"} moves · {st.bestTime !== null ? fmtTime(st.bestTime) : "—"}
          </div>
          <div className="sub muted">
            Won {st.won} of {st.played}
          </div>
          <button className="btn primary wide" type="button" onClick={() => deal()}>
            Deal again
          </button>
        </Modal>
      )}

      {confirmNew && (
        <Modal onClose={() => setConfirmNew(false)} className="result">
          <div className="bigTitle">New deal?</div>
          <div className="sub">This game will be counted as a loss.</div>
          <div className="btnRow" style={{ justifyContent: "center" }}>
            <button className="btn primary" type="button" onClick={() => deal()}>
              Deal
            </button>
            <button className="btn ghost" type="button" onClick={() => setConfirmNew(false)}>
              Keep playing
            </button>
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Solitaire settings</span>
            <button className="btn ghost small" type="button" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
          <div className="section">
            <div className="sectionTitle">Draw</div>
            <Seg
              options={[[1, "Draw 1"], [3, "Draw 3"]]}
              value={settings.drawCount}
              onChange={(v) => setSettings((s) => ({ ...s, drawCount: v }))}
            />
            {settings.drawCount !== game.drawCount && (
              <div className="pendingNote">
                <span>Takes effect on the next deal.</span>
                <button
                  className="btn primary small"
                  type="button"
                  onClick={() => {
                    deal(settings.drawCount);
                    setShowSettings(false);
                  }}
                >
                  Deal now
                </button>
              </div>
            )}
          </div>
          <div className="section">
            <div className="sectionTitle">Stats</div>
            <table className="scoreTable">
              <thead>
                <tr>
                  <th />
                  <th>Played</th>
                  <th>Won</th>
                  <th>Best moves</th>
                  <th>Best time</th>
                </tr>
              </thead>
              <tbody>
                {[1, 3].map((d) => {
                  const x = settings.stats[d] ?? EMPTY_STATS;
                  return (
                    <tr key={d}>
                      <td>Draw {d}</td>
                      <td>{x.played}</td>
                      <td>{x.won}</td>
                      <td>{x.bestMoves ?? "—"}</td>
                      <td>{x.bestTime !== null ? fmtTime(x.bestTime) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="section">
            <div className="sectionTitle">How to play</div>
            <ul className="help rulesList">
              <li>Build each foundation (top right) from ace to king in one suit.</li>
              <li>In the columns, stack down in alternating colors. Only a king can go in an empty column.</li>
              <li>Tap a card to send it to the best spot, or drag it where you want it.</li>
              <li>Tap the deck to draw. When it runs out, tap again to turn the waste back over.</li>
              <li>Every draw, move and undo counts as a move.</li>
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}
