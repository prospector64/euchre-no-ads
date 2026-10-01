/** ---------- Klondike solitaire rules engine ----------
 * Pure functions only: every move is applyAction(state, action) -> new state.
 * Tableau: 7 columns, build down in alternating colours, only kings on empty columns.
 * Foundations: one per suit, ace up to king. Stock: draw 1 or 3, unlimited passes.
 */

export const SUITS = ["♠", "♥", "♣", "♦"]; // foundation order
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NUM = Object.fromEntries(RANKS.map((r, i) => [r, i + 1]));

export const rankNum = (c) => RANK_NUM[c.r];
export const isRed = (s) => s === "♥" || s === "♦";
export const cardKey = (c) => `${c.r}${c.s}`;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(drawCount = 1) {
  const deck = shuffle(SUITS.flatMap((s) => RANKS.map((r) => ({ r, s }))));
  const tableau = [];
  let k = 0;
  for (let col = 0; col < 7; col++) {
    const pile = [];
    for (let i = 0; i <= col; i++) pile.push({ card: deck[k++], up: i === col });
    tableau.push(pile);
  }
  return {
    v: 1,
    gameId: Date.now(),
    drawCount,
    stock: deck.slice(k), // last element is the top
    waste: [], // last element is the top
    foundations: Object.fromEntries(SUITS.map((s) => [s, []])),
    tableau,
    moves: 0,
    elapsed: 0, // seconds of play
    won: false,
  };
}

/** ---------- Rules ---------- */
export function canGoOnFoundation(card, foundations) {
  const pile = foundations[card.s];
  return rankNum(card) === pile.length + 1;
}

export function canGoOnTableau(card, pile) {
  if (!pile.length) return card.r === "K";
  const top = pile[pile.length - 1];
  return top.up && isRed(top.card.s) !== isRed(card.s) && rankNum(top.card) === rankNum(card) + 1;
}

/** First face-up index in a tableau column (or the length if none are up). */
export const firstUp = (pile) => {
  const i = pile.findIndex((e) => e.up);
  return i < 0 ? pile.length : i;
};

/** Cards a move would pick up, or null if `from` isn't a legal thing to move. */
export function movingCards(s, from) {
  if (from.type === "waste") return s.waste.length ? [s.waste[s.waste.length - 1]] : null;
  if (from.type === "foundation") {
    const pile = s.foundations[from.suit];
    return pile.length ? [pile[pile.length - 1]] : null;
  }
  if (from.type === "tableau") {
    const pile = s.tableau[from.col];
    if (from.index < firstUp(pile) || from.index >= pile.length) return null;
    return pile.slice(from.index).map((e) => e.card);
  }
  return null;
}

export function isLegalMove(s, from, to) {
  const cards = movingCards(s, from);
  if (!cards) return false;
  if (to.type === "foundation") return cards.length === 1 && cards[0].s === to.suit && canGoOnFoundation(cards[0], s.foundations);
  if (to.type === "tableau") {
    if (from.type === "tableau" && from.col === to.col) return false;
    return canGoOnTableau(cards[0], s.tableau[to.col]);
  }
  return false;
}

const isWon = (s) => SUITS.every((suit) => s.foundations[suit].length === 13);

/** Apply one move. Invalid moves return the state unchanged. */
export function applyAction(state, a) {
  switch (a.type) {
    case "draw": {
      if (state.won) return state;
      if (!state.stock.length && !state.waste.length) return state;
      const s = structuredClone(state);
      if (!s.stock.length) {
        // Turn the waste back over
        s.stock = [...s.waste].reverse();
        s.waste = [];
      } else {
        for (let i = 0; i < s.drawCount && s.stock.length; i++) s.waste.push(s.stock.pop());
      }
      s.moves += 1;
      return s;
    }
    case "move": {
      if (state.won || !isLegalMove(state, a.from, a.to)) return state;
      const s = structuredClone(state);
      let cards;
      if (a.from.type === "waste") cards = [s.waste.pop()];
      else if (a.from.type === "foundation") cards = [s.foundations[a.from.suit].pop()];
      else {
        const pile = s.tableau[a.from.col];
        cards = pile.splice(a.from.index).map((e) => e.card);
        if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true; // flip the new top card
      }
      if (a.to.type === "foundation") s.foundations[a.to.suit].push(cards[0]);
      else s.tableau[a.to.col].push(...cards.map((card) => ({ card, up: true })));
      s.moves += 1;
      s.won = isWon(s);
      return s;
    }
    case "tick": {
      if (state.won || !state.moves) return state;
      return { ...state, elapsed: state.elapsed + 1 };
    }
    default:
      return state;
  }
}

/** ---------- Helpers for the screen ---------- */

/** Best place to send something when it's tapped: foundation first, then a sensible column. */
export function autoTarget(s, from) {
  const cards = movingCards(s, from);
  if (!cards) return null;
  if (cards.length === 1 && from.type !== "foundation") {
    const to = { type: "foundation", suit: cards[0].s };
    if (isLegalMove(s, from, to)) return to;
  }
  const options = [];
  for (let col = 0; col < 7; col++) {
    const to = { type: "tableau", col };
    if (!isLegalMove(s, from, to)) continue;
    const empty = !s.tableau[col].length;
    // A king already at the bottom of its column gains nothing from moving to another empty one
    if (empty && from.type === "tableau" && from.index === 0) continue;
    options.push({ to, score: empty ? 1 : 2 });
  }
  options.sort((a, b) => b.score - a.score);
  return options[0]?.to ?? null;
}

/** Every card that can reach the top of the waste by cycling the stock (without playing anything). */
function reachableStockCards(s) {
  if (s.drawCount === 1) return [...s.waste, ...s.stock];
  let stock = [...s.stock];
  let waste = [...s.waste];
  const seen = new Map();
  if (waste.length) seen.set(cardKey(waste[waste.length - 1]), waste[waste.length - 1]);
  const limit = (stock.length + waste.length) * 2 + 4;
  for (let i = 0; i < limit; i++) {
    if (!stock.length) {
      stock = [...waste].reverse();
      waste = [];
      continue;
    }
    for (let k = 0; k < 3 && stock.length; k++) waste.push(stock.pop());
    const top = waste[waste.length - 1];
    seen.set(cardKey(top), top);
  }
  return [...seen.values()];
}

/**
 * Is there anything useful left to do? Ignores moves that just shuffle cards
 * between columns without revealing or freeing anything.
 */
export function hasUsefulMove(s) {
  if (s.won) return true;
  // Anything from the stock/waste that could be played somewhere
  const reachable = reachableStockCards(s);
  for (const c of reachable) {
    if (canGoOnFoundation(c, s.foundations)) return true;
    if (s.tableau.some((pile) => canGoOnTableau(c, pile))) return true;
  }
  // An empty column only helps a king you can actually get to
  const kingWaiting =
    reachable.some((c) => c.r === "K") ||
    s.tableau.some((pile) => pile.some((e, i) => e.up && e.card.r === "K" && i > 0));
  for (let col = 0; col < 7; col++) {
    const pile = s.tableau[col];
    if (!pile.length) continue;
    const top = pile[pile.length - 1].card;
    if (canGoOnFoundation(top, s.foundations)) return true;
    const fu = firstUp(pile);
    for (let i = fu; i < pile.length; i++) {
      for (let to = 0; to < 7; to++) {
        if (to === col || !canGoOnTableau(pile[i].card, s.tableau[to])) continue;
        if (i === fu && i > 0) return true; // turns over a face-down card
        if (i === 0 && s.tableau[to].length && kingWaiting) return true; // empties a column for a king
        if (i > fu && canGoOnFoundation(pile[i - 1].card, s.foundations)) return true; // frees a card for the foundation
      }
    }
  }
  return false;
}

/** All cards face up with nothing left in the stock: the rest can play itself out. */
export const canAutoFinish = (s) =>
  !s.won && !s.stock.length && !s.waste.length && s.tableau.every((pile) => pile.every((e) => e.up));

/** Next foundation move for auto-finish. */
export function nextFinishMove(s) {
  for (let col = 0; col < 7; col++) {
    const pile = s.tableau[col];
    if (!pile.length) continue;
    const from = { type: "tableau", col, index: pile.length - 1 };
    const to = { type: "foundation", suit: pile[pile.length - 1].card.s };
    if (isLegalMove(s, from, to)) return { type: "move", from, to };
  }
  return null;
}
