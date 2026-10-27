/** ---------- Blackjack bots ----------
 * The other players play "like real people": mostly by the book (basic
 * strategy), with the gut-feel mistakes you see at a real table, and their own
 * betting habits. They only see what anyone at the table can see.
 */
import { handTotal, legalActions, isTenValue, money } from "./blackjack-engine.js";

const upValue = (c) => (c.r === "A" ? 11 : isTenValue(c) ? 10 : +c.r);
const cardVal = (c) => (c.r === "A" ? 11 : isTenValue(c) ? 10 : +c.r);

/**
 * Basic strategy for a multi-deck shoe. Returns H (hit), S (stand), D (double,
 * else hit), Ds (double, else stand), P (split), R (surrender, else hit).
 */
export function basicStrategy(cards, up, rules) {
  const d = upValue(up);
  const { total, soft } = handTotal(cards);
  const h17 = rules.hitSoft17;

  if (cards.length === 2 && cardVal(cards[0]) === cardVal(cards[1])) {
    const v = cardVal(cards[0]);
    const das = rules.doubleAfterSplit;
    if (v === 11 || v === 8) return "P";
    if (v === 10) return "S";
    if (v === 9) return [7, 10, 11].includes(d) ? "S" : "P";
    if (v === 7) return d <= 7 ? "P" : "H";
    if (v === 6) return d <= 6 && (das || d >= 3) ? "P" : "H";
    if (v === 4) return das && (d === 5 || d === 6) ? "P" : "H";
    if (v === 2 || v === 3) return d <= 7 && (das || d >= 4) ? "P" : "H";
    // 5s play as a hard 10
  }

  if (soft) {
    if (total >= 20) return "S";
    if (total === 19) return h17 && d === 6 ? "Ds" : "S";
    if (total === 18) return d <= 6 ? (d >= 3 || (h17 && d === 2) ? "Ds" : "S") : d <= 8 ? "S" : "H";
    if (total === 17) return d >= 3 && d <= 6 ? "D" : "H";
    if (total === 15 || total === 16) return d >= 4 && d <= 6 ? "D" : "H";
    return d >= 5 && d <= 6 ? "D" : "H"; // soft 13–14
  }

  if (total >= 17) return total === 17 && h17 && d === 11 ? "R" : "S";
  if (total === 16) return d <= 6 ? "S" : d >= 9 ? "R" : "H";
  if (total === 15) return d <= 6 ? "S" : d === 10 || (h17 && d === 11) ? "R" : "H";
  if (total === 13 || total === 14) return d <= 6 ? "S" : "H";
  if (total === 12) return d >= 4 && d <= 6 ? "S" : "H";
  if (total === 11) return d === 11 && !h17 ? "H" : "D";
  if (total === 10) return d <= 9 ? "D" : "H";
  if (total === 9) return d >= 3 && d <= 6 ? "D" : "H";
  return "H";
}

/** Turn a strategy letter into an action the hand can actually take. */
function resolve(code, legal) {
  if (code === "P" && legal.split) return "split";
  if (code === "R") return legal.surrender ? "surrender" : "hit";
  if (code === "D") return legal.double ? "double" : "hit";
  if (code === "Ds") return legal.double ? "double" : "stand";
  if (code === "S") return "stand";
  return "hit";
}

/** Each regular has a personality. */
export const PERSONALITIES = {
  1: { name: "steady", mistakes: 0.06, chaseLoss: 0, pressWin: 0.25 }, // Zach
  2: { name: "cautious", mistakes: 0.1, chaseLoss: 0, pressWin: 0 }, // Josh: scared of busting
  3: { name: "chaser", mistakes: 0.08, chaseLoss: 1, pressWin: 0 }, // Collin: ups his bet after a loss
  4: { name: "hot-hand", mistakes: 0.12, chaseLoss: 0, pressWin: 1 }, // Syd: lets it ride on a streak
};

/** The bot's move for its current hand. */
export function botPlay(state) {
  const { p, h } = state.turn;
  const pl = state.players[p];
  const hand = pl.hands[h];
  const up = state.dealer.cards[0];
  const legal = legalActions(state);
  const pers = PERSONALITIES[pl.person] ?? PERSONALITIES[1];
  let action = resolve(basicStrategy(hand.cards, up, state.rules), legal);

  // The mistakes real players make
  const { total, soft } = handTotal(hand.cards);
  const d = upValue(up);
  const slip = Math.random() < pers.mistakes;
  if (slip) {
    if (!soft && total >= 12 && total <= 16 && d >= 7 && action === "hit") action = "stand"; // "dealer's going to bust"
    else if (!soft && total === 12 && d <= 3 && action === "hit") action = "stand";
    else if (action === "surrender") action = "hit"; // most people never surrender
    else if (action === "double" && total <= 10 && d >= 7) action = "hit"; // too nervous to double
    else if (soft && total === 18 && action === "hit") action = "stand"; // "18 is a good hand"
  }
  // The cautious one stands on stiff hands more than he should
  if (pers.name === "cautious" && !soft && total >= 13 && total <= 16 && action === "hit" && Math.random() < 0.3) action = "stand";
  // Surrender is rare at real tables
  if (action === "surrender" && Math.random() < 0.5) action = "hit";
  if (!legal[action]) action = legal.hit ? "hit" : "stand";
  return { type: action, person: pl.person };
}

/** Insurance: most people say no; a few take it on a good hand ("protect my 20"). */
export function botInsurance(state, pl) {
  const t = handTotal(pl.hands[0].cards).total;
  const take = (t >= 19 && Math.random() < 0.3) || Math.random() < 0.05;
  return { type: "insurance", person: pl.person, take: take && pl.bankroll >= pl.hands[0].bet / 2 };
}

/** How much each bot bets this round, based on bankroll and how the last hand went. */
export function botBet(state, pl) {
  const { minBet, maxBet } = state.rules;
  const pers = PERSONALITIES[pl.person] ?? PERSONALITIES[1];
  let base = Math.max(minBet, Math.round(pl.bankroll * 0.06));
  const last = pl.result?.net ?? 0;
  if (last > 0 && pers.pressWin && Math.random() < pers.pressWin) base = Math.max(base, pl.lastBet * 2);
  if (last < 0 && pers.chaseLoss) base = Math.max(base, pl.lastBet * 2);
  if (pers.name === "cautious") base = Math.max(minBet, Math.round(pl.bankroll * 0.04));
  // Bets come in chip amounts
  const chip = base >= 25 ? 5 : 1;
  base = Math.round(base / chip) * chip || minBet;
  return money(Math.max(minBet, Math.min(base, maxBet, pl.bankroll)));
}
