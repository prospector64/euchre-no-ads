/** ---------- Hearts rules engine ----------
 * Pure functions only: every move is applyAction(state, action) -> new state.
 * Seat 0 is you; seats go clockwise (1 is on your left).
 * House rules: every card is dealt; extras go face down to the winner of the
 * first trick and are scored at the end of the hand. The game ends when someone
 * reaches the target score, and that player loses.
 */

export const SUITS = ["♣", "♦", "♠", "♥"]; // display order, alternating colours
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

export const PASS_DIRS = ["left", "right", "across", "hold", "random"];
export const DIR_LABELS = { left: "Left", right: "Right", across: "Across", hold: "Hold", random: "Random" };
export const MOON_POINTS = 26;

export const cardKey = (c) => `${c.r}${c.s}`;
export const cardLabel = (c) => `${c.r}${c.s}`;
export const sameCard = (a, b) => a.r === b.r && a.s === b.s;
export const rankVal = (c) => RANK_VAL[c.r];
export const isQueenSpades = (c) => c.r === "Q" && c.s === "♠";
export const cardPoints = (c) => (c.s === "♥" ? 1 : isQueenSpades(c) ? 13 : 0);
export const isPointCard = (c) => cardPoints(c) > 0;

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

export function sortHand(hand) {
  return [...hand].sort((a, b) => SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || rankVal(a) - rankVal(b));
}

export const DEFAULT_RULES = {
  players: 4,
  target: 100,
  passCount: 3,
  passMode: "cycle", // left | right | across | hold | random | rotate | cycle
  cycleDirs: ["left", "right", "across", "hold", "random"],
  mustBreakHearts: true,
  queenBreaksHearts: true,
  noPointsFirstTrick: true,
};

/** Directions that make sense for this many players. */
export function dirsFor(n) {
  return PASS_DIRS.filter((d) => d !== "across" || n % 2 === 0);
}

/** Which way this hand passes. `prev` is last hand's direction. */
export function choosePassDir(rules, handNo, prev) {
  const n = rules.players;
  if (!rules.passCount) return "hold";
  const mode = rules.passMode;
  if (mode === "rotate") {
    const cycle = dirsFor(n).filter((d) => d !== "random");
    return cycle[(handNo - 1) % cycle.length];
  }
  if (mode === "cycle") {
    let options = (rules.cycleDirs ?? []).filter((d) => dirsFor(n).includes(d));
    if (!options.length) options = ["left"];
    // Never the same direction twice in a row
    const fresh = options.filter((d) => d !== prev);
    const pool = fresh.length ? fresh : options;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (mode === "across" && n % 2) return "left";
  return mode;
}

export function passTarget(dir, seat, n) {
  if (dir === "left") return (seat + 1) % n;
  if (dir === "right") return (seat - 1 + n) % n;
  if (dir === "across") return (seat + n / 2) % n;
  return null;
}

export function newGame(rules = DEFAULT_RULES) {
  const n = rules.players;
  return {
    v: 1,
    gameId: Date.now(),
    rules,
    n,
    phase: "idle", // idle, pass, playing, trickDone, handOver, gameOver
    handNo: 0,
    hands: Array.from({ length: n }, () => []),
    leftover: [],
    leftoverTaker: null,
    passDir: null,
    passes: Array(n).fill(null), // cards each seat has chosen to pass
    passedTo: Array(n).fill(null), // who got each seat's cards (null for random/hold)
    received: Array(n).fill(null),
    turn: null,
    trick: [],
    trickNo: 0,
    tricksPerHand: 0,
    trickWinner: null,
    lastTrick: null,
    taken: Array.from({ length: n }, () => []),
    played: [],
    voids: Array.from({ length: n }, () => []),
    heartsBroken: false,
    scores: Array(n).fill(0),
    history: [], // per hand: { points: [..], moon: seat|null, leftover: [..], leftoverTaker }
    result: null,
    losers: null,
    log: [],
    logId: 0,
  };
}

function addLog(s, text, kind = "info") {
  s.logId += 1;
  s.log = [...s.log, { id: s.logId, text, kind }].slice(-120);
}

function removeCard(hand, card) {
  const i = hand.findIndex((c) => sameCard(c, card));
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

/** Seat holding the lowest club (usually the 2♣) leads first. */
function openingLeader(s) {
  let best = null;
  s.hands.forEach((h, seat) =>
    h.forEach((c) => {
      if (c.s === "♣" && (!best || rankVal(c) < rankVal(best.card))) best = { seat, card: c };
    })
  );
  return best;
}

function startPlay(s) {
  const lead = openingLeader(s);
  s.phase = "playing";
  s.turn = lead.seat;
  s.openingCard = lead.card;
  addLog(s, `{${lead.seat}} leads the ${cardLabel(lead.card)}`, "info");
}

function deal(prev, rules) {
  const s = structuredClone(prev);
  if (rules) s.rules = rules;
  const n = s.n;
  const deck = shuffle(fullDeck());
  const each = Math.floor(52 / n);
  s.hands = Array.from({ length: n }, (_, i) => deck.slice(i * each, (i + 1) * each));
  s.leftover = deck.slice(n * each);
  s.leftoverTaker = null;
  s.tricksPerHand = each;
  s.trick = [];
  s.trickNo = 0;
  s.trickWinner = null;
  s.lastTrick = null;
  s.taken = Array.from({ length: n }, () => []);
  s.played = [];
  s.voids = Array.from({ length: n }, () => []);
  s.heartsBroken = false;
  s.passes = Array(n).fill(null);
  s.passedTo = Array(n).fill(null);
  s.received = Array(n).fill(null);
  s.result = null;
  s.handNo += 1;
  const prevDir = s.passDir;
  s.passDir = choosePassDir(s.rules, s.handNo, prevDir);
  addLog(
    s,
    `Hand ${s.handNo} · ${s.passDir === "hold" ? "no passing" : `pass ${s.rules.passCount} ${s.passDir}`}${
      s.leftover.length ? ` · ${s.leftover.length} card${s.leftover.length > 1 ? "s" : ""} face down` : ""
    }`,
    "deal"
  );
  if (s.passDir === "hold") startPlay(s);
  else s.phase = "pass";
  return s;
}

function doExchange(s) {
  const n = s.n;
  const k = s.rules.passCount;
  for (let seat = 0; seat < n; seat++) for (const c of s.passes[seat]) removeCard(s.hands[seat], c);
  if (s.passDir === "random") {
    // Pool every passed card, shuffle, and deal them back out evenly
    const pool = shuffle(s.passes.flat());
    for (let seat = 0; seat < n; seat++) {
      const got = pool.slice(seat * k, (seat + 1) * k);
      s.received[seat] = got;
      s.hands[seat].push(...got);
    }
    addLog(s, `Cards scattered at random`, "info");
  } else {
    for (let seat = 0; seat < n; seat++) {
      const to = passTarget(s.passDir, seat, n);
      s.passedTo[seat] = to;
      s.received[to] = s.passes[seat];
      s.hands[to].push(...s.passes[seat]);
    }
    addLog(s, `Cards passed ${s.passDir}`, "info");
  }
  startPlay(s);
}

/** Cards `seat` may play right now. */
export function legalPlays(s, seat) {
  const hand = s.hands[seat];
  const r = s.rules;
  if (!s.trick.length) {
    if (s.trickNo === 0) return hand.filter((c) => sameCard(c, s.openingCard));
    if (r.mustBreakHearts && !s.heartsBroken) {
      const nonHearts = hand.filter((c) => c.s !== "♥");
      if (nonHearts.length) return nonHearts;
    }
    return hand;
  }
  const lead = s.trick[0].card.s;
  const follow = hand.filter((c) => c.s === lead);
  if (follow.length) return follow;
  if (s.trickNo === 0 && r.noPointsFirstTrick) {
    const clean = hand.filter((c) => !isPointCard(c));
    if (clean.length) return clean;
  }
  return hand;
}

export function trickWinnerIndex(trick) {
  const lead = trick[0].card.s;
  let best = 0;
  trick.forEach((p, i) => {
    if (p.card.s === lead && rankVal(p.card) > rankVal(trick[best].card)) best = i;
  });
  return best;
}

export const pointsIn = (cards) => cards.reduce((n, c) => n + cardPoints(c), 0);

function scoreHand(s) {
  const n = s.n;
  const raw = s.taken.map(pointsIn);
  const moon = raw.findIndex((p) => p === MOON_POINTS);
  const points = moon >= 0 ? raw.map((_, i) => (i === moon ? 0 : MOON_POINTS)) : raw;
  s.scores = s.scores.map((sc, i) => sc + points[i]);
  s.history = [...s.history, { points, moon: moon >= 0 ? moon : null, leftover: s.leftover, leftoverTaker: s.leftoverTaker }];
  s.result = { points, raw, moon: moon >= 0 ? moon : null };
  if (s.leftover.length) {
    addLog(
      s,
      `Face-down cards (${s.leftover.map(cardLabel).join(" ")}) went to {${s.leftoverTaker}} · ${pointsIn(s.leftover)} pts`,
      "info"
    );
  }
  if (moon >= 0) addLog(s, `{${moon}} shot the moon! Everyone else +${MOON_POINTS}`, "result");
  else addLog(s, `Hand ${s.handNo}: ${points.map((p, i) => `{${i}} ${p}`).join(", ")}`, "result");

  const top = Math.max(...s.scores);
  if (top >= s.rules.target) {
    s.losers = s.scores.map((sc, i) => (sc === top ? i : null)).filter((i) => i !== null);
    s.phase = "gameOver";
    addLog(s, `${s.losers.map((i) => `{${i}}`).join(" & ")} hit ${top} and lose${s.losers.length > 1 ? "" : "s"}!`, "result");
  } else {
    s.phase = "handOver";
  }
  s.turn = null;
}

/** Apply one move. Invalid moves return the state unchanged. */
export function applyAction(state, a) {
  switch (a.type) {
    case "newGame": {
      const rules = a.rules ?? state.rules;
      return deal(newGame(rules), rules);
    }
    case "deal": {
      if (state.phase !== "idle" && state.phase !== "handOver") return state;
      // Player count and target only change with a new game
      const rules = a.rules ? { ...a.rules, players: state.n, target: state.rules.target } : undefined;
      return deal(state, rules);
    }
    case "pass": {
      if (state.phase !== "pass" || state.passes[a.seat]) return state;
      const k = state.rules.passCount;
      const hand = state.hands[a.seat];
      const keys = new Set(a.cards.map(cardKey));
      if (a.cards.length !== k || keys.size !== k || !a.cards.every((c) => hand.some((h) => sameCard(h, c)))) return state;
      const s = structuredClone(state);
      s.passes[a.seat] = a.cards;
      if (s.passes.every(Boolean)) doExchange(s);
      return s;
    }
    case "play": {
      if (state.phase !== "playing" || state.turn !== a.seat) return state;
      if (!legalPlays(state, a.seat).some((c) => sameCard(c, a.card))) return state;
      const s = structuredClone(state);
      removeCard(s.hands[a.seat], a.card);
      const lead = s.trick.length ? s.trick[0].card.s : null;
      s.trick.push({ player: a.seat, card: a.card });
      s.played.push({ player: a.seat, card: a.card });
      if (lead && a.card.s !== lead && !s.voids[a.seat].includes(lead)) s.voids[a.seat].push(lead);
      if (a.card.s === "♥" && !s.heartsBroken) {
        s.heartsBroken = true;
        if (lead) addLog(s, `Hearts are broken`, "info");
      }
      if (isQueenSpades(a.card) && s.rules.queenBreaksHearts) s.heartsBroken = true;
      if (s.trick.length === s.n) {
        const w = s.trick[trickWinnerIndex(s.trick)];
        s.trickWinner = w.player;
        s.taken[w.player].push(...s.trick.map((p) => p.card));
        if (s.trickNo === 0 && s.leftover.length) {
          s.leftoverTaker = w.player;
          s.taken[w.player].push(...s.leftover);
        }
        const pts = pointsIn(s.trick.map((p) => p.card));
        s.trickNo += 1;
        s.phase = "trickDone";
        s.turn = null;
        addLog(
          s,
          `Trick ${s.trickNo}: {${w.player}} takes it with ${cardLabel(w.card)}${pts ? ` (+${pts})` : ""}${
            s.trickNo === 1 && s.leftover.length ? " and the face-down cards" : ""
          } — ${s.trick.map((p) => `{${p.player}} ${cardLabel(p.card)}`).join(", ")}`,
          "trick"
        );
      } else {
        s.turn = (a.seat + 1) % s.n;
      }
      return s;
    }
    case "collect": {
      if (state.phase !== "trickDone") return state;
      const s = structuredClone(state);
      s.lastTrick = { cards: s.trick, winner: s.trickWinner };
      s.trick = [];
      const w = s.trickWinner;
      s.trickWinner = null;
      if (s.trickNo === 1) s.received = Array(s.n).fill(null);
      if (s.hands.every((h) => h.length === 0)) scoreHand(s);
      else {
        s.phase = "playing";
        s.turn = w;
      }
      return s;
    }
    default:
      return state;
  }
}
