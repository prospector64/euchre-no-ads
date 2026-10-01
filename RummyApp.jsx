import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Card, CardBack, Modal, LogList, Seg, SPEEDS, load, save } from "./ui.jsx";
import {
  DEFAULT_RULES,
  applyAction,
  newGame,
  sortHand,
  cardKey,
  cardLabel,
  sameCard,
  checkMeld,
  layoffPos,
  canUse,
  playedValue,
  handValue,
} from "./rummy-engine.js";
import { botAction } from "./rummy-ai.js";

const ME = 0;
const GAME_KEY = "rummy.game.v1";
const SETTINGS_KEY = "rummy.settings.v1";
const SEAT_COLORS = ["#5dd6ff", "#ff8a7a", "#ffd54a", "#b98cff"];

const DEFAULT_SETTINGS = {
  names: ["Nick", "Jim", "Maddie", "Jenn"],
  rules: DEFAULT_RULES,
  speed: "normal",
  sortBy: "suit",
};

function loadSettings() {
  const s = load(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...s, rules: { ...DEFAULT_RULES, ...(s.rules ?? {}) } };
}

function initialGame() {
  const saved = load(GAME_KEY, null);
  if (saved && saved.v === 1 && Array.isArray(saved.hands)) return saved;
  return newGame(loadSettings().rules);
}

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return w;
}

export default function RummyApp({ onHome }) {
  const [settings, setSettings] = useState(loadSettings);
  const [game, dispatch] = useReducer(applyAction, undefined, initialGame);
  const [selected, setSelected] = useState([]);
  const [pickIndex, setPickIndex] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const width = useWidth();

  const n = game.n;
  const names = settings.names;
  const nm = (text) => text.replace(/\{(\d)\}/g, (_, i) => names[+i]);
  const speed = SPEEDS[settings.speed] ?? SPEEDS.normal;
  const rules = settings.rules;
  const setRules = (patch) => setSettings((s) => ({ ...s, rules: { ...s.rules, ...patch } }));

  useEffect(() => save(GAME_KEY, game), [game]);
  useEffect(() => save(SETTINGS_KEY, settings), [settings]);

  // Clear choices whenever it stops being our move
  useEffect(() => {
    setPickIndex(null);
    if (game.turn !== ME) setSelected([]);
  }, [game.turn, game.phase, game.handNo]);
  // Drop selections for cards that have left the hand
  useEffect(() => {
    setSelected((sel) => sel.filter((k) => game.hands[ME].some((c) => cardKey(c) === k)));
  }, [game.hands]);

  // Drive the bots one step at a time so you can follow along
  useEffect(() => {
    if (game.turn === null || game.turn === ME || !["draw", "play"].includes(game.phase)) return;
    const delay = game.phase === "draw" ? speed.bid : speed.play;
    const timer = setTimeout(() => {
      const a = botAction(game, game.turn);
      if (a) dispatch(a);
    }, delay);
    return () => clearTimeout(timer);
  }, [game, speed]);

  /** ---------- Derived ---------- */
  const { phase, melds, discard, stock } = game;
  const myTurn = game.turn === ME && (phase === "draw" || phase === "play");
  const myHand = useMemo(() => sortHand(game.hands[ME], settings.sortBy), [game.hands, settings.sortBy]);
  const selCards = game.hands[ME].filter((c) => selected.includes(cardKey(c)));
  const handLen = game.hands[ME].length;

  const meldShape = selCards.length >= 3 ? checkMeld(selCards) : null;
  const canMeld = myTurn && phase === "play" && meldShape && handLen - selCards.length >= 1;
  const layoffTargets =
    myTurn && phase === "play" && selCards.length === 1 && handLen >= 2
      ? melds.filter((m) => layoffPos(selCards[0], m) !== null)
      : [];
  const canDiscard = myTurn && phase === "play" && selCards.length === 1 && !game.mustPlay;
  const laidThisHand = (seat) =>
    melds.reduce((sum, m) => sum + m.cards.filter((e) => e.by === seat).reduce((x, e) => x + playedValue(e), 0), 0);

  // Ignore a stale pick (e.g. the pile just changed) until the reset effect clears it
  const pickValid = phase === "draw" && pickIndex !== null && pickIndex < discard.length;
  const pickCards = pickValid ? discard.slice(pickIndex) : [];
  const pickOk = pickValid && canUse(discard[pickIndex], [...game.hands[ME], ...pickCards], melds);

  /** ---------- Actions ---------- */
  const act = (a) => dispatch({ ...a, seat: ME });
  const toggle = (c) => {
    const k = cardKey(c);
    setSelected((sel) => (sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]));
  };
  function doMeld() {
    act({ type: "meld", cards: selCards });
    setSelected([]);
  }
  function doLayoff(meldId) {
    act({ type: "layoff", card: selCards[0], meldId });
    setSelected([]);
  }
  function doDiscard() {
    act({ type: "discard", card: selCards[0] });
    setSelected([]);
  }
  function newGameNow() {
    dispatch({ type: "newGame", rules });
    setConfirmRestart(false);
    setShowSettings(false);
  }

  /** ---------- Prompt + buttons ---------- */
  let prompt = "";
  let buttons = null;
  if (phase === "idle") {
    prompt = `${n} players · first to ${game.rules.target} wins.`;
    buttons = (
      <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "newGame", rules })}>
        Deal
      </button>
    );
  } else if (myTurn && phase === "draw") {
    if (!pickValid) {
      prompt = stock.length
        ? "Draw from the pile, or tap a card in the discards to pick up from there."
        : "The pile is empty. Pick up from the discards or end the hand.";
      if (!stock.length) {
        buttons = (
          <button className="btn ghost" type="button" onClick={() => act({ type: "stockOut" })}>
            End the hand
          </button>
        );
      }
    } else {
      const bottom = discard[pickIndex];
      prompt = pickOk
        ? `Take ${pickCards.length} card${pickCards.length > 1 ? "s" : ""}? You'll have to play the ${cardLabel(bottom)} this turn.`
        : `You can't play the ${cardLabel(bottom)} right now (and still keep a card to discard), so you can't pick up from there.`;
      buttons = (
        <div className="btnRow">
          <button className="btn primary" type="button" disabled={!pickOk} onClick={() => act({ type: "takeDiscard", index: pickIndex })}>
            Pick up {pickCards.length}
          </button>
          <button className="btn ghost" type="button" onClick={() => setPickIndex(null)}>
            Cancel
          </button>
        </div>
      );
    }
  } else if (myTurn && phase === "play") {
    if (game.mustPlay && !selCards.length) {
      prompt = `Play the ${cardLabel(game.mustPlay)} you picked up: lay it down in a meld or play it off the table.`;
    } else if (!selCards.length) {
      prompt = "Tap cards to lay down a meld, play a card off the table, or discard to end your turn.";
    } else if (selCards.length === 1) {
      prompt = layoffTargets.length
        ? "Tap a glowing meld to play it there, or discard it."
        : game.mustPlay
        ? `Play the ${cardLabel(game.mustPlay)} before you discard.`
        : handLen === 1
        ? "Discard your last card to go out!"
        : "Discard it, or pick more cards for a meld.";
    } else {
      prompt = canMeld
        ? `${meldShape.type === "set" ? "Set" : "Run"} worth ${handValue(selCards)} — lay it down?`
        : handLen - selCards.length < 1
        ? "You need to keep a card to discard."
        : "That's not a meld yet (3+ of a kind, or 3+ in a row of one suit).";
    }
    buttons = (
      <div className="btnRow">
        <button className="btn primary" type="button" disabled={!canMeld} onClick={doMeld}>
          Lay down
        </button>
        {layoffTargets.length === 1 && (
          <button className="btn primary" type="button" onClick={() => doLayoff(layoffTargets[0].id)}>
            Play on table
          </button>
        )}
        <button className={`btn ${handLen === 1 ? "gold" : "ghost"}`} type="button" disabled={!canDiscard} onClick={doDiscard}>
          {handLen === 1 ? "Discard & go out" : "Discard"}
        </button>
        {selCards.length > 0 && (
          <button className="btn ghost small" type="button" onClick={() => setSelected([])}>
            Clear
          </button>
        )}
      </div>
    );
  } else if (phase === "draw" || phase === "play") {
    prompt = `${names[game.turn]} is playing…`;
  }

  /** ---------- Hand layout ---------- */
  const handWidth = Math.min(width - 16, 1020);
  const cardW = width >= 1000 ? 96 : Math.min(90, Math.max(52, width * 0.165));
  const perRow = width < 700 ? 9 : 15;
  const rows = [];
  for (let i = 0; i < myHand.length; i += perRow) rows.push(myHand.slice(i, i + perRow));
  const overlap = (count) => (count > 1 ? Math.min(8, (handWidth - count * cardW) / (count - 1)) : 0);

  const r = game.result;
  const others = [...Array(n).keys()].filter((s) => s !== ME);

  return (
    <div className="app rummy">
      <header className="topbar">
        <button className="iconBtn" type="button" onClick={onHome} aria-label="All games">
          ⌂
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
        <button className="heartsTitle" type="button" onClick={() => setShowScores(true)}>
          <span className="htName">Rummy 500</span>
          <span className="htMeta">
            {game.handNo ? `Hand ${game.handNo} · ` : ""}to {game.rules.target} · Scores ›
          </span>
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowLog(true)} aria-label="Game log">
          ☰
        </button>
      </header>

      <main className="table rummyTable">
        <div className="rOpps">
          {others.map((seat) => (
            <div key={seat} className={`rOpp ${game.turn === seat && ["draw", "play"].includes(phase) ? "active" : ""}`}>
              <div className="plate">
                <span className="ownerDot" style={{ background: SEAT_COLORS[seat] }} />
                <span className="plateName">{names[seat]}</span>
                <span className="seatScore">{game.scores[seat]}</span>
              </div>
              <div className="seatMeta">
                <span className="cardCount">{game.hands[seat].length} card{game.hands[seat].length === 1 ? "" : "s"}</span>
                {laidThisHand(seat) > 0 && <span className="laidPts">+{laidThisHand(seat)} down</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="lastAction">{game.lastAction ? nm(game.lastAction) : " "}</div>

        <div className="meldArea">
          {melds.length === 0 && <div className="meldEmpty">Melds go here</div>}
          {melds.map((m) => {
            const target = layoffTargets.some((t) => t.id === m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`meld ${target ? "target" : ""}`}
                disabled={!target}
                onClick={() => doLayoff(m.id)}
              >
                {m.cards.map((e) => (
                  <span key={cardKey(e.card)} className="meldCard">
                    <Card c={e.card} size="sm" />
                    <span className="ownerBar" style={{ background: SEAT_COLORS[e.by] }} />
                  </span>
                ))}
              </button>
            );
          })}
        </div>

        <div className="piles">
          <button
            type="button"
            className={`stockPile ${myTurn && phase === "draw" && stock.length ? "ready" : ""}`}
            disabled={!(myTurn && phase === "draw" && stock.length)}
            onClick={() => act({ type: "drawStock" })}
          >
            {stock.length ? <CardBack size="sm" /> : <span className="emptyPile">empty</span>}
            <span className="pileCount">{stock.length}</span>
          </button>
          <div className="discardSpread">
            {discard.map((c, i) => {
              const inPick = pickValid && i >= pickIndex;
              return (
                <button
                  key={cardKey(c)}
                  type="button"
                  className={`dCard ${inPick ? "picked" : ""} ${i === pickIndex ? "bottom" : ""}`}
                  disabled={!(myTurn && phase === "draw")}
                  onClick={() => setPickIndex(i === pickIndex ? null : i)}
                >
                  <Card c={c} size="sm" />
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <section className="panel">
        <div className="meRow">
          <span className={`plate mePlate ${myTurn ? "active" : ""}`}>
            <span className="ownerDot" style={{ background: SEAT_COLORS[ME] }} />
            <span className="plateName">{names[ME]}</span>
            <span className="seatScore">{game.scores[ME]}</span>
            {laidThisHand(ME) > 0 && <span className="laidPts">+{laidThisHand(ME)}</span>}
          </span>
          <span className="prompt">{prompt}</span>
          <button
            className="btn ghost small sortBtn"
            type="button"
            onClick={() => setSettings((s) => ({ ...s, sortBy: s.sortBy === "suit" ? "rank" : "suit" }))}
          >
            Sort: {settings.sortBy}
          </button>
        </div>
        {buttons && <div className="actions">{buttons}</div>}
      </section>

      <section className={`hand heartsHand ${rows.length > 1 ? "twoRows" : ""}`}>
        {rows.map((row, ri) => (
          <div key={ri} className="handRow" style={{ "--ov": `${overlap(row.length)}px`, "--w-lg": `${cardW}px` }}>
            {row.map((c) => {
              const k = cardKey(c);
              const must = game.mustPlay && sameCard(c, game.mustPlay);
              return (
                <Card
                  key={k}
                  c={c}
                  size="lg"
                  onClick={myTurn && phase === "play" ? () => toggle(c) : undefined}
                  selected={selected.includes(k)}
                  className={must ? "fresh" : ""}
                  tag={must ? "play" : null}
                />
              );
            })}
          </div>
        ))}
      </section>

      {/* ---------- Hand over / game over ---------- */}
      {(phase === "handOver" || phase === "gameOver") && r && (
        <Modal className={`result ${phase === "gameOver" ? (game.winner === ME ? "good" : "bad") : ""}`}>
          <div className="bigTitle">
            {phase === "gameOver"
              ? game.winner === ME
                ? "You win! 🎉"
                : `${names[game.winner]} wins`
              : r.outSeat === null
              ? "The pile ran out"
              : r.outSeat === ME
              ? "You went out!"
              : `${names[r.outSeat]} went out`}
          </div>
          <table className="scoreTable">
            <thead>
              <tr>
                <th />
                <th>Laid</th>
                <th>In hand</th>
                <th>Hand</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(n).keys()].map((seat) => (
                <tr key={seat} className={seat === ME ? "me" : ""}>
                  <td>{names[seat]}</td>
                  <td>+{r.laid[seat]}</td>
                  <td>{r.left[seat] ? `−${r.left[seat]}` : "0"}</td>
                  <td>
                    <b>{r.net[seat] >= 0 ? `+${r.net[seat]}` : r.net[seat]}</b>
                  </td>
                  <td>{game.scores[seat]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {phase === "gameOver" ? (
            <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "newGame", rules })}>
              New game
            </button>
          ) : (
            <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "deal", rules })}>
              Next hand
            </button>
          )}
        </Modal>
      )}

      {/* ---------- Score sheet ---------- */}
      {showScores && (
        <Modal onClose={() => setShowScores(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Score sheet</span>
            <button className="btn ghost small" type="button" onClick={() => setShowScores(false)}>
              Close
            </button>
          </div>
          <div className="scoreScroll">
            <table className="scoreTable sheetTable">
              <thead>
                <tr>
                  <th>#</th>
                  {[...Array(n).keys()].map((seat) => (
                    <th key={seat}>{names[seat]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {game.history.map((h, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    {h.net.map((v, seat) => (
                      <td key={seat}>
                        {v >= 0 ? `+${v}` : v}
                        {h.outSeat === seat ? " ✓" : ""}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="totalRow">
                  <td>Σ</td>
                  {game.scores.map((sc, seat) => (
                    <td key={seat}>{sc}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="help">✓ = went out. First to {game.rules.target} wins.</p>
        </Modal>
      )}

      {/* ---------- Log ---------- */}
      {showLog && (
        <Modal onClose={() => setShowLog(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Game log</span>
            <button className="btn ghost small" type="button" onClick={() => setShowLog(false)}>
              Close
            </button>
          </div>
          <LogList log={game.log} nm={nm} />
        </Modal>
      )}

      {/* ---------- Settings ---------- */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Rummy settings</span>
            <button className="btn ghost small" type="button" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>

          <div className="section">
            <div className="sectionTitle">Players</div>
            <Seg options={[2, 3, 4].map((p) => [p, `${p}`])} value={rules.players} onChange={(p) => setRules({ players: p })} />
            <div className="nameGrid">
              {names.slice(0, rules.players).map((name, i) => (
                <label key={i} className="field">
                  <span>{i === 0 ? "You" : `Player ${i + 1}`}</span>
                  <input
                    value={name}
                    maxLength={14}
                    onChange={(e) =>
                      setSettings((s) => {
                        const next = [...s.names];
                        next[i] = e.target.value;
                        return { ...s, names: next };
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Play to</div>
            <div className="btnRow">
              <Seg options={[250, 500, 750].map((t) => [t, `${t}`])} value={rules.target} onChange={(t) => setRules({ target: t })} />
              <input
                className="numInput"
                type="number"
                inputMode="numeric"
                min={50}
                max={2000}
                value={rules.target}
                onChange={(e) => setRules({ target: Math.max(50, Math.min(2000, +e.target.value || 500)) })}
                aria-label="Custom target score"
              />
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Cards dealt (2 players)</div>
            <Seg options={[7, 10, 13].map((c) => [c, `${c}`])} value={rules.twoPlayerHand} onChange={(c) => setRules({ twoPlayerHand: c })} />
            <p className="help">3–4 players always get 7 cards each.</p>
            {(rules.players !== game.n || rules.target !== game.rules.target) && (
              <div className="pendingNote">
                <span>Player count and target take effect in a new game.</span>
                <button className="btn primary small" type="button" onClick={newGameNow}>
                  Start new game
                </button>
              </div>
            )}
          </div>

          <div className="section">
            <div className="sectionTitle">How it works</div>
            <ul className="help rulesList">
              <li>Melds: 3 or 4 of a kind, or 3+ in a row of one suit. Ace is high or low, but no K-A-2.</li>
              <li>Laying down is optional. Anyone can play single cards off any meld on the table.</li>
              <li>You can pick up as deep into the discards as you like, but you must play the bottom card you took that turn.</li>
              <li>Melds can't be rearranged once they're down.</li>
              <li>You must discard to go out.</li>
              <li>Scoring: aces 15, 10/J/Q/K 10, 2–9 are 5. You score what you've laid down, minus what's left in your hand.</li>
            </ul>
          </div>

          <div className="section">
            <div className="sectionTitle">Bot speed</div>
            <Seg
              options={[["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]]}
              value={settings.speed}
              onChange={(v) => setSettings((s) => ({ ...s, speed: v }))}
            />
          </div>

          <div className="section row">
            <span className="muted">Current game: {game.n} players, to {game.rules.target}</span>
            {confirmRestart ? (
              <span className="btnRow">
                <button className="btn danger small" type="button" onClick={newGameNow}>
                  Yes, restart
                </button>
                <button className="btn ghost small" type="button" onClick={() => setConfirmRestart(false)}>
                  Keep playing
                </button>
              </span>
            ) : (
              <button className="btn ghost small" type="button" onClick={() => setConfirmRestart(true)}>
                Restart game
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
