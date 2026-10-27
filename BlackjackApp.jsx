import React, { useEffect, useReducer, useState } from "react";
import { Card, CardBack, Modal, LogList, Seg, SPEEDS, load, save } from "./ui.jsx";
import {
  DEFAULT_RULES,
  ME,
  applyAction,
  newSession,
  handTotal,
  legalActions,
  cardKey,
  decksLeft,
  trueCount,
  money,
} from "./blackjack-engine.js";
import { botPlay, botInsurance, botBet } from "./blackjack-ai.js";

const GAME_KEY = "blackjack.game.v1";
const SETTINGS_KEY = "blackjack.settings.v1";
const CHIPS = [1, 5, 25, 100];
const EMPTY_STATS = { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, peak: 0, bestStreak: 0, streak: 0, broke: 0 };

const DEFAULT_SETTINGS = {
  names: ["Nick", "Zach", "Josh", "Collin", "Syd"],
  players: 3,
  bankroll: 50,
  rules: DEFAULT_RULES,
  speed: "normal",
  showCount: false,
  stats: EMPTY_STATS,
  statsRound: null,
};

// Where each seat sits on the table (percent), left to right; slot 2 is the middle.
const SLOT_POS = [
  { x: 10, y: 41 },
  { x: 29.5, y: 49 },
  { x: 50, y: 52 },
  { x: 70.5, y: 49 },
  { x: 90, y: 41 },
];

function loadSettings() {
  const s = load(SETTINGS_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    rules: { ...DEFAULT_RULES, ...(s.rules ?? {}) },
    stats: { ...EMPTY_STATS, ...(s.stats ?? {}) },
  };
}

function initialGame() {
  const saved = load(GAME_KEY, null);
  if (saved && saved.v === 1 && Array.isArray(saved.players)) return saved;
  const s = loadSettings();
  return newSession({ players: s.players, bankroll: s.bankroll, rules: s.rules });
}

const reducer = (s, a) => (a.type === "load" ? a.state : applyAction(s, a));
const fmt = (n) => {
  const v = money(n);
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

/** Split a bet into casino chips for the little stack in the betting circle. */
function chipStack(amount) {
  const out = [];
  let left = Math.floor(amount);
  for (const c of [...CHIPS].reverse()) {
    while (left >= c && out.length < 6) {
      out.push(c);
      left -= c;
    }
  }
  return out.reverse();
}

function Chip({ value, onClick, disabled, small }) {
  const cls = `chip chip${value} ${small ? "mini" : ""}`;
  if (!onClick) return <span className={cls}>{small ? "" : `$${value}`}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={`Add $${value}`}>
      ${value}
    </button>
  );
}

const RESULT_TEXT = {
  win: "WIN",
  lose: "LOSE",
  push: "PUSH",
  bust: "BUST",
  blackjack: "BLACKJACK",
  surrender: "SURRENDER",
};

function HandView({ hand, size, active, showTotal }) {
  const { total, soft } = handTotal(hand.cards);
  const tone =
    hand.result === "win" || hand.result === "blackjack" ? "good" : hand.result === "push" || hand.result === "surrender" ? "meh" : hand.result ? "bad" : "";
  return (
    <div className={`bjHand ${active ? "active" : ""}`}>
      <div className="bjCards">
        {hand.cards.map((c, i) => (
          <div key={cardKey(c)} className="bjCard" style={{ "--i": i }}>
            <Card c={c} size={size} />
          </div>
        ))}
      </div>
      {showTotal && hand.cards.length > 0 && (
        <div className={`bjTotal ${total > 21 ? "bust" : ""}`}>{soft && total < 21 ? `${total - 10}/${total}` : total}</div>
      )}
      {hand.result && (
        <div className={`bjResult ${tone}`}>
          {RESULT_TEXT[hand.result]}
          {hand.payout > 0 && ` +${fmt(hand.payout)}`}
        </div>
      )}
      {hand.doubled && <div className="bjTag">2×</div>}
    </div>
  );
}

export default function BlackjackApp({ onHome }) {
  const [settings, setSettings] = useState(loadSettings);
  const [game, dispatch] = useReducer(reducer, undefined, initialGame);
  const [bet, setBet] = useState(() => {
    const me = game.players.find((p) => p.person === ME);
    return Math.min(me?.lastBet || 5, me?.bankroll ?? 5);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const names = settings.names;
  const nm = (text) => text.replace(/\{(\d)\}/g, (_, i) => names[+i]);
  const speed = SPEEDS[settings.speed] ?? SPEEDS.normal;
  const rules = game.rules;
  const me = game.players.find((p) => p.person === ME);
  const myIndex = game.players.indexOf(me);
  const { phase } = game;
  const betting = phase === "betting" || phase === "roundOver";
  const broke = betting && me.bankroll < rules.minBet;

  useEffect(() => save(GAME_KEY, game), [game]);
  useEffect(() => save(SETTINGS_KEY, settings), [settings]);

  // Keep the bet within what you can afford
  useEffect(() => {
    if (betting && bet > me.bankroll) setBet(Math.floor(me.bankroll));
  }, [betting, me.bankroll]);

  // Drive the deal, the other players and the dealer
  useEffect(() => {
    let t;
    if (phase === "dealing") t = setTimeout(() => dispatch({ type: "dealStep" }), speed.play * 0.45);
    else if (phase === "insurance") {
      const bot = game.players.find((p) => p.person !== ME && p.hands.length && !p.insuranceDecided);
      if (bot) t = setTimeout(() => dispatch(botInsurance(game, bot)), speed.bid * 0.6);
    } else if (phase === "playing" && game.turn && game.players[game.turn.p].person !== ME) {
      t = setTimeout(() => dispatch(botPlay(game)), speed.play * 1.1);
    } else if (phase === "dealer") t = setTimeout(() => dispatch({ type: "dealerStep" }), speed.play * 1.1);
    return () => clearTimeout(t);
  }, [game, speed]);

  // Stats: count your hands once per round
  useEffect(() => {
    if (phase !== "roundOver" || !me.hands.length) return;
    const key = `${game.gameId}-${game.roundNo}`;
    if (settings.statsRound === key) return;
    setSettings((s) => {
      const st = { ...s.stats };
      for (const h of me.hands) {
        st.hands += 1;
        if (h.result === "blackjack") st.blackjacks += 1;
        if (h.payout > 0) st.wins += 1;
        else if (h.payout < 0) st.losses += 1;
        else st.pushes += 1;
      }
      const net = me.result?.net ?? 0;
      st.streak = net > 0 ? Math.max(1, st.streak + 1) : net < 0 ? 0 : st.streak;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      st.peak = Math.max(st.peak, me.bankroll);
      if (me.bankroll < rules.minBet) st.broke += 1;
      return { ...s, stats: st, statsRound: key };
    });
  }, [phase, game.roundNo]);

  /** ---------- Actions ---------- */
  function deal() {
    const bets = { [ME]: bet };
    for (const p of game.players) if (p.person !== ME && !p.out) bets[p.person] = botBet(game, p);
    dispatch({ type: "startRound", bets });
  }
  const addChip = (v) => setBet((b) => Math.min(money(b + v), me.bankroll, rules.maxBet));
  const act = (type) => dispatch({ type, person: ME });

  function newTable() {
    const s = settings;
    dispatch({ type: "load", state: newSession({ players: s.players, bankroll: s.bankroll, rules: s.rules }) });
    setBet(Math.min(5, s.bankroll));
    setConfirmNew(false);
    setShowSettings(false);
  }
  function buyBack() {
    dispatch({ type: "rebuy", person: ME, amount: settings.bankroll });
    setBet(Math.min(5, settings.bankroll));
  }

  /** ---------- Derived ---------- */
  const myTurn = phase === "playing" && game.turn && game.turn.p === myIndex;
  const legal = myTurn ? legalActions(game) : {};
  const myInsurance = phase === "insurance" && me.hands.length && !me.insuranceDecided;
  const dealerTotal = game.dealer.cards.length
    ? game.dealer.holeHidden
      ? handTotal([game.dealer.cards[0]]).total
      : handTotal(game.dealer.cards).total
    : null;
  const shoeLeft = (game.shoe.length - game.pos) / game.shoe.length;
  const cutAt = 1 - game.cut / game.shoe.length;
  const tc = trueCount(game);

  let status = "";
  if (betting) {
    if (phase === "roundOver" && me.result) {
      const n = me.result.net;
      status = n > 0 ? `You won ${fmt(n)}!` : n < 0 ? `You lost ${fmt(-n)}.` : "Push — your bet comes back.";
      status += " Place your next bet.";
    } else status = me.out ? "" : `Place your bet (${fmt(rules.minBet)}–${fmt(rules.maxBet)}).`;
  } else if (phase === "dealing") status = "Dealing…";
  else if (phase === "insurance") status = myInsurance ? `Dealer shows an ace. Insurance costs ${fmt(me.hands[0].bet / 2)} and pays 2 to 1.` : "Waiting on insurance…";
  else if (myTurn) {
    const h = me.hands[game.turn.h];
    status = `${me.hands.length > 1 ? `Hand ${game.turn.h + 1}: ` : ""}You have ${handTotal(h.cards).total}. Dealer shows ${game.dealer.cards[0].r}.`;
  } else if (phase === "playing" && game.turn) status = `${names[game.players[game.turn.p].person]} is playing…`;
  else if (phase === "dealer") status = "Dealer's turn…";

  const tableText = `BLACKJACK PAYS ${rules.bjPays === 1.5 ? "3 TO 2" : "6 TO 5"}`;
  const subText = `Dealer ${rules.hitSoft17 ? "hits" : "stands on"} soft 17${rules.insurance ? " · Insurance pays 2 to 1" : ""}`;
  const st = settings.stats;

  return (
    <div className="app blackjack">
      <header className="topbar">
        <button className="iconBtn" type="button" onClick={onHome} aria-label="All games">
          ⌂
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙︎
        </button>
        <button className="heartsTitle" type="button" onClick={() => setShowStats(true)}>
          <span className="htName">Blackjack</span>
          <span className="htMeta">
            Bankroll <b className="bankroll">{fmt(me.bankroll)}</b> · Stats ›
          </span>
        </button>
        <button className="iconBtn" type="button" onClick={() => setShowLog(true)} aria-label="Game log">
          ☰
        </button>
      </header>

      <main className="bjTable">
        {/* Shoe with cut card */}
        <div className="bjShoe" title={`${Math.round(shoeLeft * 100)}% of the shoe left`}>
          <CardBack size="sm" />
          <div className="shoeBar">
            <div className="shoeFill" style={{ height: `${shoeLeft * 100}%` }} />
            <div className="cutMark" style={{ bottom: `${cutAt * 100}%` }} />
          </div>
          {game.shuffleNext && <div className="shuffleTag">Shuffle next</div>}
        </div>
        {settings.showCount && (
          <div className="bjCount">
            <span>RC {game.runningCount > 0 ? "+" : ""}{game.runningCount}</span>
            <span>TC {tc > 0 ? "+" : ""}{tc.toFixed(1)}</span>
            <span className="muted">{decksLeft(game).toFixed(1)} decks</span>
          </div>
        )}

        {/* Dealer */}
        <div className="bjDealer">
          <div className="bjDealerLabel">DEALER</div>
          <div className="bjCards dealerCards">
            {game.dealer.cards.map((c, i) => (
              <div key={cardKey(c)} className="bjCard" style={{ "--i": i }}>
                {i === 1 && game.dealer.holeHidden ? <CardBack size="md" /> : <Card c={c} size="md" />}
              </div>
            ))}
          </div>
          {dealerTotal !== null && (
            <div className={`bjTotal ${dealerTotal > 21 ? "bust" : ""}`}>
              {game.dealer.holeHidden ? `${dealerTotal} + ?` : dealerTotal > 21 ? `${dealerTotal} BUST` : dealerTotal}
            </div>
          )}
        </div>

        {/* Table printing */}
        <svg className="bjArc" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <path id="bjArcPath" d="M 30 20 Q 200 120 370 20" />
            <path id="bjArcPath2" d="M 70 42 Q 200 128 330 42" />
          </defs>
          <text className="arcBig">
            <textPath href="#bjArcPath" startOffset="50%" textAnchor="middle">
              {tableText}
            </textPath>
          </text>
          <text className="arcSmall">
            <textPath href="#bjArcPath2" startOffset="50%" textAnchor="middle">
              {subText}
            </textPath>
          </text>
        </svg>

        {/* Seats */}
        {game.players.map((pl, i) => {
          const pos = SLOT_POS[pl.slot];
          const mine = pl.person === ME;
          const activeSeat = phase === "playing" && game.turn?.p === i;
          return (
            <div
              key={pl.person}
              className={`bjSeat ${mine ? "mine" : ""} ${activeSeat ? "active" : ""} ${pl.out ? "out" : ""}`}
              style={{ left: `${pos.x}%`, top: `calc(${pos.y}% + var(--seatShift, 0px))` }}
            >
              <div className="bjHands">
                {pl.hands.map((h, hi) => (
                  <HandView
                    key={hi}
                    hand={h}
                    size={mine ? "lg" : "sm"}
                    active={activeSeat && game.turn.h === hi && pl.hands.length > 1}
                    showTotal
                  />
                ))}
              </div>
              <div className="betSpot">
                {(() => {
                  const amt = pl.hands.length ? pl.hands.reduce((n, h) => n + h.bet, 0) : mine && betting ? bet : 0;
                  return amt > 0 ? (
                    <>
                      <span className="chipPile">
                        {chipStack(amt).map((c, k) => (
                          <span key={k} className={`chip chip${c} mini`} style={{ "--k": k }} />
                        ))}
                      </span>
                      <span className="betAmt">{fmt(amt)}</span>
                    </>
                  ) : null;
                })()}
                {pl.insurance > 0 && <span className="insTag">INS {fmt(pl.insurance)}</span>}
              </div>
              <div className="plate">
                <span className="plateName">{names[pl.person]}</span>
                <span className="seatScore">{pl.out ? "out" : fmt(pl.bankroll)}</span>
              </div>
              {pl.result && pl.hands.length > 0 && (
                <div className={`netTag ${pl.result.net > 0 ? "good" : pl.result.net < 0 ? "bad" : ""}`}>
                  {pl.result.net > 0 ? "+" : pl.result.net < 0 ? "−" : ""}
                  {fmt(Math.abs(pl.result.net))}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* Controls */}
      <section className="panel bjPanel">
        <div className="bjStatus">{status}</div>
        {betting && !broke && !me.out && (
          <>
            <div className="chipTray">
              {CHIPS.map((v) => (
                <Chip key={v} value={v} onClick={() => addChip(v)} disabled={bet + v > me.bankroll || bet + v > rules.maxBet} />
              ))}
            </div>
            <div className="btnRow bjBetRow">
              <button className="btn ghost small" type="button" onClick={() => setBet(0)} disabled={!bet}>
                Clear
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => setBet(Math.min(money(bet * 2), me.bankroll, rules.maxBet))}
                disabled={!bet || bet * 2 > me.bankroll}
              >
                2×
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => setBet(Math.min(me.lastBet, me.bankroll))}
                disabled={!me.lastBet}
              >
                Rebet
              </button>
              <button className="btn primary bjDeal" type="button" onClick={deal} disabled={bet < rules.minBet || bet > me.bankroll}>
                Deal {bet > 0 ? fmt(bet) : ""}
              </button>
            </div>
          </>
        )}
        {myInsurance && (
          <div className="btnRow">
            <button className="btn gold" type="button" onClick={() => dispatch({ type: "insurance", person: ME, take: true })} disabled={me.bankroll < me.hands[0].bet / 2}>
              Insurance {fmt(me.hands[0].bet / 2)}
            </button>
            <button className="btn ghost" type="button" onClick={() => dispatch({ type: "insurance", person: ME, take: false })}>
              No thanks
            </button>
          </div>
        )}
        {myTurn && (
          <div className="bjActions">
            <button className="btn primary" type="button" onClick={() => act("hit")} disabled={!legal.hit}>
              Hit
            </button>
            <button className="btn primary stand" type="button" onClick={() => act("stand")}>
              Stand
            </button>
            <button className="btn gold" type="button" onClick={() => act("double")} disabled={!legal.double}>
              Double
            </button>
            <button className="btn ghost" type="button" onClick={() => act("split")} disabled={!legal.split}>
              Split
            </button>
            {rules.surrender && (
              <button className="btn ghost" type="button" onClick={() => act("surrender")} disabled={!legal.surrender}>
                Surrender
              </button>
            )}
          </div>
        )}
      </section>

      {/* Broke */}
      {broke && (
        <Modal className="result bad">
          <div className="bigTitle">You're broke 💸</div>
          <div className="sub">Your bankroll is down to {fmt(me.bankroll)}.</div>
          <div className="sub muted">Biggest bankroll: {fmt(Math.max(st.peak, settings.bankroll))}</div>
          <div className="btnRow" style={{ justifyContent: "center" }}>
            <button className="btn primary" type="button" onClick={buyBack}>
              Buy back in ({fmt(settings.bankroll)})
            </button>
            <button className="btn ghost" type="button" onClick={newTable}>
              New table
            </button>
          </div>
        </Modal>
      )}

      {/* Stats */}
      {showStats && (
        <Modal onClose={() => setShowStats(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Your stats</span>
            <button className="btn ghost small" type="button" onClick={() => setShowStats(false)}>
              Close
            </button>
          </div>
          <div className="statGrid">
            {[
              ["Hands", st.hands],
              ["Win %", st.hands ? `${Math.round((st.wins / st.hands) * 100)}%` : "—"],
              ["Wins", st.wins],
              ["Losses", st.losses],
              ["Pushes", st.pushes],
              ["Blackjacks", st.blackjacks],
              ["Biggest bankroll", fmt(Math.max(st.peak, me.bankroll))],
              ["Best win streak", st.bestStreak],
              ["Times broke", st.broke],
            ].map(([k, v]) => (
              <div key={k} className="statTile">
                <span className="statVal">{v}</span>
                <span className="statKey">{k}</span>
              </div>
            ))}
          </div>
          <div className="btnRow" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn ghost small" type="button" onClick={() => setSettings((s) => ({ ...s, stats: EMPTY_STATS }))}>
              Reset stats
            </button>
          </div>
        </Modal>
      )}

      {/* Log */}
      {showLog && (
        <Modal onClose={() => setShowLog(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Table log</span>
            <button className="btn ghost small" type="button" onClick={() => setShowLog(false)}>
              Close
            </button>
          </div>
          <LogList log={game.log} nm={nm} />
        </Modal>
      )}

      {/* Settings */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} className="sheet">
          <div className="modalHead">
            <span className="modalTitle">Blackjack settings</span>
            <button className="btn ghost small" type="button" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>

          <div className="section">
            <div className="sectionTitle">Players at the table</div>
            <Seg options={[1, 2, 3, 4, 5].map((n) => [n, `${n}`])} value={settings.players} onChange={(n) => setSettings((s) => ({ ...s, players: n }))} />
            <p className="help">You always sit in the middle, across from the dealer.</p>
            <div className="nameGrid">
              {names.slice(0, settings.players).map((name, i) => (
                <label key={i} className="field">
                  <span>{i === 0 ? "You" : `Player ${i + 1}`}</span>
                  <input
                    value={name}
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
            <div className="sectionTitle">Starting money</div>
            <div className="btnRow">
              <Seg options={[25, 50, 100, 500].map((v) => [v, `$${v}`])} value={settings.bankroll} onChange={(v) => setSettings((s) => ({ ...s, bankroll: v }))} />
              <input
                className="numInput"
                type="number"
                inputMode="numeric"
                min={5}
                max={100000}
                value={settings.bankroll}
                onChange={(e) => setSettings((s) => ({ ...s, bankroll: Math.max(5, Math.min(100000, +e.target.value || 50)) }))}
                aria-label="Custom starting money"
              />
            </div>
            <p className="help">Used for a new table and when you buy back in after going broke.</p>
          </div>

          <div className="section">
            <div className="sectionTitle">Table rules</div>
            <div className="ruleRow">
              <span>Decks in the shoe</span>
              <Seg
                options={[1, 2, 6, 8].map((d) => [d, `${d}`])}
                value={settings.rules.decks}
                onChange={(d) => setSettings((s) => ({ ...s, rules: { ...s.rules, decks: d } }))}
              />
            </div>
            <div className="ruleRow">
              <span>Blackjack pays</span>
              <Seg
                options={[[1.5, "3 to 2"], [1.2, "6 to 5"]]}
                value={settings.rules.bjPays}
                onChange={(v) => setSettings((s) => ({ ...s, rules: { ...s.rules, bjPays: v } }))}
              />
            </div>
            <div className="ruleRow">
              <span>Dealer on soft 17</span>
              <Seg
                options={[[false, "Stands"], [true, "Hits"]]}
                value={settings.rules.hitSoft17}
                onChange={(v) => setSettings((s) => ({ ...s, rules: { ...s.rules, hitSoft17: v } }))}
              />
            </div>
            <div className="ruleRow">
              <span>Split up to</span>
              <Seg
                options={[2, 3, 4].map((h) => [h, `${h} hands`])}
                value={settings.rules.maxHands}
                onChange={(v) => setSettings((s) => ({ ...s, rules: { ...s.rules, maxHands: v } }))}
              />
            </div>
            {[
              ["doubleAfterSplit", "Double after splitting"],
              ["surrender", "Late surrender"],
              ["insurance", "Insurance"],
            ].map(([key, label]) => (
              <label key={key} className={`toggle block ${settings.rules[key] ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={settings.rules[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, rules: { ...s.rules, [key]: e.target.checked } }))}
                />
                {label}
              </label>
            ))}
            <p className="help">$1 minimum, $500 maximum. Split aces get one card each. Rule changes start with a new table.</p>
          </div>

          <div className="section">
            <div className="sectionTitle">Extras</div>
            <label className={`toggle block ${settings.showCount ? "on" : ""}`}>
              <input type="checkbox" checked={settings.showCount} onChange={(e) => setSettings((s) => ({ ...s, showCount: e.target.checked }))} />
              Show the card count (Hi-Lo running and true count)
            </label>
            <div className="sectionTitle" style={{ marginTop: 10 }}>
              Deal speed
            </div>
            <Seg
              options={[["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]]}
              value={settings.speed}
              onChange={(v) => setSettings((s) => ({ ...s, speed: v }))}
            />
          </div>

          <div className="section row">
            <span className="muted">
              Current table: {game.players.length} player{game.players.length > 1 ? "s" : ""}, {game.rules.decks} deck{game.rules.decks > 1 ? "s" : ""}
            </span>
            {confirmNew ? (
              <span className="btnRow">
                <button className="btn danger small" type="button" onClick={newTable}>
                  Yes, new table
                </button>
                <button className="btn ghost small" type="button" onClick={() => setConfirmNew(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn primary small" type="button" onClick={() => setConfirmNew(true)}>
                Start new table
              </button>
            )}
          </div>
          <p className="help">A new table uses these settings and resets everyone's money to {fmt(settings.bankroll)}.</p>
        </Modal>
      )}
    </div>
  );
}
