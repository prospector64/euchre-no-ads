/** ---------- Bot players ----------
 * Bots only use what a person at the table would know: their own hand, cards
 * already played, the turned-down upcard, shown bottoms cards, and who has
 * shown out of a suit. They never look at other hands or the kitty.
 */
import {
  SUITS,
  sameColor,
  partnerOf,
  teamOf,
  cardKey,
  sameCard,
  isRight,
  isLeft,
  effSuit,
  isTrump,
  rankInSuit,
  trickPower,
  trickWinnerIndex,
  legalPlays,
  suitMembers,
  bottomsCards,
  canTakeBottoms,
  nextActiveSeat,
  WIN_SCORE,
} from "./engine.js";

const rel = (seat, dealer) => (seat - dealer + 4) % 4; // 0 dealer, 1 left of dealer, 2 dealer's partner, 3 right of dealer
const jitter = (amt) => (Math.random() * 2 - 1) * amt; // a little human inconsistency near the line

/** ---------- Hand evaluation ----------
 * Rough count of tricks this hand should take by itself with `t` as trump.
 * `out` = cards known not to be in anyone else's hand (e.g. the turned-down upcard).
 */
export function estimateTricks(hand, t, out = []) {
  const outKeys = new Set(out.map(cardKey));
  const trumps = hand.filter((c) => isTrump(c, t));
  const n = trumps.length;
  const heldKeys = new Set(hand.map(cardKey));
  let est = 0;

  // Trump: a card's worth depends on how many higher trumps could be against it
  const trumpSuit = suitMembers(t, t);
  for (const c of trumps) {
    const r = rankInSuit(c, t);
    const higherLive = trumpSuit.filter(
      (x) => rankInSuit(x, t) > r && !heldKeys.has(cardKey(x)) && !outKeys.has(cardKey(x))
    ).length;
    if (higherLive === 0) est += 1;
    else if (higherLive === 1) est += n >= 3 ? 0.8 : 0.6;
    else if (higherLive === 2) est += n >= 3 ? 0.6 : 0.4;
    else est += n >= 4 ? 0.55 : n >= 3 ? 0.45 : 0.25;
  }

  // Side suits: aces (and backed kings) win; voids let trump ruff
  for (const s of SUITS) {
    if (s === t) continue;
    const cards = hand.filter((c) => effSuit(c, t) === s);
    const len = cards.length;
    const hasA = cards.some((c) => c.r === "A");
    const hasK = cards.some((c) => c.r === "K");
    if (hasA) est += len === 1 ? 0.8 : len === 2 ? 0.7 : 0.5;
    if (hasK) est += hasA ? (len <= 3 ? 0.4 : 0.2) : len <= 2 ? 0.25 : 0.1;
    if (n >= 2 && len === 0) est += 0.3;
    else if (n >= 2 && len === 1 && !hasA) est += 0.12;
  }
  return Math.min(est, 5);
}

/** Rough worth (in tricks) of a single card to whoever ends up holding it as trump. */
function upcardValue(c, t) {
  if (isRight(c, t)) return 0.8;
  if (isLeft(c, t)) return 0.6;
  if (c.r === "A") return 0.45;
  return 0.3;
}

/** Best 5 of the dealer's 6 cards after picking up. Returns { discard, est }. */
export function bestDiscard(six, t) {
  let best = null;
  for (const c of six) {
    const five = six.filter((x) => !sameCard(x, c));
    // Never throw trump if avoidable; tie-break toward the lowest card
    const est =
      estimateTricks(five, t) - (isTrump(c, t) ? 0.5 : 0) - rankInSuit(c, t) * 0.01;
    if (!best || est > best.est) best = { discard: c, est };
  }
  return best;
}

/** How many tricks we can expect from partner, given what they've shown in bidding. */
function partnerTricks(state, seat) {
  const p = partnerOf(seat);
  return state.bids[p] === "Pass" ? 0.4 : 0.55;
}

/** Scoreboard pressure: humans stretch when opponents are close to winning. */
function pressure(state, seat) {
  const us = state.score[teamOf(seat)];
  const them = state.score[1 - teamOf(seat)];
  let adj = 0;
  if (them >= WIN_SCORE - 2) adj -= 0.15; // stop them from calling it
  if (us >= WIN_SCORE - 1 && them <= WIN_SCORE - 4) adj += 0.1; // no need to gamble
  return adj;
}

function wantsLoner(state, seat, est, hand, t) {
  const us = state.score[teamOf(seat)];
  if (us >= WIN_SCORE - 2) return false; // a regular march already wins
  const hasRight = hand.some((c) => isRight(c, t));
  const nTrump = hand.filter((c) => isTrump(c, t)).length;
  return hasRight && nTrump >= 3 && est >= 4.3;
}

/** ---------- Bidding ---------- **/
function round1(state, seat) {
  const { upcard, dealer } = state;
  const t = upcard.s;
  const hand = state.hands[seat];
  const r = rel(seat, dealer);

  let est;
  let lonerHand = hand;
  if (r === 0) {
    const pick = bestDiscard([...hand, upcard], t);
    est = pick.est;
    lonerHand = [...hand, upcard].filter((c) => !sameCard(c, pick.discard));
  } else {
    est = estimateTricks(hand, t);
    // Ordering up hands the dealer a trump: help if it's partner, hurt if it's an opponent
    est += (r === 2 ? 1 : -1) * upcardValue(upcard, t);
  }
  if (r === 1) est += 0.1; // makers get the opening lead

  const need = 3.15 + pressure(state, seat) + (r === 3 ? 0.15 : 0); // 3rd seat has least info
  const total = est + partnerTricks(state, seat) + jitter(0.15);
  if (total < need) return { type: "pass", seat };

  const alone = wantsLoner(state, seat, r === 0 ? est : estimateTricks(hand, t), lonerHand, t);
  return { type: "orderUp", seat, alone };
}

function round2(state, seat) {
  const { upcard, dealer } = state;
  const hand = state.hands[seat];
  const r = rel(seat, dealer);
  const stuck = seat === dealer;

  let best = null;
  for (const s of SUITS) {
    if (s === upcard.s) continue;
    let est = estimateTricks(hand, s, [upcard]);
    const next = sameColor(s, upcard.s);
    // "Next": dealer's side passed a card of this colour, so the bowers are likely
    // elsewhere. Seats left and right of dealer favour next; dealer's team crosses.
    if (next && (r === 1 || r === 3)) est += 0.25;
    if (!next && (r === 0 || r === 2)) est += 0.1;
    if (r === 1) est += 0.1;
    if (!best || est > best.est) best = { suit: s, est };
  }

  const need = 3.0 + pressure(state, seat) + (r === 3 ? 0.1 : 0);
  const total = best.est + partnerTricks(state, seat) + jitter(0.15);
  if (!stuck && total < need) return { type: "pass", seat };

  const alone = wantsLoner(state, seat, estimateTricks(hand, best.suit, [upcard]), hand, best.suit);
  return { type: "call", seat, suit: best.suit, alone };
}

/** Take the bottoms with a hand that isn't worth calling anyway. */
function bottomsDecision(state, seat) {
  if (!canTakeBottoms(state, seat)) return null;
  const hand = state.hands[seat];
  const { upcard } = state;
  let bestEst = estimateTricks(hand, upcard.s);
  for (const s of SUITS) if (s !== upcard.s) bestEst = Math.max(bestEst, estimateTricks(hand, s, [upcard]));
  if (bestEst >= 2.2) return null;

  // Keep the most useful card if more than three qualify: upcard suit, then 10s over 9s
  const keepValue = (c) => (effSuit(c, upcard.s) === upcard.s ? 2 : 0) + (c.r === "10" ? 1 : 0);
  let pool = bottomsCards(hand, state.rules.bottoms);
  if (state.rules.bottoms !== "mixed") pool = pool.filter((c) => c.r === pool[0].r);
  const cards = [...pool].sort((a, b) => keepValue(a) - keepValue(b)).slice(0, 3);
  return { type: "bottoms", seat, cards };
}

/** ---------- Card play ---------- **/
function knowledge(state, seat) {
  const t = state.trump;
  const seen = new Set();
  for (const p of state.played) seen.add(cardKey(p.card));
  for (const c of state.hands[seat]) seen.add(cardKey(c));
  if (state.upcardDown || (state.alone !== null && partnerOf(state.alone) === state.dealer)) {
    seen.add(cardKey(state.upcard));
  }
  if (state.bottoms) for (const c of state.bottoms.shown) seen.add(cardKey(c));
  if (seat === state.dealer && state.dealerDiscard) seen.add(cardKey(state.dealerDiscard));

  /** Cards that could still beat `card` in its own suit and are in someone else's hand. */
  const higherLive = (card) => {
    const s = effSuit(card, t);
    const r = rankInSuit(card, t);
    return suitMembers(s, t).filter((x) => rankInSuit(x, t) > r && !seen.has(cardKey(x)));
  };
  const liveTrump = suitMembers(t, t).filter((x) => !seen.has(cardKey(x))).length;
  const suitSeenCount = (s) => suitMembers(s, t).filter((x) => seen.has(cardKey(x))).length;
  return { t, seen, higherLive, liveTrump, suitSeenCount };
}

/** Could an opponent still to play take a trick that `card` is currently winning? */
function beatable(state, seat, card, lead, K) {
  const t = K.t;
  const opps = [];
  let p = seat;
  const remaining = state.trick.length ? countAfter(state) : 0;
  for (let i = 0; i < remaining; i++) {
    p = nextActiveSeat(state, p);
    if (teamOf(p) !== teamOf(seat)) opps.push(p);
  }
  if (!opps.length) return false;
  const cardIsTrump = isTrump(card, t);
  for (const o of opps) {
    const voidLead = state.voids[o].includes(lead);
    const voidTrump = state.voids[o].includes(t);
    if (cardIsTrump) {
      if (!voidTrump && K.higherLive(card).length) return true;
      continue;
    }
    if (!voidLead && K.higherLive(card).length) return true;
    // Could they ruff? Likely once the suit has gone around, or if they've shown out
    const likelyVoid = voidLead || K.suitSeenCount(lead) >= 4;
    if (likelyVoid && !voidTrump && K.liveTrump > 0) return true;
  }
  return false;
}

/** Number of players still to act after the current player in this trick. */
function countAfter(state) {
  const total = state.alone === null ? 4 : 3;
  return total - state.trick.length - 1;
}

/** Lowest-value card to throw away: keep trump and winners, shorten a suit to set up a ruff. */
function throwOff(hand, legal, t, K) {
  let best = null;
  let bestScore = Infinity;
  for (const c of legal) {
    const s = effSuit(c, t);
    const len = hand.filter((x) => effSuit(x, t) === s).length;
    let score = rankInSuit(c, t);
    if (isTrump(c, t)) score += 20;
    if (!K.higherLive(c).length) score += 10; // a boss card is worth keeping
    if (len === 1 && !isTrump(c, t)) score -= 1.5; // makes a void
    if (score < bestScore) (bestScore = score), (best = c);
  }
  return best;
}

const lowest = (cards, t) => cards.reduce((a, b) => (rankInSuit(b, t) < rankInSuit(a, t) ? b : a));
const highest = (cards, t) => cards.reduce((a, b) => (rankInSuit(b, t) > rankInSuit(a, t) ? b : a));

function chooseLead(state, seat, legal, K) {
  const t = K.t;
  const hand = state.hands[seat];
  const trumps = legal.filter((c) => isTrump(c, t));
  const offs = legal.filter((c) => !isTrump(c, t));
  const onMakerTeam = teamOf(state.maker) === teamOf(seat);
  const iAmMaker = state.maker === seat;
  const trumpOutThere = K.liveTrump > 0;

  const bossTrump = trumps.find((c) => !K.higherLive(c).length);
  // Off-suit bosses (usually aces); prefer short suits since they're less likely to be ruffed
  const bossOffs = offs
    .filter((c) => !K.higherLive(c).length && K.suitSeenCount(effSuit(c, t)) < 4)
    .sort((a, b) => hand.filter((x) => effSuit(x, t) === effSuit(a, t)).length - hand.filter((x) => effSuit(x, t) === effSuit(b, t)).length);

  if (iAmMaker) {
    // Pull trump with the top of it, then cash side winners
    if (trumpOutThere && bossTrump && trumps.length >= 2) return bossTrump;
    if (trumpOutThere && trumps.length >= 3) return highest(trumps, t);
    if (bossOffs.length) return bossOffs[0];
    if (!trumpOutThere && trumps.length) return highest(trumps, t);
  } else if (onMakerTeam) {
    // Partner called it: lead trump back to them
    if (trumps.length && trumpOutThere) return bossTrump ?? lowest(trumps, t);
    if (bossOffs.length) return bossOffs[0];
  } else {
    // Defending: cash aces, don't lead trump into the makers
    if (bossOffs.length) return bossOffs[0];
    if (bossTrump && trumps.length >= 2 && state.trickNo >= 2) return bossTrump;
  }

  if (offs.length) {
    // Lead low; from a singleton if we can ruff that suit later; avoid leading an unguarded king
    const score = (c) => {
      const s = effSuit(c, t);
      const len = hand.filter((x) => effSuit(x, t) === s).length;
      let v = rankInSuit(c, t);
      if (len === 1 && trumps.length) v -= 2;
      if (c.r === "K" && K.higherLive(c).length) v += 3;
      return v;
    };
    return offs.reduce((a, b) => (score(b) < score(a) ? b : a));
  }
  return bossTrump ?? lowest(trumps, t);
}

function chooseFollow(state, seat, legal, lead, K) {
  const t = K.t;
  const hand = state.hands[seat];
  const trick = state.trick;
  const w = trick[trickWinnerIndex(trick, t)];
  const winPow = trickPower(w.card, t, lead);
  const partnerWinning = teamOf(w.player) === teamOf(seat);
  const last = countAfter(state) === 0;
  const winners = legal
    .filter((c) => trickPower(c, t, lead) > winPow)
    .sort((a, b) => trickPower(a, t, lead) - trickPower(b, t, lead));
  const following = legal.some((c) => effSuit(c, t) === lead);

  if (partnerWinning) {
    if (last || !beatable(state, seat, w.card, lead, K)) return throwOff(hand, legal, t, K);
    // Partner's card is vulnerable. Following suit: play high if it's a sure thing.
    const safe = winners.find((c) => !beatable(state, seat, c, lead, K));
    if (following && safe) return safe;
    // Void: only trump partner's low card when an opponent behind us could beat it
    if (!following && safe && isTrump(safe, t) && !isTrump(w.card, t) && rankInSuit(w.card, t) <= 4) return safe;
    return throwOff(hand, legal, t, K);
  }

  if (!winners.length) return throwOff(hand, legal, t, K);
  if (last) return winners[0];

  const safe = winners.find((c) => !beatable(state, seat, c, lead, K));
  if (safe) return safe;
  if (!following) return winners[0]; // ruff with the lowest trump that wins
  // Second hand low, third hand high
  if (trick.length === 1) return throwOff(hand, legal, t, K);
  return winners[winners.length - 1];
}

function choosePlay(state, seat) {
  const t = state.trump;
  const hand = state.hands[seat];
  const lead = state.trick.length ? effSuit(state.trick[0].card, t) : null;
  const legal = legalPlays(hand, t, lead);
  if (legal.length === 1) return legal[0];
  const K = knowledge(state, seat);
  return lead ? chooseFollow(state, seat, legal, lead, K) : chooseLead(state, seat, legal, K);
}

/** ---------- Entry point ---------- **/
export function botAction(state, seat) {
  switch (state.phase) {
    case "bid1":
      return bottomsDecision(state, seat) ?? round1(state, seat);
    case "bid2":
      return round2(state, seat);
    case "discard":
      return { type: "discard", seat, card: bestDiscard(state.hands[seat], state.trump).discard };
    case "playing":
      return { type: "play", seat, card: choosePlay(state, seat) };
    default:
      return null;
  }
}
