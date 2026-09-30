import React, { useEffect, useMemo, useReducer, useState } from "react";
import { Card, CardBack, Modal, LogList, SPEEDS, load, save } from "./ui.jsx";
import {
  SUITS,
  SUIT_NAMES,
  WIN_SCORE,
  applyAction,
  newGame,
  sortHand,
  legalPlays,
  effSuit,
  cardKey,
  sameCard,
  isRed,
  bottomsCards,
  isValidBottomsSwap,
  canTakeBottoms,
  sittingOut,
  partnerOf,
  trickWinnerIndex,
} from "./engine.js";
import { botAction } from "./ai.js";

const ME = 0;
const GAME_KEY = "euchre.game.v2";
const SETTINGS_KEY = "euchre.settings.v2";

const DEFAULT_SETTINGS = {
  names: ["Nick", "Jim", "Maddie", "Jenn"],
  bottoms: "clean",
  speed: "normal",
  record: { wins: 0, losses: 0 },
};

const BOTTOMS_LABELS = {
  off: "Off",
  clean: "Three 9s or three 10s",
  mixed: "Any three 9s/10s",
};

function initialGame() {
  const saved = load(GAME_KEY, null);
  if (saved && saved.v === 2 && Array.isArray(saved.hands)) return saved;
  const s = load(SETTINGS_KEY, DEFAULT_SETTINGS);
  return newGame({ bottoms: s.bottoms ?? "clean" });
}

function reducer(state, action) {
  if (action.type === "markRecorded") return { ...state, recorded: true };
  return applyAction(state, action);
}

/** ---------- Small UI pieces ---------- **/
function SuitChip({ suit, big }) {
  if (!suit) return null;
  return <span className={`suitChip ${isRed(suit) ? "red" : "black"} ${big ? "big" : ""}`}>{suit}</span>;
}

function TrickPips({ n }) {
  if (!n) return null;
  return (
    <span className="pips" aria-label={`${n} tricks`}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="pipDot" />
      ))}
    </span>
  );
}

function Seat({ seat, pos, game, names }) {
  const playing = ["bid1", "bid2", "discard", "playing"].includes(game.phase);
  const active = playing && game.turn === seat;
  const out = sittingOut(game) === seat && playing;
  const n = game.hands[seat].length;
  return (
    <div className={`seat seat-${pos} ${active ? "active" : ""} ${out ? "out" : ""}`}>
      <div className="plate">
        <span className="plateName">{names[seat]}</span>
        {game.dealer === seat && <span className="dealerChip">D</span>}
        {game.maker === seat && game.trump && <SuitChip suit={game.trump} />}
      </div>
      <div className="seatMeta">
        {out ? (
          <span className="sitOut">sitting out</span>
        ) : (
          <span className="backs">
            {Array.from({ length: n }).map((_, i) => (
              <span key={i} className="miniBack" />
            ))}
          </span>
        )}
        <TrickPips n={game.tricks[seat]} />
      </div>
      {game.bids[seat] && <div className={`bubble ${game.bids[seat] === "Pass" ? "pass" : "call"}`}>{game.bids[seat]}</div>}
    </div>
  );
}

/** ---------- App ---------- **/
export default function EuchreApp({ onHome }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) }));
  const [game, dispatch] = useReducer(reducer, undefined, initialGame);
  const names = settings.names;

  const [alone, setAlone] = useState(false);
  const [bottomsPick, setBottomsPick] = useState(null); // keys of cards chosen to swap
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const speed = SPEEDS[settings.speed] ?? SPEEDS.normal;
  const rules = { bottoms: settings.bottoms };
  const nm = (text) => text.replace(/\{(\d)\}/g, (_, i) => names[+i]);

  useEffect(() => save(GAME_KEY, game), [game]);
  useEffect(() => save(SETTINGS_KEY, settings), [settings]);

  // Reset per-turn UI choices whenever the turn moves on
  useEffect(() => {
    setAlone(false);
    setBottomsPick(null);
    setShowLast(false);
  }, [game.phase, game.turn]);

  // Drive the bots and trick pacing
  useEffect(() => {
    let timer;
    if (game.phase === "trickDone") {
      timer = setTimeout(() => dispatch({ type: "collect" }), speed.trick);
    } else if (game.turn !== null && game.turn !== ME && ["bid1", "bid2", "discard", "playing"].includes(game.phase)) {
      const delay = game.phase === "playing" ? speed.play : speed.bid;
      timer = setTimeout(() => {
        const a = botAction(game, game.turn);
        if (a) dispatch(a);
      }, delay);
    }
    return () => clearTimeout(timer);
  }, [game, speed]);

  // Win/loss record
  useEffect(() => {
    if (game.phase !== "gameOver" || game.recorded) return;
    const won = game.score[0] >= WIN_SCORE;
    setSettings((s) => ({
      ...s,
      record: { wins: s.record.wins + (won ? 1 : 0), losses: s.record.losses + (won ? 0 : 1) },
    }));
    dispatch({ type: "markRecorded" });
  }, [game.phase, game.recorded, game.score]);

  /** ---------- Derived ---------- **/
  const { phase, trump, upcard, dealer, turn, trick } = game;
  const myTurn = turn === ME;
  const lead = trick.length ? effSuit(trick[0].card, trump) : null;
  const myHand = useMemo(
    () => sortHand(game.hands[ME], phase === "bid1" || phase === "bid2" ? null : trump),
    [game.hands, trump, phase]
  );
  const legalKeys = useMemo(() => {
    if (phase !== "playing" || !myTurn) return new Set();
    return new Set(legalPlays(game.hands[ME], trump, lead).map(cardKey));
  }, [phase, myTurn, game.hands, trump, lead]);

  const bottomsPool = useMemo(() => bottomsCards(game.hands[ME], game.rules.bottoms), [game.hands, game.rules.bottoms]);
  const canBottoms = canTakeBottoms(game, ME);

  const teamTricks = [game.tricks[0] + game.tricks[2], game.tricks[1] + game.tricks[3]];
  const inHand = ["bid1", "bid2", "discard", "playing", "trickDone"].includes(phase);
  const showUpcard = upcard && (phase === "bid1" || phase === "bid2");
  const winnerSeat =
    phase === "trickDone" ? game.trickWinner : trick.length ? trick[trickWinnerIndex(trick, trump)].player : null;
  const showingLast = showLast && game.lastTrick && !trick.length;
  const centerTrick = showingLast ? game.lastTrick.cards : trick;

  /** ---------- Human actions ---------- **/
  const act = (a) => dispatch({ ...a, seat: ME });

  function startBottoms() {
    // Exactly three qualifying cards: swap them. More than three: let the player choose.
    if (bottomsPool.length === 3) act({ type: "bottoms", cards: bottomsPool });
    else setBottomsPick([]);
  }

  function tapCard(c) {
    const k = cardKey(c);
    if (bottomsPick) {
      if (!bottomsPool.some((x) => sameCard(x, c))) return;
      setBottomsPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 3 ? [...p, k] : p));
      return;
    }
    if (phase === "discard" && myTurn) return act({ type: "discard", card: c });
    if (phase === "playing" && myTurn && legalKeys.has(k)) return act({ type: "play", card: c });
  }

  const pickedCards = bottomsPick ? game.hands[ME].filter((c) => bottomsPick.includes(cardKey(c))) : [];
  const pickValid = bottomsPick && isValidBottomsSwap(pickedCards, game.rules.bottoms);

  function restart() {
    dispatch({ type: "newGame", rules });
    setConfirmRestart(false);
    setShowSettings(false);
  }

  /** ---------- Prompt + actions ---------- **/
  let prompt = "";
  let actions = null;

  if (phase === "idle") {
    prompt = `First to ${WIN_SCORE} wins. ${names[dealer]} deals first.`;
    actions = (
      <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "deal", rules })}>
        Deal
      </button>
    );
  } else if (phase === "bid1") {
    if (myTurn && bottomsPick) {
      prompt = "Tap 3 cards to trade for the bottoms.";
      actions = (
        <div className="btnRow">
          <button className="btn primary" type="button" disabled={!pickValid} onClick={() => act({ type: "bottoms", cards: pickedCards })}>
            Swap {pickedCards.length}/3
          </button>
          <button className="btn ghost" type="button" onClick={() => setBottomsPick(null)}>
            Cancel
          </button>
        </div>
      );
    } else if (myTurn) {
      const iDeal = dealer === ME;
      prompt = iDeal
        ? `Pick up the ${upcard.r}${upcard.s} and make ${SUIT_NAMES[upcard.s]} trump?`
        : `Order ${names[dealer]} to pick up the ${upcard.r}${upcard.s}? ${dealer === partnerOf(ME) ? "(your partner)" : ""}`;
      actions = (
        <div className="btnRow">
          <button className="btn primary" type="button" onClick={() => act({ type: "orderUp", alone })}>
            {iDeal ? "Pick up" : "Order up"} {alone && "alone"}
          </button>
          <button className="btn ghost" type="button" onClick={() => act({ type: "pass" })}>
            Pass
          </button>
          <label className={`toggle ${alone ? "on" : ""}`}>
            <input type="checkbox" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
            Go alone
          </label>
          {canBottoms && (
            <button className="btn gold" type="button" onClick={startBottoms}>
              Take bottoms
            </button>
          )}
        </div>
      );
    } else {
      prompt = `${names[turn]} is deciding on ${upcard.r}${upcard.s}…`;
    }
  } else if (phase === "discard") {
    prompt = myTurn ? "You picked it up. Tap a card to discard." : `${names[dealer]} is picking up and discarding…`;
  } else if (phase === "bid2") {
    if (myTurn) {
      const stuck = dealer === ME;
      prompt = stuck ? "Stuck! As dealer you must name trump." : `Name trump (not ${upcard.s}) or pass.`;
      actions = (
        <div className="btnRow">
          {SUITS.filter((s) => s !== upcard.s).map((s) => (
            <button key={s} className={`btn suitBtn ${isRed(s) ? "red" : "black"}`} type="button" onClick={() => act({ type: "call", suit: s, alone })}>
              {s}
            </button>
          ))}
          {!stuck && (
            <button className="btn ghost" type="button" onClick={() => act({ type: "pass" })}>
              Pass
            </button>
          )}
          <label className={`toggle ${alone ? "on" : ""}`}>
            <input type="checkbox" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
            Go alone
          </label>
        </div>
      );
    } else {
      prompt = `${names[turn]} is choosing trump…${turn === dealer ? " (stuck)" : ""}`;
    }
  } else if (phase === "playing" || phase === "trickDone") {
    if (sittingOut(game) === ME) prompt = `${names[game.alone]} is going alone — you sit this one out.`;
    else if (phase === "trickDone") prompt = `${names[game.trickWinner]} takes the trick.`;
    else if (myTurn) prompt = lead ? (legalKeys.size < game.hands[ME].length ? `Follow suit: ${SUIT_NAMES[lead]}.` : `Can't follow ${SUIT_NAMES[lead]} — play anything.`) : "Your lead.";
    else prompt = `${names[turn]}'s turn…`;
  }

  /** ---------- Result text ---------- **/
  const r = game.result;
  let resultTitle = "";
  let resultSub = "";
  if (r) {
    const usWon = r.team === 0;
    const makers = r.makerTeam === 0 ? `${names[0]} & ${names[2]}` : `${names[1]} & ${names[3]}`;
    const who = r.alone !== null ? names[r.alone] : makers;
    if (r.kind === "euchre") {
      resultTitle = usWon ? "Euchred 'em!" : "Euchred!";
      resultSub = `${who} took only ${r.makerTricks} trick${r.makerTricks === 1 ? "" : "s"}.`;
    } else if (r.kind === "lonerMarch") {
      resultTitle = "Loner march!";
      resultSub = `${who} took all 5 alone.`;
    } else if (r.kind === "march") {
      resultTitle = "March!";
      resultSub = `${who} took all 5 tricks.`;
    } else {
      resultTitle = usWon ? "Made it" : "They made it";
      resultSub = `${who} took ${r.makerTricks} tricks${r.alone !== null ? " alone" : ""}.`;
    }
  }

  const trumpLabel = trump ? `${SUIT_NAMES[trump]}` : phase === "bid1" && upcard ? `${upcard.s}?` : "—";

  return (
    <div className="app">
      {/* ---------- Top bar ---------- */}
      <header className="topbar">
        <button className="iconBtn" type="button" onClick={onHome} aria-label="All games">
          ⌂
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
        <div className="scoreboard">
          <div className="team us">
            <span className="teamName">{names[0]} & {names[2]}</span>
            <span className="teamScore">{game.score[0]}</span>
          </div>
          <div className="team them">
            <span className="teamScore">{game.score[1]}</span>
            <span className="teamName">{names[1]} & {names[3]}</span>
          </div>
        </div>
        <button className="iconBtn" type="button" onClick={() => setShowLog(true)} aria-label="Game log">
          ☰
        </button>
      </header>

      <div className="statusStrip">
        <span className="trumpInfo">
          Trump {trump ? <SuitChip suit={trump} /> : <b>{trumpLabel}</b>}
          {game.maker !== null && trump && (
            <span className="muted">
              {" "}
              by {names[game.maker]}
              {game.alone !== null && <b className="aloneTag">ALONE</b>}
            </span>
          )}
        </span>
        {inHand && trump && (
          <span className="trickCount">
            Tricks <b>{teamTricks[0]}</b>–<b>{teamTricks[1]}</b>
          </span>
        )}
      </div>

      {/* ---------- Table ---------- */}
      <main className="table">
        <Seat seat={2} pos="top" game={game} names={names} />
        <Seat seat={1} pos="left" game={game} names={names} />
        <Seat seat={3} pos="right" game={game} names={names} />

        <div className="center">
          {showUpcard ? (
            <div className="upcardArea">
              <div className="kitty">
                <CardBack size="md" className="k1" />
                <CardBack size="md" className="k2" />
                <Card c={upcard} size="md" dim={game.upcardDown} className="upcard" />
              </div>
              <div className="upLabel">
                {game.upcardDown ? "Turned down" : `${names[dealer]}'s upcard`}
              </div>
              {game.bottoms && (
                <div className="bottomsNote">
                  {names[game.bottoms.seat]} took the bottoms
                </div>
              )}
            </div>
          ) : (
            <div className={`trickArea ${showingLast ? "lastTrick" : ""}`}>
              {[2, 1, 3, 0].map((seat) => {
                const p = centerTrick.find((x) => x.player === seat);
                const pos = { 0: "bottom", 1: "left", 2: "top", 3: "right" }[seat];
                return (
                  <div key={seat} className={`slot slot-${pos}`}>
                    {p ? (
                      <Card
                        key={cardKey(p.card)}
                        c={p.card}
                        size="md"
                        className={`played from-${pos}`}
                        glow={!showingLast && winnerSeat === seat}
                        dim={!showingLast && phase === "trickDone" && winnerSeat !== seat}
                      />
                    ) : (
                      <div className="slotGhost" />
                    )}
                  </div>
                );
              })}
              {game.lastTrick && !trick.length && phase === "playing" && (
                <button className="lastBtn" type="button" onClick={() => setShowLast((x) => !x)}>
                  {showLast ? "Hide last trick" : "Last trick"}
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ---------- Action panel ---------- */}
      <section className="panel">
        <div className="meRow">
          <span className={`plate mePlate ${myTurn && inHand ? "active" : ""}`}>
            <span className="plateName">{names[ME]}</span>
            {dealer === ME && inHand && <span className="dealerChip">D</span>}
            {game.maker === ME && trump && <SuitChip suit={trump} />}
            <TrickPips n={game.tricks[ME]} />
          </span>
          {game.bids[ME] && <span className={`bubble inline ${game.bids[ME] === "Pass" ? "pass" : "call"}`}>{game.bids[ME]}</span>}
          <span className="prompt">{prompt}</span>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </section>

      {/* ---------- Your hand ---------- */}
      <section className={`hand ${myHand.length > 5 ? "six" : ""} ${sittingOut(game) === ME && inHand ? "benched" : ""}`}>
        {myHand.map((c) => {
          const k = cardKey(c);
          const canPlay = phase === "playing" && myTurn && legalKeys.has(k);
          const canDiscard = phase === "discard" && myTurn;
          const inPick = bottomsPick && bottomsPool.some((x) => sameCard(x, c));
          const tappable = canPlay || canDiscard || inPick;
          const dimmed = (phase === "playing" && myTurn && !legalKeys.has(k)) || (bottomsPick && !inPick);
          return (
            <Card
              key={k}
              c={c}
              size="lg"
              onClick={tappable ? () => tapCard(c) : undefined}
              dim={dimmed}
              lifted={canPlay}
              selected={bottomsPick?.includes(k)}
              tag={phase === "discard" && upcard && sameCard(c, upcard) ? "new" : null}
            />
          );
        })}
      </section>

      {/* ---------- Hand over ---------- */}
      {(phase === "handOver" || phase === "gameOver") && r && (
        <Modal className={`result ${r.team === 0 ? "good" : "bad"}`}>
          {phase === "gameOver" ? (
            <>
              <div className="bigTitle">{game.score[0] >= WIN_SCORE ? "You win! 🎉" : "They win"}</div>
              <div className="sub">
                {game.score[0] >= WIN_SCORE ? `${names[0]} & ${names[2]}` : `${names[1]} & ${names[3]}`} take it{" "}
                {Math.max(...game.score)}–{Math.min(...game.score)}.
              </div>
              <div className="sub muted">
                Last hand: {resultTitle} · +{r.points}
              </div>
              <div className="sub muted">
                Your record: {settings.record.wins}W – {settings.record.losses}L
              </div>
              <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "newGame", rules })}>
                New game
              </button>
            </>
          ) : (
            <>
              <div className="bigTitle">{resultTitle}</div>
              <div className="sub">{resultSub}</div>
              <div className="pointsLine">
                +{r.points} for {r.team === 0 ? `${names[0]} & ${names[2]}` : `${names[1]} & ${names[3]}`}
              </div>
              <div className="miniScore">
                <span>
                  Us <b>{game.score[0]}</b>
                </span>
                <span>
                  Them <b>{game.score[1]}</b>
                </span>
              </div>
              <button className="btn primary wide" type="button" onClick={() => dispatch({ type: "deal", rules })}>
                Next hand
              </button>
            </>
          )}
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
            <span className="modalTitle">Settings</span>
            <button className="btn ghost small" type="button" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>

          <div className="section">
            <div className="sectionTitle">Players</div>
            <div className="nameGrid">
              {["You", "Left", "Partner", "Right"].map((label, i) => (
                <label key={i} className="field">
                  <span>{label}</span>
                  <input
                    value={names[i]}
                    maxLength={14}
                    onChange={(e) =>
                      setSettings((s) => {
                        const n = [...s.names];
                        n[i] = e.target.value;
                        return { ...s, names: n };
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Bottoms</div>
            <div className="seg">
              {Object.entries(BOTTOMS_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={settings.bottoms === k ? "on" : ""}
                  onClick={() => setSettings((s) => ({ ...s, bottoms: k }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="help">
              Dealt a junk hand? On your first turn to bid, you can show three 9s or three 10s
              and trade them for the three face-down cards under the upcard. Then you bid as normal.
              Only one player can take the bottoms each hand. Changes apply from the next deal.
            </p>
          </div>

          <div className="section">
            <div className="sectionTitle">Bot speed</div>
            <div className="seg">
              {["slow", "normal", "fast"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={settings.speed === k ? "on" : ""}
                  onClick={() => setSettings((s) => ({ ...s, speed: k }))}
                >
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">House rules</div>
            <ul className="help rulesList">
              <li>Stick the dealer: if everyone passes twice, the dealer must name trump.</li>
              <li>Makers: 3–4 tricks = 1 point, all 5 = 2 points, alone and all 5 = 4 points.</li>
              <li>Euchre: if the makers take fewer than 3 tricks, the other team scores 2.</li>
              <li>If your partner's the dealer and you go alone, the upcard isn't picked up.</li>
            </ul>
          </div>

          <div className="section row">
            <span className="muted">
              Record: {settings.record.wins}W – {settings.record.losses}L
            </span>
            {confirmRestart ? (
              <span className="btnRow">
                <button className="btn danger small" type="button" onClick={restart}>
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
