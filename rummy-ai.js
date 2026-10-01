/** ---------- Rummy 500 bots ----------
 * Bots only use what a person at the table would know: their own hand, the
 * melds on the table, the discard pile, how many cards everyone holds, and
 * which cards each player has picked up from the discard pile.
 */
import {
  cardKey,
  sameCard,
  rankNum,
  cardValue,
  handValue,
  layoffPos,
  canLayOff,
  canUse,
  bestMelds,
  allMelds,
  checkMeld,
} from "./rummy-engine.js";

/** How worried we are about getting caught holding cards (0 relaxed … 1 very). */
function danger(state, seat) {
  const minOpp = Math.min(...state.hands.map((h, i) => (i === seat ? 99 : h.length)));
  let d = 0.25;
  if (minOpp <= 6) d = 0.5;
  if (minOpp <= 3) d = 0.85;
  if (state.stock.length < 6) d = Math.max(d, 0.6);
  return d;
}

/** Points we could bank from this pool: our best melds plus singles that fit the table. */
function potential(pool, melds) {
  const best = bestMelds(pool);
  const singles = best.rest.filter((c) => canLayOff(c, melds));
  const loose = best.rest.filter((c) => !canLayOff(c, melds));
  return { value: best.value + handValue(singles), loose };
}

/** Pick a draw: the stock, or how deep to dig into the discard pile. */
function chooseDraw(state, seat) {
  const hand = state.hands[seat];
  const d = danger(state, seat);
  const base = potential(hand, state.melds);
  let best = null;
  for (let i = state.discard.length - 1; i >= 0; i--) {
    const taken = state.discard.slice(i);
    const pool = [...hand, ...taken];
    if (!canUse(taken[0], pool, state.melds)) continue;
    const after = potential(pool, state.melds);
    const gain = after.value - base.value;
    // Every extra card you can't use is a liability if someone goes out on you
    const junk = handValue(after.loose) - handValue(base.loose);
    const score = gain - Math.max(0, junk) * d - (taken.length - 1) * 1.5;
    if (!best || score > best.score) best = { index: i, score };
  }
  if (best && best.score >= 8) return { type: "takeDiscard", seat, index: best.index };
  if (state.stock.length) return { type: "drawStock", seat };
  if (best) return { type: "takeDiscard", seat, index: best.index };
  return { type: "stockOut", seat };
}

/** Best meld or layoff that uses `card`. */
function useCard(state, seat, card) {
  const hand = state.hands[seat];
  const withCard = bestMelds(hand).melds.find((m) => m.some((c) => sameCard(c, card)));
  if (withCard && hand.length - withCard.length >= 1) return { type: "meld", seat, cards: withCard };
  const meld = state.melds.find((m) => layoffPos(card, m) !== null);
  if (meld) return { type: "layoff", seat, card, meldId: meld.id };
  // Fall back to any meld containing it
  const any = allMelds(hand).find((m) => m.some((c) => sameCard(c, card)) && hand.length - m.length >= 1);
  if (any) return { type: "meld", seat, cards: any };
  return null;
}

/** Card we least want to keep. */
function chooseDiscard(state, seat) {
  const hand = state.hands[seat];
  const best = bestMelds(hand);
  const inMeld = new Set(best.melds.flat().map(cardKey));
  const others = state.hands.map((_, i) => i).filter((i) => i !== seat);
  const theirPickups = others.flatMap((i) => state.pickups[i]);

  const keep = (c) => {
    if (inMeld.has(cardKey(c))) return 1000;
    let k = 0;
    // Pairs and near-runs are worth hanging on to
    k += hand.filter((x) => x !== c && x.r === c.r).length * 12;
    k += hand.filter((x) => x !== c && x.s === c.s && Math.abs(rankNum(x) - rankNum(c)) <= 2).length * 7;
    // Don't hand the next player a card they can play off the table
    if (canLayOff(c, state.melds)) k += 25;
    // Or one that fits what they've been picking up
    if (theirPickups.some((p) => p.r === c.r || (p.s === c.s && Math.abs(rankNum(p) - rankNum(c)) <= 2))) k += 10;
    // Big cards hurt if you're caught with them
    k -= cardValue(c) * (0.4 + danger(state, seat));
    return k;
  };
  return hand.reduce((a, b) => (keep(b) < keep(a) ? b : a));
}

/** What to do next in the play phase (one step at a time so people can follow along). */
function choosePlay(state, seat) {
  const hand = state.hands[seat];

  // The card picked up from the discard pile has to be played first
  if (state.mustPlay) {
    const a = useCard(state, seat, state.mustPlay);
    if (a) return a;
  }

  const best = bestMelds(hand);
  const d = danger(state, seat);
  const restAfterMelds = best.rest.filter((c) => !canLayOff(c, state.melds));
  const canGoOut = restAfterMelds.length <= 1 || (restAfterMelds.length === 0 && best.rest.length >= 1);

  // Singles off the table are free points
  for (const c of best.rest) {
    if (hand.length < 2) break;
    const m = state.melds.find((x) => layoffPos(c, x) !== null);
    if (m) return { type: "layoff", seat, card: c, meldId: m.id };
  }

  // Lay down melds: always when going out or under threat; big melds right away;
  // small ones are sometimes held back so nobody can play off them.
  for (const m of best.melds) {
    if (hand.length - m.length < 1) continue;
    const v = handValue(m);
    const hold = !canGoOut && d < 0.5 && v < 30 && checkMeld(m)?.type === "run" && Math.random() < 0.35;
    if (!hold) return { type: "meld", seat, cards: m };
  }

  return { type: "discard", seat, card: chooseDiscard(state, seat) };
}

/** ---------- Entry point ---------- */
export function botAction(state, seat) {
  if (state.turn !== seat) return null;
  if (state.phase === "draw") return chooseDraw(state, seat);
  if (state.phase === "play") return choosePlay(state, seat);
  return null;
}
