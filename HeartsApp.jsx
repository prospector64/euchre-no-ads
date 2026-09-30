import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Card, CardBack, Modal, LogList, Seg, SPEEDS, SUIT_NAMES, load, save } from "./ui.jsx";
import {
  DEFAULT_RULES,
  DIR_LABELS,
  PASS_DIRS,
  applyAction,
  newGame,
  sortHand,
  legalPlays,
  cardKey,
  cardLabel,
  sameCard,
  passTarget,
  pointsIn,
  isQueenSpades,
  trickWinnerIndex,
  dirsFor,
} from "./hearts-engine.js";
import { botAction } from "./hearts-ai.js";

const ME = 0;
const GAME_KEY = "hearts.game.v1";
const SETTINGS_KEY = "hearts.settings.v1";

const DEFAULT_SETTINGS = {
  names: ["Nick", "Collin", "Christian", "Matt", "Jack", "Luigi"],
  rules: DEFAULT_RULES,
  speed: "normal",
};

const MODE_LABELS = [
  ["cycle", "Cycle"],
  ["rotate", "Rotate"],
  ["left", "Left"],
  ["right", "Right"],
  ["across", "Across"],
  ["random", "Random"],
  ["hold", "Hold"],
];
const MODE_HELP = {
  cycle: "A random direction each hand from the ones ticked below, never the same twice in a row.",
  rotate: "Classic order: left, right, across, hold (across is skipped with 3 or 5 players).",
  left: "Always pass to the player on your left.",
  right: "Always pass to the player on your right.",
  across: "Always pass across the table (4 or 6 players only).",
  random: "Everyone's passed cards get shuffled together and dealt back out. You might get your own back.",
  hold: "No passing.",
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

/** Where each seat sits around the table, as percentages. Seat 0 is at the bottom, clockwise from there. */
function seatAngle(seat, n) {
  return ((90 + (seat * 360) / n) * Math.PI) / 180;
}
function place(seat, n, rx, ry) {
  const a = seatAngle(seat, n);
  return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` };
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

function PointsBadge({ cards }) {
  const hearts = cards.filter((c) => c.s === "♥").length;
  const queen = cards.some(isQueenSpades);
  if (!hearts && !queen) return null;
  return (
    <span className="ptsBadge">
      {hearts > 0 && <span className="ptsHearts">♥{hearts}</span>}
      {queen && <span className="ptsQueen">Q♠</span>}
    </span>
  );
}

export default function HeartsApp({ onHome }) {
  const [settings, setSettings] = useState(loadSettings);
  const [game, dispatch] = useReducer(applyAction, undefined, initialGame);
  const [picked, setPicked] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const width = useWidth();

  const n = game.n;
  const names = settings.names;
  const nm = (text) => text.replace(/\{(\d)\}/g, (_, i) => names[+i]);
  const speed = SPEEDS[settings.speed] ?? SPEEDS.normal;
  const rules = settings.rules;

  useEffect(() => save(GAME_KEY, game), [game]);
  useEffect(() => save(SETTINGS_KEY, settings), [settings]);
  useEffect(() => {
    setPicked([]);
    setShowLast(false);
  }, [game.phase, game.handNo]);

  // Drive the bots and trick pacing
  useEffect(() => {
    let timer;
    if (game.phase === "trickDone") {
      timer = setTimeout(() => dispatch({ type: "collect" }), speed.trick);
    } else if (game.phase === "pass") {
      const bot = game.passes.findIndex((p, seat) => seat !== ME && !p);
      if (bot >= 0) timer = setTimeout(() => dispatch(botAction(game, bot)), 120);
    } else if (game.phase === "playing" && game.turn !== ME) {
      timer = setTimeout(() => {
        const a = botAction(game, game.turn);
        if (a) dispatch(a);
      }, speed.play);
    }
    return () => clearTimeout(timer);
  }, [game, speed]);

  const setRules = (patch) => setSettings((s) => ({ ...s, rules: { ...s.rules, ...patch } }));

  /** ---------- Derived ---------- */
  const { phase, trick } = game;
  const myTurn = phase === "playing" && game.turn === ME;
  const myHand = useMemo(() => sortHand(game.hands[ME]), [game.hands]);
  const legalKeys = useMemo(
    () => new Set(myTurn ? legalPlays(game, ME).map(cardKey) : []),
    [game, myTurn]
  );
  const receivedKeys = new Set((game.received?.[ME] ?? []).map(cardKey));
  const inHand = ["pass", "playing", "trickDone"].includes(phase);
  const k = game.rules.passCount;
  const passing = phase === "pass" && !game.passes[ME];
  const winnerSeat = phase === "trickDone" ? game.trickWinner : trick.length ? trick[trickWinnerIndex(trick)].player : null;
  const showingLast = showLast && game.lastTrick && !trick.length;
  const centerTrick = showingLast ? game.lastTrick.cards : trick;
  const danger = (seat) => game.scores[seat] >= game.rules.target * 0.75;
  // Points each player has visibly taken (face-down extras stay hidden until the hand ends)
  const visibleTaken = (seat) =>
    game.taken[seat].filter((c) => !(game.leftoverTaker === seat && game.leftover.some((x) => sameCard(x, c))));

  const passWho = (() => {
    if (game.passDir === "random") return "to a random pile";
    const to = passTarget(game.passDir, ME, n);
    return to === null ? "" : `to ${names[to]}`;
  })();

  function tapCard(c) {
    const key = cardKey(c);
    if (passing) {
      setPicked((p) => (p.includes(key) ? p.filter((x) => x !== key) : p.length < k ? [...p, key] : p));
      return;
    }
    if (myTurn && legalKeys.has(key)) dispatch({ type: "play", seat: ME, card: c });
  }

  function newGameNow() {
    dispatch({ type: "newGame", rules });
    setConfirmRestart(false);
    setShowSettings(false);
  }

  /** ---------- Prompt ---------- */
  let prompt = "";
  let actions = null;
  if (phase === "idle") {
    prompt = `${n} players · first to ${game.rules.target} loses.`;
    actions = (
      <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "newGame", rules })}>
        Deal
      </button>
    );
  } else if (passing) {
    prompt = `Pick ${k} card${k > 1 ? "s" : ""} to pass ${game.passDir === "random" ? "into the random pile" : `${DIR_LABELS[game.passDir].toLowerCase()} ${passWho}`}.`;
    actions = (
      <div className="btnRow">
        <button
          className="btn primary"
          type="button"
          disabled={picked.length !== k}
          onClick={() => dispatch({ type: "pass", seat: ME, cards: game.hands[ME].filter((c) => picked.includes(cardKey(c))) })}
        >
          Pass {picked.length}/{k}
        </button>
      </div>
    );
  } else if (phase === "pass") {
    prompt = "Waiting for everyone to pass…";
  } else if (phase === "playing" || phase === "trickDone") {
    const got = game.received?.[ME];
    const gotText =
      got && game.trickNo === 0
        ? ` You got ${got.map(cardLabel).join(" ")}${
            game.passDir === "random" ? "" : ` from ${names[game.passes.findIndex((_, seat) => passTarget(game.passDir, seat, n) === ME)]}`
          }.`
        : "";
    if (phase === "trickDone") {
      const pts = pointsIn(trick.map((p) => p.card));
      prompt = `${game.trickWinner === ME ? "You take" : `${names[game.trickWinner]} takes`} the trick${pts ? ` (+${pts})` : ""}${
        game.trickNo === 1 && game.leftover.length ? " and the face-down cards" : ""
      }.`;
    } else if (myTurn) {
      if (!trick.length) {
        prompt =
          game.trickNo === 0
            ? `You lead the ${cardLabel(game.openingCard)}.`
            : game.rules.mustBreakHearts && !game.heartsBroken && legalKeys.size < game.hands[ME].length
            ? "Your lead. Hearts aren't broken yet."
            : "Your lead.";
      } else {
        const lead = trick[0].card.s;
        prompt = game.hands[ME].some((c) => c.s === lead) ? `Follow suit: ${SUIT_NAMES[lead]}.` : `No ${SUIT_NAMES[lead].toLowerCase()} — play anything${game.trickNo === 0 && game.rules.noPointsFirstTrick ? " (no points on the first trick)" : ""}.`;
      }
    } else {
      prompt = `${names[game.turn]}'s turn…`;
    }
    prompt += gotText;
  }

  /** ---------- Hand layout: one fanned row, or two rows on narrow screens ---------- */
  const handWidth = Math.min(width - 16, 1020);
  const cardW = width >= 1000 ? 104 : Math.min(96, Math.max(54, width * 0.175));
  const twoRows = myHand.length > 8 && width < 700;
  const rows = twoRows ? [myHand.slice(0, Math.ceil(myHand.length / 2)), myHand.slice(Math.ceil(myHand.length / 2))] : [myHand];
  const overlap = (count) => (count > 1 ? Math.min(10, (handWidth - count * cardW) / (count - 1)) : 0);

  /** ---------- Results ---------- */
  const r = game.result;
  const losers = game.losers ?? [];
  const standings = [...Array(n).keys()].sort((a, b) => game.scores[a] - game.scores[b]);

  return (
    <div className="app hearts">
      <header className="topbar">
        <button className="iconBtn" type="button" onClick={onHome} aria-label="All games">
          ⌂
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
        <button className="heartsTitle" type="button" onClick={() => setShowScores(true)}>
          <span className="htName">Hearts</span>
          <span className="htMeta">
            {game.handNo ? `Hand ${game.handNo} · ` : ""}
            {game.rules.target} loses · Scores ›
          </span>
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowLog(true)} aria-label="Game log">
          ☰
        </button>
      </header>

      <div className="statusStrip">
        <span>
          {inHand && game.passDir && (
            <>
              Pass <b>{game.passDir === "hold" ? "— hold" : `${k} ${DIR_LABELS[game.passDir]}`}</b>
              {game.trickNo === 0 && game.leftover.length > 0 && (
                <span className="muted"> · {game.leftover.length} face down → trick 1</span>
              )}
            </>
          )}
        </span>
        {inHand && (
          <span className={`heartsState ${game.heartsBroken ? "broken" : ""}`}>
            {game.heartsBroken ? "♥ broken" : "♥ not broken"}
          </span>
        )}
      </div>

      <main className={`table heartsTable n${n}`}>
        {[...Array(n).keys()].filter((s) => s !== ME).map((seat) => {
          const active = phase === "playing" && game.turn === seat;
          const pos = n >= 5 ? place(seat, n, 40, 43) : place(seat, n, 38, 41);
          return (
            <div key={seat} className={`hSeat ${active ? "active" : ""}`} style={pos}>
              <div className="plate">
                <span className="plateName">{names[seat]}</span>
                <span className={`seatScore ${danger(seat) ? "danger" : ""}`}>{game.scores[seat]}</span>
              </div>
              <div className="seatMeta">
                {inHand && <span className="cardCount">{game.hands[seat].length} cards</span>}
                <PointsBadge cards={visibleTaken(seat)} />
                {phase === "pass" && game.passes[seat] && <span className="passedTick">passed ✓</span>}
              </div>
            </div>
          );
        })}

        {[...Array(n).keys()].map((seat) => {
          const p = centerTrick.find((x) => x.player === seat);
          if (!p) return null;
          return (
            <div key={`t${seat}`} className="hSlot" style={width >= 1000 ? place(seat, n, n >= 5 ? 20 : 22, 21) : n >= 5 ? place(seat, n, 17, 24) : place(seat, n, 20, 25)}>
              <Card
                c={p.card}
                size="md"
                className="played"
                glow={!showingLast && winnerSeat === seat}
                dim={!showingLast && phase === "trickDone" && winnerSeat !== seat}
              />
            </div>
          );
        })}

        <div className="hCenter">
          {phase === "pass" && (
            <div className="passBanner">
              <div className="pbDir">{game.passDir === "random" ? "🔀 Random" : `${DIR_LABELS[game.passDir]} ${game.passDir === "left" ? "←" : game.passDir === "right" ? "→" : "↕"}`}</div>
              <div className="pbSub">Pass {k} card{k > 1 ? "s" : ""}</div>
            </div>
          )}
          {inHand && game.leftover.length > 0 && game.trickNo === 0 && phase !== "pass" && (
            <div className="leftoverPile">
              <div className="lpCards">
                {game.leftover.map((_, i) => (
                  <CardBack key={i} size="sm" style={{ transform: `translate(${i * 6}px, ${i * -3}px) rotate(${i * 5 - 5}deg)` }} />
                ))}
              </div>
              <div className="lpLabel" title="Goes to whoever wins the first trick">Face down</div>
            </div>
          )}
          {game.lastTrick && !trick.length && phase === "playing" && (
            <button className="lastBtn inline" type="button" onClick={() => setShowLast((x) => !x)}>
              {showLast ? "Hide last trick" : "Last trick"}
            </button>
          )}
        </div>
      </main>

      <section className="panel">
        <div className="meRow">
          <span className={`plate mePlate ${myTurn || passing ? "active" : ""}`}>
            <span className="plateName">{names[ME]}</span>
            <span className={`seatScore ${danger(ME) ? "danger" : ""}`}>{game.scores[ME]}</span>
            <PointsBadge cards={visibleTaken(ME)} />
          </span>
          <span className="prompt">{prompt}</span>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </section>

      <section className={`hand heartsHand ${twoRows ? "twoRows" : ""}`}>
        {rows.map((row, ri) => (
          <div key={ri} className="handRow" style={{ "--ov": `${overlap(row.length)}px`, "--w-lg": `${cardW}px` }}>
            {row.map((c) => {
              const key = cardKey(c);
              const canPlay = myTurn && legalKeys.has(key);
              return (
                <Card
                  key={key}
                  c={c}
                  size="lg"
                  onClick={canPlay || passing ? () => tapCard(c) : undefined}
                  dim={myTurn && !legalKeys.has(key)}
                  lifted={canPlay}
                  selected={picked.includes(key)}
                  className={receivedKeys.has(key) ? "fresh" : ""}
                />
              );
            })}
          </div>
        ))}
      </section>

      {/* ---------- Hand over / game over ---------- */}
      {(phase === "handOver" || phase === "gameOver") && r && (
        <Modal className={`result ${phase === "gameOver" ? (losers.includes(ME) ? "bad" : "good") : ""}`}>
          {phase === "gameOver" ? (
            <>
              <div className="bigTitle">
                {losers.includes(ME)
                  ? losers.length > 1
                    ? `You & ${losers.filter((i) => i !== ME).map((i) => names[i]).join(" & ")} lose 😬`
                    : "You lose 😬"
                  : `${losers.map((i) => names[i]).join(" & ")} lose${losers.length > 1 ? "" : "s"}!`}
              </div>
              <div className="sub">
                {losers.map((i) => names[i]).join(" & ")} hit {game.scores[losers[0]]} (limit {game.rules.target}).
              </div>
            </>
          ) : (
            <div className="bigTitle">{r.moon !== null ? `🌙 ${r.moon === ME ? "You" : names[r.moon]} shot the moon!` : `Hand ${game.handNo}`}</div>
          )}
          {game.leftover.length > 0 && (
            <div className="leftoverReveal">
              <span className="muted">Face-down cards → {names[game.leftoverTaker]}:</span>
              <span className="lrCards">
                {game.leftover.map((c) => (
                  <Card key={cardKey(c)} c={c} size="sm" />
                ))}
              </span>
              <b>{pointsIn(game.leftover) ? `+${pointsIn(game.leftover)}` : "no points"}</b>
            </div>
          )}
          <table className="scoreTable">
            <thead>
              <tr>
                <th />
                <th>This hand</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(phase === "gameOver" ? standings : [...Array(n).keys()]).map((seat) => (
                <tr key={seat} className={`${seat === ME ? "me" : ""} ${losers.includes(seat) ? "loser" : ""}`}>
                  <td>{names[seat]}</td>
                  <td>{r.points[seat] ? `+${r.points[seat]}` : "0"}</td>
                  <td className={danger(seat) ? "danger" : ""}>{game.scores[seat]}</td>
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
                    {h.points.map((p, seat) => (
                      <td key={seat}>
                        {h.moon === seat ? "🌙" : p || "·"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="totalRow">
                  <td>Σ</td>
                  {game.scores.map((sc, seat) => (
                    <td key={seat} className={danger(seat) ? "danger" : ""}>
                      {sc}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="help">The game ends when someone reaches {game.rules.target}. That player loses.</p>
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
            <span className="modalTitle">Hearts settings</span>
            <button className="btn ghost small" type="button" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>

          <div className="section">
            <div className="sectionTitle">Players</div>
            <Seg
              options={[3, 4, 5, 6].map((p) => [p, `${p}`])}
              value={rules.players}
              onChange={(p) => {
                const patch = { players: p };
                if (rules.passMode === "across" && p % 2) patch.passMode = "left";
                setRules(patch);
              }}
            />
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
            <div className="sectionTitle">Game ends at</div>
            <div className="btnRow">
              <Seg options={[50, 75, 100, 150].map((t) => [t, `${t}`])} value={rules.target} onChange={(t) => setRules({ target: t })} />
              <input
                className="numInput"
                type="number"
                inputMode="numeric"
                min={10}
                max={500}
                value={rules.target}
                onChange={(e) => setRules({ target: Math.max(10, Math.min(500, +e.target.value || 100)) })}
                aria-label="Custom score limit"
              />
            </div>
            <p className="help">Whoever reaches this first loses.</p>
            {(rules.players !== game.n || rules.target !== game.rules.target) && (
              <div className="pendingNote">
                <span>Player count and score limit take effect in a new game.</span>
                <button className="btn primary small" type="button" onClick={newGameNow}>
                  Start new game
                </button>
              </div>
            )}
          </div>

          <div className="section">
            <div className="sectionTitle">Cards to pass</div>
            <Seg options={[0, 1, 2, 3, 4].map((c) => [c, `${c}`])} value={rules.passCount} onChange={(c) => setRules({ passCount: c })} />
          </div>

          <div className="section">
            <div className="sectionTitle">Pass direction</div>
            <div className="chipGrid">
              {MODE_LABELS.map(([m, label]) => {
                const off = m === "across" && rules.players % 2 === 1;
                return (
                  <button
                    key={m}
                    type="button"
                    className={`chipBtn ${rules.passMode === m ? "on" : ""}`}
                    disabled={off}
                    onClick={() => setRules({ passMode: m })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="help">{MODE_HELP[rules.passMode]}</p>
            {rules.passMode === "cycle" && (
              <div className="chipGrid">
                {PASS_DIRS.filter((d) => dirsFor(rules.players).includes(d)).map((d) => {
                  const on = rules.cycleDirs.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`chipBtn check ${on ? "on" : ""}`}
                      onClick={() =>
                        setRules({ cycleDirs: on ? rules.cycleDirs.filter((x) => x !== d) : [...rules.cycleDirs, d] })
                      }
                    >
                      {on ? "✓ " : ""}
                      {DIR_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="section">
            <div className="sectionTitle">House rules</div>
            {[
              ["mustBreakHearts", "Hearts can't be led until broken"],
              ["queenBreaksHearts", "Playing the Q♠ breaks hearts"],
              ["noPointsFirstTrick", "No points on the first trick"],
            ].map(([key, label]) => (
              <label key={key} className={`toggle block ${rules[key] ? "on" : ""}`}>
                <input type="checkbox" checked={rules[key]} onChange={(e) => setRules({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <ul className="help rulesList">
              <li>Every card is dealt. Extras go face down to whoever wins the first trick, and they're revealed and scored at the end of the hand.</li>
              <li>Hearts are 1 point each, the Q♠ is 13.</li>
              <li>Shoot the moon (take all 26, face-down cards included) and everyone else gets 26.</li>
              <li>Passing and house rule changes apply from the next hand.</li>
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
            <span className="muted">Current game: {game.n} players, ends at {game.rules.target}</span>
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
