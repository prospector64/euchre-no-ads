/** ---------- Euchre rules engine ----------
 * Pure functions only: every move is applyAction(state, action) -> new state.
 * Seats: 0 = you (bottom), 1 = left, 2 = partner (top), 3 = right.
 * Teams: seats 0 & 2 are team 0, seats 1 & 3 are team 1.
 */

export const SUITS = ["♠", "♥", "♣", "♦"]; // alternates black/red, used for hand sorting
export const SUIT_NAMES = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
export const RANKS = ["9", "10", "J", "Q", "K", "A"];
const RANK_VAL = { 9: 1, 10: 2, J: 3, Q: 4, K: 5, A: 6 };

export const WIN_SCORE = 10;

export const isRed = (s) => s === "♥" || s === "♦";
export const sameColor = (a, b) => isRed(a) === isRed(b);
export const partnerOf = (seat) => (seat + 2) % 4;
export const teamOf = (seat) => seat % 2;
export const cardKey = (c) => `${c.r}${c.s}`;
export const sameCard = (a, b) => a.r === b.r && a.s === b.s;
export const cardLabel = (c) => `${c.r}${c.s}`;

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

/** ---------- Card strength ---------- **/
export const isRight = (c, t) => !!t && c.r === "J" && c.s === t;
export const isLeft = (c, t) => !!t && c.r === "J" && c.s !== t && sameColor(c.s, t);
export const effSuit = (c, t) => (isLeft(c, t) ? t : c.s);
export const isTrump = (c, t) => !!t && effSuit(c, t) === t;

/** Rank inside the card's effective suit (higher is better). */
export function rankInSuit(c, t) {
  if (isRight(c, t)) return 8;
  if (isLeft(c, t)) return 7;
  return RANK_VAL[c.r];
}

/** Power within a trick: trump beats the led suit, off-suit cards can't win. */
export function trickPower(c, t, lead) {
  const s = effSuit(c, t);
  if (s === t) return 100 + rankInSuit(c, t);
  if (s === lead) return 50 + rankInSuit(c, t);
  return 0;
}

export function trickWinnerIndex(trick, t) {
  const lead = effSuit(trick[0].card, t);
  let best = 0;
  let bestPow = -1;
  trick.forEach((p, i) => {
    const pow = trickPower(p.card, t, lead);
    if (pow > bestPow) (bestPow = pow), (best = i);
  });
  return best;
}

export function legalPlays(hand, t, lead) {
  if (!lead) return hand;
  const follow = hand.filter((c) => effSuit(c, t) === lead);
  return follow.length ? follow : hand;
}

/** Every card whose effective suit is `suit` once trump is `t`. */
export function suitMembers(suit, t) {
  return fullDeck().filter((c) => effSuit(c, t) === suit);
}

/** Sort for display: suits alternate colours, trump on the far right, low→high. */
export function sortHand(hand, t) {
  let order = SUITS;
  if (t) {
    const i = SUITS.indexOf(t);
    order = [SUITS[(i + 1) % 4], SUITS[(i + 2) % 4], SUITS[(i + 3) % 4], t];
  }
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(effSuit(a, t));
    const sb = order.indexOf(effSuit(b, t));
    return sa !== sb ? sa - sb : rankInSuit(a, t) - rankInSuit(b, t);
  });
}

/** ---------- Bottoms (a.k.a. farmer's hand / going under) ----------
 * "clean": three 9s or three 10s.  "mixed": any three cards that are 9s or 10s.
 * The player shows the three cards and swaps them for the three face-down
 * cards under the upcard. Only one player per hand can take them.
 */
export function bottomsCards(hand, variant) {
  if (!variant || variant === "off") return [];
  const nines = hand.filter((c) => c.r === "9");
  const tens = hand.filter((c) => c.r === "10");
  if (variant === "mixed") return nines.length + tens.length >= 3 ? [...nines, ...tens] : [];
  if (nines.length >= 3) return nines;
  if (tens.length >= 3) return tens;
  return [];
}

export function isValidBottomsSwap(cards, variant) {
  if (cards.length !== 3) return false;
  if (!cards.every((c) => c.r === "9" || c.r === "10")) return false;
  if (variant === "mixed") return true;
  return cards.every((c) => c.r === cards[0].r);
}

export function canTakeBottoms(state, seat) {
  return (
    state.phase === "bid1" &&
    state.turn === seat &&
    !state.bottoms &&
    bottomsCards(state.hands[seat], state.rules.bottoms).length >= 3
  );
}

/** ---------- State ---------- **/
export function sittingOut(state) {
  return state.alone === null ? null : partnerOf(state.alone);
}

export function nextActiveSeat(state, seat) {
  const out = sittingOut(state);
  let n = (seat + 1) % 4;
  if (n === out) n = (n + 1) % 4;
  return n;
}

export function playersPerTrick(state) {
  return state.alone === null ? 4 : 3;
}

export function newGame(rules = { bottoms: "clean" }) {
  return {
    v: 2,
    gameId: Date.now(),
    rules,
    phase: "idle", // idle, bid1, discard, bid2, playing, trickDone, handOver, gameOver
    dealer: Math.floor(Math.random() * 4),
    turn: null,
    hands: [[], [], [], []],
    upcard: null,
    upcardDown: false,
    kitty: [],
    bottoms: null, // { seat, shown: [cards] }
    bids: ["", "", "", ""],
    trump: null,
    maker: null,
    alone: null,
    trick: [],
    trickNo: 0,
    trickWinner: null,
    lastTrick: null,
    tricks: [0, 0, 0, 0],
    played: [], // every card played this hand: { player, card }
    voids: [[], [], [], []], // suits each seat has shown out of (public info)
    dealerDiscard: null,
    score: [0, 0],
    handNo: 0,
    result: null,
    recorded: false,
    log: [],
    logId: 0,
  };
}

function addLog(s, text, kind = "info") {
  s.logId += 1;
  s.log = [...s.log, { id: s.logId, text, kind }].slice(-80);
}

function removeCard(hand, card) {
  const i = hand.findIndex((c) => sameCard(c, card));
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

export const seatName = (names, seat) => names?.[seat] ?? `Player ${seat + 1}`;

function deal(prev, rules) {
  const s = structuredClone(prev);
  if (rules) s.rules = rules;
  const deck = shuffle(fullDeck());
  s.hands = [[], [], [], []];
  // Deal starts left of the dealer
  for (let i = 0; i < 20; i++) s.hands[(s.dealer + 1 + i) % 4].push(deck[i]);
  s.upcard = deck[20];
  s.kitty = deck.slice(21, 24);
  s.upcardDown = false;
  s.bottoms = null;
  s.bids = ["", "", "", ""];
  s.trump = null;
  s.maker = null;
  s.alone = null;
  s.trick = [];
  s.trickNo = 0;
  s.trickWinner = null;
  s.lastTrick = null;
  s.tricks = [0, 0, 0, 0];
  s.played = [];
  s.voids = [[], [], [], []];
  s.dealerDiscard = null;
  s.result = null;
  s.handNo += 1;
  s.phase = "bid1";
  s.turn = (s.dealer + 1) % 4;
  addLog(s, `Hand ${s.handNo} · {${s.dealer}} deals · upcard ${cardLabel(s.upcard)}`, "deal");
  return s;
}

function startPlay(s) {
  s.phase = "playing";
  s.bids = s.bids.map((b, i) => (i === s.maker ? b : ""));
  s.turn = nextActiveSeat(s, s.dealer);
}

function scoreHand(s) {
  const makerTeam = teamOf(s.maker);
  const defTeam = 1 - makerTeam;
  const makerTricks = s.tricks[s.maker] + s.tricks[partnerOf(s.maker)];
  let team;
  let points;
  let kind;
  if (makerTricks === 5) {
    team = makerTeam;
    points = s.alone !== null ? 4 : 2;
    kind = s.alone !== null ? "lonerMarch" : "march";
  } else if (makerTricks >= 3) {
    team = makerTeam;
    points = 1;
    kind = "made";
  } else {
    team = defTeam;
    points = 2;
    kind = "euchre";
  }
  s.score = [...s.score];
  s.score[team] += points;
  s.result = { team, points, kind, makerTeam, makerTricks, maker: s.maker, alone: s.alone };
  const label = { march: "march", lonerMarch: "loner march", made: "made it", euchre: "euchred" }[kind];
  addLog(s, `{${s.maker}} ${kind === "euchre" ? "got euchred" : label} (${makerTricks} tricks) · +${points} for ${team === 0 ? "{0} & {2}" : "{1} & {3}"}`, "result");
  s.phase = s.score[team] >= WIN_SCORE ? "gameOver" : "handOver";
  s.turn = null;
}

/** Apply one move. Invalid moves return the state unchanged. */
export function applyAction(state, a) {
  switch (a.type) {
    case "newGame": {
      const g = newGame(a.rules ?? state.rules);
      return deal(g, a.rules);
    }
    case "deal": {
      if (state.phase !== "idle" && state.phase !== "handOver") return state;
      const s = structuredClone(state);
      if (state.phase === "handOver") s.dealer = (s.dealer + 1) % 4;
      return deal(s, a.rules);
    }
    case "bottoms": {
      if (!canTakeBottoms(state, a.seat)) return state;
      if (!isValidBottomsSwap(a.cards, state.rules.bottoms)) return state;
      const s = structuredClone(state);
      const hand = s.hands[a.seat];
      if (!a.cards.every((c) => removeCard(hand, c))) return state;
      hand.push(...s.kitty);
      s.kitty = a.cards;
      s.bottoms = { seat: a.seat, shown: a.cards };
      s.bids[a.seat] = "Bottoms!";
      addLog(s, `{${a.seat}} shows ${a.cards.map(cardLabel).join(" ")} and takes the bottoms`, "bid");
      return s;
    }
    case "pass": {
      if (state.turn !== a.seat) return state;
      if (state.phase === "bid1") {
        const s = structuredClone(state);
        s.bids[a.seat] = "Pass";
        addLog(s, `{${a.seat}} passes`, "bid");
        if (a.seat === s.dealer) {
          s.phase = "bid2";
          s.upcardDown = true;
          s.bids = ["", "", "", ""];
          s.turn = (s.dealer + 1) % 4;
          addLog(s, `${cardLabel(s.upcard)} turned down`, "bid");
        } else {
          s.turn = (a.seat + 1) % 4;
        }
        return s;
      }
      if (state.phase === "bid2") {
        if (a.seat === state.dealer) return state; // stick the dealer
        const s = structuredClone(state);
        s.bids[a.seat] = "Pass";
        addLog(s, `{${a.seat}} passes`, "bid");
        s.turn = (a.seat + 1) % 4;
        return s;
      }
      return state;
    }
    case "orderUp": {
      if (state.phase !== "bid1" || state.turn !== a.seat) return state;
      const s = structuredClone(state);
      s.trump = s.upcard.s;
      s.maker = a.seat;
      s.alone = a.alone ? a.seat : null;
      const verb = a.seat === s.dealer ? "picks it up" : "orders it up";
      s.bids[a.seat] = a.alone ? "Alone!" : a.seat === s.dealer ? "Pick up" : "Order up";
      addLog(s, `{${a.seat}} ${verb}${a.alone ? " and goes ALONE" : ""} · trump ${s.trump}`, "bid");
      if (s.alone !== null && partnerOf(a.seat) === s.dealer) {
        // Dealer is sitting out, so nobody picks up the upcard
        addLog(s, `{${s.dealer}} sits out — the upcard stays put`, "bid");
        startPlay(s);
      } else {
        s.hands[s.dealer].push(s.upcard);
        s.phase = "discard";
        s.turn = s.dealer;
      }
      return s;
    }
    case "discard": {
      if (state.phase !== "discard" || a.seat !== state.dealer) return state;
      const s = structuredClone(state);
      if (!removeCard(s.hands[a.seat], a.card)) return state;
      s.dealerDiscard = a.card;
      addLog(s, `{${a.seat}} discards`, "bid");
      startPlay(s);
      return s;
    }
    case "call": {
      if (state.phase !== "bid2" || state.turn !== a.seat) return state;
      if (a.suit === state.upcard.s || !SUITS.includes(a.suit)) return state;
      const s = structuredClone(state);
      s.trump = a.suit;
      s.maker = a.seat;
      s.alone = a.alone ? a.seat : null;
      s.bids[a.seat] = `${a.alone ? "Alone " : ""}${a.suit}`;
      addLog(s, `{${a.seat}} calls ${a.suit}${a.alone ? " and goes ALONE" : ""}`, "bid");
      startPlay(s);
      return s;
    }
    case "play": {
      if (state.phase !== "playing" || state.turn !== a.seat) return state;
      const hand = state.hands[a.seat];
      const lead = state.trick.length ? effSuit(state.trick[0].card, state.trump) : null;
      if (!legalPlays(hand, state.trump, lead).some((c) => sameCard(c, a.card))) return state;
      const s = structuredClone(state);
      removeCard(s.hands[a.seat], a.card);
      s.trick.push({ player: a.seat, card: a.card });
      s.played.push({ player: a.seat, card: a.card });
      if (lead && effSuit(a.card, s.trump) !== lead && !s.voids[a.seat].includes(lead)) {
        s.voids[a.seat].push(lead);
      }
      if (s.trick.length === playersPerTrick(s)) {
        const w = s.trick[trickWinnerIndex(s.trick, s.trump)];
        s.tricks[w.player] += 1;
        s.trickWinner = w.player;
        s.phase = "trickDone";
        s.turn = null;
        s.trickNo += 1;
        addLog(
          s,
          `Trick ${s.trickNo}: {${w.player}} wins with ${cardLabel(w.card)} — ${s.trick
            .map((p) => `{${p.player}} ${cardLabel(p.card)}`)
            .join(", ")}`,
          "trick"
        );
      } else {
        s.turn = nextActiveSeat(s, a.seat);
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
      if (s.trickNo === 5) scoreHand(s);
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
