/** ---------- Rummy 500 rules engine ----------
 * Pure functions only: every move is applyAction(state, action) -> new state.
 * Seat 0 is you. House rules:
 *  - Melds are sets of 3–4 of a rank, or runs of 3+ in a suit. Ace is high or
 *    low, never both (no K-A-2).
 *  - Anyone can play single cards off any meld on the table. Melds never get
 *    rearranged once they're down.
 *  - You may take as deep into the discard pile as you like, but the bottom
 *    card you took must be played that turn.
 *  - You must discard to go out.
 *  - Score the cards you've laid down, minus what's left in your hand.
 *    Aces 15, 10/J/Q/K 10, 2–9 are 5.
 */

export const SUITS = ["♣", "♦", "♠", "♥"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NUM = Object.fromEntries(RANKS.map((r, i) => [r, i + 1])); // A=1 … K=13

export const cardKey = (c) => `${c.r}${c.s}`;
export const cardLabel = (c) => `${c.r}${c.s}`;
export const sameCard = (a, b) => a.r === b.r && a.s === b.s;
export const rankNum = (c) => RANK_NUM[c.r];

/** Points a card is worth (house values): aces 15, 10/J/Q/K 10, 2–9 are 5. */
export function cardValue(c) {
  if (c.r === "A") return 15;
  if (c.r === "10" || c.r === "J" || c.r === "Q" || c.r === "K") return 10;
  return 5;
}
export const handValue = (cards) => cards.reduce((n, c) => n + cardValue(c), 0);

export const DEFAULT_RULES = { players: 2, target: 500, twoPlayerHand: 13 };

export function fullDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return deck;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(hand, by = "suit") {
  return [...hand].sort((a, b) =>
    by === "rank"
      ? rankNum(a) - rankNum(b) || SUITS.indexOf(a.s) - SUITS.indexOf(b.s)
      : SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || rankNum(a) - rankNum(b)
  );
}

/** ---------- Melds ----------
 * A meld on the table: { id, type: "set" | "run", rank?, suit?, lo?, hi?, cards: [{ card, by, pos }] }
 * Run positions go 1 (low ace) … 13 (K), 14 (high ace).
 */

/** Positions a run could use for these cards, or null. */
function runPositions(cards) {
  if (cards.length < 3 || !cards.every((c) => c.s === cards[0].s)) return null;
  for (const aceHigh of [false, true]) {
    const pos = cards.map((c) => (c.r === "A" && aceHigh ? 14 : rankNum(c)));
    const sorted = [...pos].sort((a, b) => a - b);
    if (sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1)) return pos;
  }
  return null;
}

/** Is this group of cards a legal new meld? Returns its shape or null. */
export function checkMeld(cards) {
  if (cards.length < 3) return null;
  if (cards.length <= 4 && cards.every((c) => c.r === cards[0].r)) return { type: "set", rank: cards[0].r };
  const pos = runPositions(cards);
  if (pos) return { type: "run", suit: cards[0].s, lo: Math.min(...pos), hi: Math.max(...pos), pos };
  return null;
}

/** Where `card` would go if played off `meld`, or null if it doesn't fit. */
export function layoffPos(card, meld) {
  if (meld.type === "set") return card.r === meld.rank && meld.cards.length < 4 ? 0 : null;
  if (card.s !== meld.suit) return null;
  const options = card.r === "A" ? [1, 14] : [rankNum(card)];
  for (const p of options) if (p === meld.lo - 1 || p === meld.hi + 1) return p;
  return null;
}

export const canLayOff = (card, melds) => melds.some((m) => layoffPos(card, m) !== null);

/** Points a played card is worth to whoever played it. */
export const playedValue = (entry) => cardValue(entry.card);

/** Every meld (set or run, any length) that can be made from `pool`. */
export function allMelds(pool) {
  const out = [];
  // Sets: every 3- and 4-card combination of one rank
  for (const r of RANKS) {
    const same = pool.filter((c) => c.r === r);
    if (same.length >= 3) {
      if (same.length === 4) out.push(same);
      for (let skip = 0; skip < same.length; skip++) {
        if (same.length === 3 && skip > 0) break;
        out.push(same.length === 3 ? same : same.filter((_, i) => i !== skip));
      }
    }
  }
  // Runs: every stretch of 3+ in a row within a suit (ace counted low or high)
  for (const s of SUITS) {
    const bySlot = {};
    for (const c of pool.filter((x) => x.s === s)) {
      if (c.r === "A") (bySlot[1] = c), (bySlot[14] = c);
      else bySlot[rankNum(c)] = c;
    }
    for (let lo = 1; lo <= 12; lo++) {
      for (let hi = lo + 2; hi <= 14 && bySlot[hi - 1] !== undefined; hi++) {
        let ok = true;
        for (let p = lo; p <= hi; p++) if (!bySlot[p]) ok = false;
        if (!ok) break;
        out.push(Array.from({ length: hi - lo + 1 }, (_, i) => bySlot[lo + i]));
      }
    }
  }
  return out;
}

/**
 * Can `card` be played right now (off the table, or melded with cards from `pool`)
 * while still keeping a card back to discard?
 */
export function canUse(card, pool, melds) {
  if (pool.length >= 2 && canLayOff(card, melds)) return true;
  if (layoffChain(card, pool, melds)) return true;
  return allMelds(pool).some((m) => m.length < pool.length && m.some((c) => sameCard(c, card)));
}

/**
 * Cards from `pool` that would have to go on a run first so `card` can follow them,
 * e.g. the table has A-4♦, you hold the 5♦, so the 6♦ fits once the 5♦ is played.
 * Returns [{ card, meldId }] in play order (ending with `card` itself), or null.
 * Only counts if a card is still left over to discard.
 */
export function layoffChain(card, pool, melds) {
  let best = null;
  for (const m of melds) {
    if (m.type !== "run" || m.suit !== card.s) continue;
    const positions = card.r === "A" ? [1, 14] : [rankNum(card)];
    for (const p of positions) {
      let between = [];
      if (p > m.hi + 1) for (let x = m.hi + 1; x < p; x++) between.push(x);
      else if (p < m.lo - 1) for (let x = m.lo - 1; x > p; x--) between.push(x);
      else continue;
      const steps = [];
      for (const x of between) {
        const c = pool.find((h) => h.s === card.s && (x === 1 || x === 14 ? h.r === "A" : rankNum(h) === x));
        if (!c) break;
        steps.push({ card: c, meldId: m.id });
      }
      if (steps.length !== between.length) continue;
      steps.push({ card, meldId: m.id });
      if (steps.length > pool.length - 1) continue; // must keep a card to discard
      if (!best || steps.length < best.length) best = steps;
    }
  }
  return best;
}

/** Value of a group of melded cards. */
export const meldValue = (cards) => (checkMeld(cards) ? handValue(cards) : 0);

/**
 * Best way to split `pool` into melds: maximises melded points.
 * Returns { melds: [cards[]], value, rest: cards[] }.
 */
export function bestMelds(pool) {
  const candidates = allMelds(pool).map((m) => ({ cards: m, keys: new Set(m.map(cardKey)), value: meldValue(m) }));
  let best = { picks: [], value: 0 };
  const used = new Set();
  const search = (start, picks, value) => {
    if (value > best.value) best = { picks: [...picks], value };
    for (let i = start; i < candidates.length; i++) {
      const c = candidates[i];
      if ([...c.keys].some((k) => used.has(k))) continue;
      c.keys.forEach((k) => used.add(k));
      picks.push(c);
      search(i + 1, picks, value + c.value);
      picks.pop();
      c.keys.forEach((k) => used.delete(k));
    }
  };
  search(0, [], 0);
  const usedKeys = new Set(best.picks.flatMap((p) => [...p.keys]));
  return { melds: best.picks.map((p) => p.cards), value: best.value, rest: pool.filter((c) => !usedKeys.has(cardKey(c))) };
}

/** ---------- State ---------- */
export function newGame(rules = DEFAULT_RULES) {
  const n = rules.players;
  return {
    v: 1,
    gameId: Date.now(),
    rules,
    n,
    phase: "idle", // idle, draw, play, handOver, gameOver
    handNo: 0,
    dealer: Math.floor(Math.random() * n),
    turn: null,
    hands: Array.from({ length: n }, () => []),
    stock: [],
    discard: [], // index 0 is the bottom, last is the top
    melds: [],
    meldId: 0,
    mustPlay: null, // bottom card taken from the discard pile this turn
    pickups: Array.from({ length: n }, () => []), // public: cards each seat took from the discard pile
    scores: Array(n).fill(0),
    history: [],
    result: null,
    winner: null,
    lastAction: "",
    log: [],
    logId: 0,
  };
}

function addLog(s, text, kind = "info") {
  s.logId += 1;
  s.log = [...s.log, { id: s.logId, text, kind }].slice(-150);
  if (kind !== "deal") s.lastAction = text;
}

function removeCards(hand, cards) {
  for (const c of cards) {
    const i = hand.findIndex((h) => sameCard(h, c));
    if (i < 0) return false;
    hand.splice(i, 1);
  }
  return true;
}

const has = (hand, cards) => {
  const pool = [...hand];
  return removeCards(pool, cards);
};

function deal(prev, rules) {
  const s = structuredClone(prev);
  if (rules) s.rules = { ...rules, players: s.n };
  const n = s.n;
  const size = n === 2 ? s.rules.twoPlayerHand : 7;
  const deck = shuffle(fullDeck());
  s.hands = Array.from({ length: n }, () => []);
  for (let i = 0; i < size * n; i++) s.hands[(s.dealer + 1 + i) % n].push(deck[i]);
  s.discard = [deck[size * n]];
  s.stock = deck.slice(size * n + 1);
  s.melds = [];
  s.mustPlay = null;
  s.pickups = Array.from({ length: n }, () => []);
  s.result = null;
  s.handNo += 1;
  s.turn = (s.dealer + 1) % n;
  s.phase = "draw";
  s.lastAction = "";
  addLog(s, `Hand ${s.handNo} · {${s.dealer}} deals ${size} each`, "deal");
  return s;
}

function scoreHand(s, outSeat) {
  const n = s.n;
  const laid = Array(n).fill(0);
  for (const m of s.melds) for (const e of m.cards) laid[e.by] += playedValue(e);
  const left = s.hands.map(handValue);
  const net = laid.map((v, i) => v - left[i]);
  s.scores = s.scores.map((sc, i) => sc + net[i]);
  s.result = { laid, left, net, outSeat };
  s.history = [...s.history, { net, outSeat }];
  addLog(
    s,
    `${outSeat === null ? "The pile ran out" : `{${outSeat}} went out`} · ${net.map((v, i) => `{${i}} ${v >= 0 ? "+" : ""}${v}`).join(", ")}`,
    "result"
  );
  const top = Math.max(...s.scores);
  const leaders = s.scores.map((sc, i) => (sc === top ? i : null)).filter((i) => i !== null);
  if (top >= s.rules.target && leaders.length === 1) {
    s.winner = leaders[0];
    s.phase = "gameOver";
    addLog(s, `{${s.winner}} wins with ${top}!`, "result");
  } else {
    s.phase = "handOver";
  }
  s.turn = null;
}

/** Apply one move. Invalid moves return the state unchanged. */
export function applyAction(state, a) {
  const mine = state.turn === a.seat;
  switch (a.type) {
    case "newGame": {
      const rules = a.rules ?? state.rules;
      return deal(newGame(rules), rules);
    }
    case "deal": {
      if (state.phase !== "idle" && state.phase !== "handOver") return state;
      const s = structuredClone(state);
      if (state.phase === "handOver") s.dealer = (s.dealer + 1) % s.n;
      return deal(s, a.rules ? { ...a.rules, target: state.rules.target } : undefined);
    }
    case "drawStock": {
      if (state.phase !== "draw" || !mine || !state.stock.length) return state;
      const s = structuredClone(state);
      s.hands[a.seat].push(s.stock.pop());
      s.phase = "play";
      addLog(s, `{${a.seat}} draws from the pile`, "draw");
      return s;
    }
    case "takeDiscard": {
      if (state.phase !== "draw" || !mine) return state;
      const i = a.index;
      if (i < 0 || i >= state.discard.length) return state;
      const taken = state.discard.slice(i);
      const bottom = taken[0];
      if (!canUse(bottom, [...state.hands[a.seat], ...taken], state.melds)) return state;
      const s = structuredClone(state);
      s.discard = s.discard.slice(0, i);
      s.hands[a.seat].push(...taken);
      s.mustPlay = bottom;
      s.pickups[a.seat].push(...taken);
      s.phase = "play";
      addLog(s, `{${a.seat}} picks up ${taken.length === 1 ? cardLabel(bottom) : `${taken.length} cards down to the ${cardLabel(bottom)}`}`, "draw");
      return s;
    }
    case "meld": {
      if (state.phase !== "play" || !mine) return state;
      const shape = checkMeld(a.cards);
      const hand = state.hands[a.seat];
      if (!shape || !has(hand, a.cards) || hand.length - a.cards.length < 1) return state; // keep a card to discard
      const s = structuredClone(state);
      removeCards(s.hands[a.seat], a.cards);
      s.meldId += 1;
      const entries = a.cards.map((card, i) => ({ card, by: a.seat, pos: shape.type === "run" ? shape.pos[i] : 0 }));
      if (shape.type === "run") entries.sort((x, y) => x.pos - y.pos);
      s.melds.push({ id: s.meldId, type: shape.type, rank: shape.rank, suit: shape.suit, lo: shape.lo, hi: shape.hi, cards: entries });
      if (s.mustPlay && a.cards.some((c) => sameCard(c, s.mustPlay))) s.mustPlay = null;
      addLog(s, `{${a.seat}} lays down ${entries.map((e) => cardLabel(e.card)).join(" ")}`, "meld");
      return s;
    }
    case "layoff": {
      if (state.phase !== "play" || !mine) return state;
      const hand = state.hands[a.seat];
      const meld = state.melds.find((m) => m.id === a.meldId);
      if (!meld || !has(hand, [a.card]) || hand.length < 2) return state;
      const pos = layoffPos(a.card, meld);
      if (pos === null) return state;
      const s = structuredClone(state);
      removeCards(s.hands[a.seat], [a.card]);
      const m = s.melds.find((x) => x.id === a.meldId);
      m.cards.push({ card: a.card, by: a.seat, pos });
      if (m.type === "run") {
        m.cards.sort((x, y) => x.pos - y.pos);
        m.lo = Math.min(m.lo, pos);
        m.hi = Math.max(m.hi, pos);
      }
      if (s.mustPlay && sameCard(a.card, s.mustPlay)) s.mustPlay = null;
      addLog(s, `{${a.seat}} plays ${cardLabel(a.card)} off the table`, "meld");
      return s;
    }
    case "discard": {
      if (state.phase !== "play" || !mine || state.mustPlay) return state;
      if (!has(state.hands[a.seat], [a.card])) return state;
      const s = structuredClone(state);
      removeCards(s.hands[a.seat], [a.card]);
      s.discard.push(a.card);
      if (!s.hands[a.seat].length) {
        addLog(s, `{${a.seat}} discards ${cardLabel(a.card)} and goes out!`, "out");
        scoreHand(s, a.seat);
        return s;
      }
      addLog(s, `{${a.seat}} discards ${cardLabel(a.card)}`, "discard");
      s.turn = (a.seat + 1) % s.n;
      s.phase = "draw";
      return s;
    }
    case "stockOut": {
      // The pile is empty and this player doesn't want the discards: the hand is over
      if (state.phase !== "draw" || !mine || state.stock.length) return state;
      const s = structuredClone(state);
      scoreHand(s, null);
      return s;
    }
    default:
      return state;
  }
}
