/** ---------- Hearts bots ----------
 * Bots only use what a person at the table would know: their own hand, cards
 * they passed and received, cards already played, and who has shown out of a
 * suit. The face-down cards stay unknown until the end of the hand.
 */
import {
  MOON_POINTS,
  cardKey,
  sameCard,
  rankVal,
  isQueenSpades,
  isPointCard,
  legalPlays,
  trickWinnerIndex,
  pointsIn,
  fullDeck,
} from "./hearts-engine.js";

const QS = { r: "Q", s: "♠" };
const bySuit = (hand, s) => hand.filter((c) => c.s === s);
const highest = (cards) => cards.reduce((a, b) => (rankVal(b) > rankVal(a) ? b : a));
const lowest = (cards) => cards.reduce((a, b) => (rankVal(b) < rankVal(a) ? b : a));

/** ---------- Passing ---------- */
export function choosePass(state, seat) {
  const hand = state.hands[seat];
  const k = state.rules.passCount;
  const random = state.passDir === "random";
  const spades = bySuit(hand, "♠");
  const lowSpades = spades.filter((c) => rankVal(c) < 12).length;
  const hasQ = hand.some(isQueenSpades);
  // Enough low spades to hide behind? Then keep the queen (and its guards).
  // With a random scatter the queen might just come back, so bots are keener to dump it.
  const queenSafe = hasQ && lowSpades >= (random ? 5 : 4);

  const danger = (c) => {
    let d = rankVal(c); // 2..14
    if (isQueenSpades(c)) return queenSafe ? -5 : 40;
    if (c.s === "♠" && rankVal(c) > 12) d += queenSafe || lowSpades >= 4 ? -6 : 14; // A♠/K♠ attract the queen
    if (c.s === "♥") d += 3;
    if (c.s === "♣" && c.r === "2") d -= 10;
    // Shortening a side suit lets you dump points later
    const len = bySuit(hand, c.s).length;
    if (c.s !== "♠" && c.s !== "♥" && len <= 2) d += 4;
    if (rankVal(c) <= 5) d -= 6;
    return d;
  };
  return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, k);
}

/** ---------- Knowledge ---------- */
function knowledge(state, seat) {
  const seen = new Set(state.played.map((p) => cardKey(p.card)));
  for (const c of state.hands[seat]) seen.add(cardKey(c));
  const live = (c) => !seen.has(cardKey(c));
  const liveInSuit = (s) => fullDeck().filter((c) => c.s === s && live(c));
  const pointsTaken = state.taken.map((t, i) =>
    // The face-down cards' points aren't known yet
    pointsIn(t.filter((c) => !(state.leftoverTaker === i && state.leftover.some((x) => sameCard(x, c)))))
  );
  const totalTaken = pointsTaken.reduce((a, b) => a + b, 0);
  return { seen, live, liveInSuit, pointsTaken, totalTaken, qsLive: live(QS) };
}

/** Someone who has every point taken so far and keeps winning tricks may be shooting. */
function moonThreat(state, seat, K) {
  const myScore = state.scores[seat];
  const worried = myScore + MOON_POINTS >= state.rules.target; // a moon would end the game on us
  for (let p = 0; p < state.n; p++) {
    if (p === seat || K.pointsTaken[p] !== K.totalTaken || !K.totalTaken) continue;
    const extras = state.leftoverTaker === p ? state.leftover.length : 0;
    const tricksWon = (state.taken[p].length - extras) / state.n;
    const dominating = state.trickNo > 0 && tricksWon / state.trickNo >= 0.6;
    if (K.pointsTaken[p] >= 16) return p;
    if (dominating && K.pointsTaken[p] >= (worried ? 4 : 6)) return p;
  }
  return null;
}

/** Should this bot go for the moon itself? */
function shootingMoon(state, seat, K) {
  if (state.leftover.length && state.leftoverTaker !== null && state.leftoverTaker !== seat) return false;
  if (K.pointsTaken[seat] !== K.totalTaken) return false;
  const hand = state.hands[seat];
  const bosses = hand.filter((c) => !K.liveInSuit(c.s).some((x) => rankVal(x) > rankVal(c))).length;
  const hearts = bySuit(hand, "♥");
  const heartBosses = hearts.filter((c) => !K.liveInSuit("♥").some((x) => rankVal(x) > rankVal(c))).length;
  const strong = bosses / hand.length >= 0.6 && (hearts.length === 0 || heartBosses >= Math.min(hearts.length, 3));
  if (K.totalTaken >= 14 && strong) return true;
  // Rare: a monster hand from the start
  return state.trickNo <= 1 && bosses >= hand.length - 2 && hearts.length >= 5 && heartBosses >= 3;
}

/** ---------- Playing ---------- */
function chooseLead(state, seat, legal, K, moon) {
  if (moon) {
    // Cash winners; lead hearts only once they're all boss
    const boss = legal.filter((c) => !K.liveInSuit(c.s).some((x) => rankVal(x) > rankVal(c)));
    if (boss.length) return highest(boss);
    return highest(legal);
  }
  const hand = state.hands[seat];
  const holdsQ = hand.some(isQueenSpades);
  const highSpades = hand.some((c) => c.s === "♠" && rankVal(c) > 12);
  const score = (c) => {
    const live = K.liveInSuit(c.s);
    const higher = live.filter((x) => rankVal(x) > rankVal(c)).length;
    const lower = live.filter((x) => rankVal(x) < rankVal(c)).length;
    // Low cards in suits with plenty of higher cards out are safe leads
    let v = higher * 2 - lower * 1.5 - rankVal(c) * 0.3;
    if (!live.length) v -= 8; // nobody can follow: you'd win it with points piled on
    if (isQueenSpades(c)) v -= 50;
    if (c.s === "♠" && K.qsLive && rankVal(c) > 12) v -= 30; // don't lead into the queen
    // Fish for the queen with low spades when you're not holding it
    if (c.s === "♠" && K.qsLive && !holdsQ && !highSpades && rankVal(c) < 12) v += 6;
    if (c.s === "♥") v -= 2 + (live.length ? 0 : 6);
    // Opponents known void in this suit will dump points on you
    const voids = state.voids.filter((v2, p) => p !== seat && v2.includes(c.s)).length;
    v -= voids * 3;
    return v;
  };
  return legal.reduce((a, b) => (score(b) > score(a) ? b : a));
}

function chooseFollow(state, seat, legal, K, moon, threat) {
  const trick = state.trick;
  const lead = trick[0].card.s;
  const w = trick[trickWinnerIndex(trick)];
  const last = trick.length === state.n - 1;
  let trickPts = pointsIn(trick.map((p) => p.card));
  // Winning the first trick also collects the face-down cards, points unknown
  if (state.trickNo === 0 && state.leftover.length) trickPts += state.leftover.length * 0.5;
  const following = legal[0].s === lead;

  if (!following) {
    // Void: unload the worst card, unless it'd feed a moon shot
    if (moon) return lowest(legal.filter((c) => !isPointCard(c)).length ? legal.filter((c) => !isPointCard(c)) : legal);
    const feedingMoon = threat !== null && w.player === threat;
    const pool = feedingMoon && legal.some((c) => !isPointCard(c)) ? legal.filter((c) => !isPointCard(c)) : legal;
    const dump = (c) => {
      let v = rankVal(c);
      if (isQueenSpades(c)) v += 100;
      else if (c.s === "♠" && rankVal(c) > 12 && K.qsLive) v += 60;
      else if (c.s === "♥") v += 20;
      // Getting rid of the last card of a suit makes a new void
      if (bySuit(state.hands[seat], c.s).length === 1) v += 3;
      return v;
    };
    return pool.reduce((a, b) => (dump(b) > dump(a) ? b : a));
  }

  const winPow = rankVal(w.card);
  const under = legal.filter((c) => rankVal(c) < winPow);
  const over = legal.filter((c) => rankVal(c) > winPow);

  if (moon) return over.length ? highest(over) : lowest(legal);

  // Block a moon: take a trick with points in it, cheaply
  if (threat !== null && w.player === threat && trickPts > 0 && over.length) return lowest(over);

  // Spades: drop the queen on someone else's A♠/K♠
  const qs = legal.find(isQueenSpades);
  if (qs && lead === "♠" && winPow > 12) return qs;

  if (under.length) {
    // Duck with the highest card that still loses, but never the queen unless it's safe
    const safe = under.filter((c) => !isQueenSpades(c) || winPow > 12);
    return highest(safe.length ? safe : under);
  }

  // We're going to win this trick
  if (last) {
    const nonQ = legal.filter((c) => !isQueenSpades(c));
    if (trickPts === 0 && nonQ.length) return highest(nonQ); // clean trick: shed a high card
    return lowest(legal);
  }
  if (lead === "♠" && K.qsLive) {
    // Others may still drop the queen on us: go low
    const nonQ = legal.filter((c) => !isQueenSpades(c));
    return lowest(nonQ.length ? nonQ : legal);
  }
  // Early in a fresh suit, everyone usually follows, so taking it high is cheap
  const nonQ = legal.filter((c) => !isQueenSpades(c));
  const seenInSuit = 13 - K.liveInSuit(lead).length - state.hands[seat].filter((c) => c.s === lead).length;
  if (trickPts === 0 && seenInSuit < 4 && nonQ.length) return highest(nonQ);
  return lowest(nonQ.length ? nonQ : legal);
}

function choosePlay(state, seat) {
  const legal = legalPlays(state, seat);
  if (legal.length === 1) return legal[0];
  const K = knowledge(state, seat);
  const moon = shootingMoon(state, seat, K);
  const threat = moon ? null : moonThreat(state, seat, K);
  return state.trick.length ? chooseFollow(state, seat, legal, K, moon, threat) : chooseLead(state, seat, legal, K, moon);
}

/** ---------- Entry point ---------- */
export function botAction(state, seat) {
  if (state.phase === "pass" && !state.passes[seat]) return { type: "pass", seat, cards: choosePass(state, seat) };
  if (state.phase === "playing" && state.turn === seat) return { type: "play", seat, card: choosePlay(state, seat) };
  return null;
}
