import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------- Constants & helpers ---------- **/
const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_NAMES = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
const RANKS = ["9", "10", "J", "Q", "K", "A"];
const rankOrder = { A: 6, K: 5, Q: 4, J: 3, "10": 2, "9": 1 };

const isRedSuit = (s) => s === "♥" || s === "♦";
const sameColor = (a, b) => isRedSuit(a) === isRedSuit(b);

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ s, r });
  return deck;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cardKey(c) {
  return `${c.r}${c.s}`;
}

function isRightBower(c, trump) {
  return c.r === "J" && c.s === trump;
}
function isLeftBower(c, trump) {
  return c.r === "J" && c.s !== trump && sameColor(c.s, trump);
}
function effectiveSuit(c, trump) {
  if (!trump) return c.s;
  if (isRightBower(c, trump) || isLeftBower(c, trump)) return trump;
  return c.s;
}
function cardPower(c, trump, leadSuit) {
  if (trump) {
    if (isRightBower(c, trump)) return 200;
    if (isLeftBower(c, trump)) return 190;
  }
  const eff = effectiveSuit(c, trump);
  const isTrump = trump && eff === trump;
  const followsLead = leadSuit && eff === leadSuit;

  if (leadSuit && !isTrump && !followsLead) return 0;

  const base = rankOrder[c.r] ?? 0;
  return (isTrump ? 100 : 50) + base;
}
function isPartner(a, b) {
  return a % 2 === b % 2;
}

function dealHand() {
  const deck = shuffle(makeDeck());
  const hands = [[], [], [], []];
  let idx = 0;
  for (let i = 0; i < 20; i++) {
    hands[idx].push(deck.pop());
    idx = (idx + 1) % 4;
  }
  const upcard = deck.pop();
  return { hands, upcard };
}

function legalCards(hand, trump, leadSuit) {
  if (!leadSuit) return hand;
  const follows = hand.filter((c) => effectiveSuit(c, trump) === leadSuit);
  return follows.length ? follows : hand;
}

/** ---------- AI heuristics ---------- **/
function handStrengthForTrump(hand, trump) {
  let score = 0;
  for (const c of hand) {
    if (isRightBower(c, trump)) score += 9;
    else if (isLeftBower(c, trump)) score += 7;
    else if (effectiveSuit(c, trump) === trump) score += 2 + (rankOrder[c.r] ?? 0) * 0.35;
    else {
      if (c.r === "A") score += 1.2;
      if (c.r === "K") score += 0.4;
    }
  }
  return score;
}

function bestSuitChoice(hand, forbiddenSuit) {
  let best = null;
  let bestScore = -Infinity;
  for (const s of SUITS) {
    if (s === forbiddenSuit) continue;
    const sc = handStrengthForTrump(hand, s);
    if (sc > bestScore) (bestScore = sc), (best = s);
  }
  return { suit: best, score: bestScore };
}

/** Make bots pass more often (so upcard is NOT always ordered) */
function shouldOrderUp(hand, upSuit, seatIsDealer, seatIsPartnerDealer) {
  const trumpCount = hand.filter((c) => effectiveSuit(c, upSuit) === upSuit).length;
  if (trumpCount >= 3) return true;

  const sc = handStrengthForTrump(hand, upSuit);

  // Your rule: partner dealing => slightly looser; opponent dealing => tighter
  const threshold = seatIsPartnerDealer ? 12.8 : 13.2;

  // (Optional) if YOU are the dealer and thinking about picking it up,
  // you can make it slightly looser or keep it aligned. I'd keep it aligned:
  // const threshold = seatIsPartnerDealer ? 12.8 : 13.2;

  return sc >= threshold;
}

function shouldCallSuitRound2(hand, forbiddenSuit, mustPick) {
  const { suit, score } = bestSuitChoice(hand, forbiddenSuit);
  if (mustPick) return { call: true, suit, score };
  return { call: score >= 8.3, suit, score };
}

/** Stricter loner heuristic (rare) */
function shouldGoAlone_STRICT(hand, trump, seatIsDealer, upcard, orderedUpRound1) {
  // Count trump in the *final* dealer hand if they are picking up.
  const willPickUp = orderedUpRound1 && seatIsDealer; // dealer picks up only in round 1 order-up

  const effectiveTrumpCount =
    hand.filter((c) => effectiveSuit(c, trump) === trump).length + (willPickUp ? 1 : 0);

  const hasRBInHand = hand.some((c) => isRightBower(c, trump));
  const hasRBUpcard = willPickUp && upcard && isRightBower(upcard, trump);

  const hasRightBower = hasRBInHand || hasRBUpcard;

  // Require Right Bower AND 4 trump total, with pickup counting for dealer
  return hasRightBower && effectiveTrumpCount >= 4;
}


function choosePlayCardAI(hand, trump, trick, seat, inactivePlayer) {
  const leadSuit = trick.length ? effectiveSuit(trick[0].card, trump) : null;
  const legal = legalCards(hand, trump, leadSuit);

  if (!leadSuit) {
    // lead: try to take control only if you have strong trump
    const trumpCards = legal.filter((c) => effectiveSuit(c, trump) === trump);
    const hasTopTrump = trumpCards.some((c) => isRightBower(c, trump) || isLeftBower(c, trump) || c.r === "A");
    if (hasTopTrump && trumpCards.length) {
      let best = trumpCards[0];
      let bestP = -1;
      for (const c of trumpCards) {
        const p = cardPower(c, trump, trump);
        if (p > bestP) (bestP = p), (best = c);
      }
      return best;
    }

    const sideAces = legal.filter((c) => c.r === "A" && effectiveSuit(c, trump) !== trump);
    if (sideAces.length) return sideAces[0];

    // otherwise dump lowest
    let pick = legal[0];
    let best = Infinity;
    for (const c of legal) {
      const p = cardPower(c, trump, effectiveSuit(c, trump));
      if (p < best) (best = p), (pick = c);
    }
    return pick;
  }
// --- RULE: If partner is already winning and you are LAST to act, do NOT waste trump.
// Dump lowest non-trump if possible; otherwise dump lowest legal.
if (leadSuit) {
  const targetCount = inactivePlayer === null ? 4 : 3;
  const isLastToPlay = trick.length === targetCount - 1;

  if (isLastToPlay) {
    // determine current winning seat + winning card
    let bestSeat = trick[0].player;
    let bestCard = trick[0].card;
    let bestPow = cardPower(bestCard, trump, leadSuit);

    for (let i = 1; i < trick.length; i++) {
      const pow = cardPower(trick[i].card, trump, leadSuit);
      if (pow > bestPow) {
        bestPow = pow;
        bestSeat = trick[i].player;
        bestCard = trick[i].card;
      }
    }

    // if partner is winning WITHOUT trump, don't trump it
    const partnerWinning = isPartner(bestSeat, seat);
    const partnerWinningIsTrump = effectiveSuit(bestCard, trump) === trump;

    if (partnerWinning && !partnerWinningIsTrump) {
      const nonTrumpLegal = legal.filter((c) => effectiveSuit(c, trump) !== trump);

      // pick lowest non-trump legal if possible
      const pool = nonTrumpLegal.length ? nonTrumpLegal : legal;

      let pick = pool[0];
      let best = Infinity;
      for (const c of pool) {
        const p = cardPower(c, trump, leadSuit);
        // if the pool is non-trump-only, this is just "lowest"; if not, still dumps lowest
        if (p < best) (best = p), (pick = c);
      }
      return pick;
    }
  }
}
  // follow: win if cheap; else dump
  const lead = leadSuit;
  let currentWinningPow = -1;
  for (let i = 0; i < trick.length; i++) {
    const pow = cardPower(trick[i].card, trump, lead);
    if (pow > currentWinningPow) currentWinningPow = pow;
  }

  const winners = [];
  for (const c of legal) {
    const pow = cardPower(c, trump, lead);
    if (pow > currentWinningPow) winners.push({ c, pow });
  }
  if (winners.length) {
    winners.sort((a, b) => a.pow - b.pow);
    return winners[0].c;
  }

  let pick = legal[0];
  let best = Infinity;
  for (const c of legal) {
    const pow = cardPower(c, trump, lead);
    const eff = effectiveSuit(c, trump);
    const dumpScore = eff === trump ? pow + 50 : pow;
    if (dumpScore < best) (best = dumpScore), (pick = c);
  }
  return pick;
}

/** Sort your hand once trump is known:
 * - trump far right (higher further right)
 * - same-color non-trump next right
 * - others grouped; higher to right
 */
function sortHandForTrump(hand, trump) {
  if (!trump) return hand;

  const suitIndex = (s) => SUITS.indexOf(s);

  const valueWithinSuit = (c) => {
    const eff = effectiveSuit(c, trump);
    return cardPower(c, trump, eff);
  };

  const sortKey = (c) => {
    const eff = effectiveSuit(c, trump);
    const cat = eff === trump ? 3 : sameColor(eff, trump) ? 2 : 1;
    const suitGroup = suitIndex(eff);
    const val = valueWithinSuit(c);
    return cat * 1000 + suitGroup * 100 + val; // bigger ends up on right
  };

  return [...hand].sort((a, b) => sortKey(a) - sortKey(b));
}

/** ---------- UI components ---------- **/
function Card({ c, onClick, disabled, faceDown, small, highlight, dim }) {
  if (faceDown) return <div className={`card facedown ${small ? "small" : ""}`} />;

  const isRed = c.s === "♥" || c.s === "♦";
  return (
    <button
      className={[
        "card",
        isRed ? "red" : "black",
        disabled ? "disabled" : "",
        small ? "small" : "",
        highlight ? "highlight" : "",
        dim ? "dim" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
      title={`${c.r} of ${SUIT_NAMES[c.s]}`}
    >
      <div className="corner tl">
        <div className="rank">{c.r}</div>
        <div className="suit">{c.s}</div>
      </div>

      <div className="pip">{c.s}</div>

      <div className="corner br">
        <div className="rank">{c.r}</div>
        <div className="suit">{c.s}</div>
      </div>
    </button>
  );
}

function DealerChip() {
  return <span className="chip dealerChip">D</span>;
}
function TrumpChip({ suit }) {
  if (!suit) return null;
  const red = suit === "♥" || suit === "♦";
  return (
    <span className={`chip trumpChip ${red ? "chipRed" : "chipBlack"}`}>
      {suit}
    </span>
  );
}

function Stars({ filled, className = "" }) {
  const n = Math.max(0, Math.min(5, filled));
  return (
    <div className={`stars ${className}`} aria-label={`Tricks won: ${n}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`star ${i < n ? "on" : ""}`}>★</span>
      ))}
    </div>
  );
}

/** ---------- Main App ---------- **/
export default function App() {
  const teamOf = (p) => p % 2;

  const [names, setNames] = useState({ p0: "Nick", p1: "Jim", p2: "Maddie", p3: "Jenn" });
  const [showSettings, setShowSettings] = useState(false);

  const [phase, setPhase] = useState("idle");
  // idle, bid1, dealer_discard, bid2, playing, hand_over

  const [{ hands, upcard }, setDeal] = useState(() => ({ hands: [[], [], [], []], upcard: null }));
  const [dealer, setDealer] = useState(0);
  const [turn, setTurn] = useState(0);

  const [trump, setTrump] = useState(null);
  const [maker, setMaker] = useState(null);
  const [makerTeam, setMakerTeam] = useState(null);
  const [alonePlayer, setAlonePlayer] = useState(null);
  const inactivePlayer = useMemo(() => (alonePlayer === null ? null : (alonePlayer + 2) % 4), [alonePlayer]);

  const [trick, setTrick] = useState([]); // {player, card}
  const [tricksWonTeam, setTricksWonTeam] = useState([0, 0]);
  const [tricksWonPlayer, setTricksWonPlayer] = useState([0, 0, 0, 0]); // per-player stars
  const [tricksCompleted, setTricksCompleted] = useState(0);

  const [score, setScore] = useState([0, 0]);

  const [bidLog, setBidLog] = useState([]);
  const [logOpen, setLogOpen] = useState(true);

  const [seatBadge, setSeatBadge] = useState(["", "", "", ""]);
  const [cooldownUntil, setCooldownUntil] = useState(0);

function flashBadge(seat, text, ms = 2500) {
  setSeatBadge((prev) => {
    const next = [...prev];
    next[seat] = text;
    return next;
  });
  setTimeout(() => {
    setSeatBadge((prev) => {
      const next = [...prev];
      if (next[seat] === text) next[seat] = "";
      return next;
    });
  }, ms);
}

function setCooldown(ms = 3000) {
  setCooldownUntil(Date.now() + ms);
}

  const [pendingDealerPickup, setPendingDealerPickup] = useState(false);
  const [forcedDealerPick, setForcedDealerPick] = useState(false);

  // trick pacing / highlight
  const [trickWinnerPreview, setTrickWinnerPreview] = useState(null);
  const [pauseTrick, setPauseTrick] = useState(false);

  const botTimer = useRef(null);

  const playerName = (i) => (i === 0 ? names.p0 : i === 1 ? names.p1 : i === 2 ? names.p2 : names.p3);
  const gameOver = score[0] >= 10 || score[1] >= 10;
  const winningTeam = () => (score[0] >= 10 ? 0 : score[1] >= 10 ? 1 : null);

  const leadSuit = useMemo(() => {
    if (!trick.length || !trump) return null;
    return effectiveSuit(trick[0].card, trump);
  }, [trick, trump]);

  function logBid(msg) {
    setBidLog((l) => [...l, msg]);
  }

  function resetEverything() {
    setScore([0, 0]);
    setDealer(0);
    setPhase("idle");
    setDeal({ hands: [[], [], [], []], upcard: null });
    setTrump(null);
    setMaker(null);
    setMakerTeam(null);
    setAlonePlayer(null);
    setBidLog([]);
    setTrick([]);
    setTricksWonTeam([0, 0]);
    setTricksWonPlayer([0, 0, 0, 0]);
    setPendingDealerPickup(false);
    setForcedDealerPick(false);
    setLogOpen(true);
    setTurn(0);
    setTrickWinnerPreview(null);
    setPauseTrick(false);
  }

  function startNewHand(newDealer = dealer) {
    const dealt = dealHand();
    setDeal(dealt);

    setTrump(null);
    setMaker(null);
    setMakerTeam(null);
    setAlonePlayer(null);

    setBidLog([]);
    setTrick([]);
    setTricksWonTeam([0, 0]);
    setTricksWonPlayer([0, 0, 0, 0]);
    setTricksCompleted(0);

    setPendingDealerPickup(false);
    setForcedDealerPick(false);

    setTrickWinnerPreview(null);
    setPauseTrick(false);

    const first = (newDealer + 1) % 4;
    setTurn(first);
    setPhase("bid1");
    setLogOpen(true);
    logBid(`— New hand. Upcard is ${dealt.upcard.r}${dealt.upcard.s}. —`);
  }

  function nextDealerAndHand() {
    const nd = (dealer + 1) % 4;
    setDealer(nd);
    setTimeout(() => startNewHand(nd), 150);
  }

  /** Turn rotation that skips inactive seat in loner */
  function nextTurnIndex(cur) {
    let n = (cur + 1) % 4;
    if (inactivePlayer !== null && n === inactivePlayer) n = (n + 1) % 4;
    return n;
  }
  function normalizeTurnMaybe(t) {
    if (inactivePlayer !== null && t === inactivePlayer) return nextTurnIndex(t);
    return t;
  }
  useEffect(() => {
    setTurn((t) => normalizeTurnMaybe(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inactivePlayer]);

  /** Current winning player for highlight + dimming */
  const currentWinningPlayer = useMemo(() => {
    if (!trick.length || !trump) return null;
    const lead = effectiveSuit(trick[0].card, trump);
    let bestP = trick[0].player;
    let bestPow = -1;
    for (const t of trick) {
      const pow = cardPower(t.card, trump, lead);
      if (pow > bestPow) (bestPow = pow), (bestP = t.player);
    }
    return bestP;
  }, [trick, trump]);

  function dealerPickupAndDiscard(discardCard) {
    const d = dealer;
    const newHands = hands.map((h) => [...h]);

    newHands[d].push(upcard);
    const idx = newHands[d].findIndex((c) => c.r === discardCard.r && c.s === discardCard.s);
    if (idx >= 0) newHands[d].splice(idx, 1);

    setDeal({ hands: newHands, upcard });
    setPendingDealerPickup(false);

    const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
    setTurn(firstLead);
    setPhase("playing");
    setLogOpen(false);
    logBid(`${playerName(d)} picked up and discarded.`);

    setDeal((prev) => {
      const nh = prev.hands.map((h, i) => (i === 0 ? sortHandForTrump(h, trump) : h));
      return { ...prev, hands: nh };
    });
  }

 function finishTrickAndAdvance(winner, newHands, newTWTeam, newTWPlayer) {
  setPauseTrick(true);
  setTrickWinnerPreview(winner);

  setTimeout(() => {
    setTricksCompleted((prev) => {
      const completedNow = prev + 1;

      setPauseTrick(false);
      setTrickWinnerPreview(null);

      setTrick([]);
      setTurn(normalizeTurnMaybe(winner));
      setTricksWonTeam(newTWTeam);
      setTricksWonPlayer(newTWPlayer);

      if (completedNow === 5) {
        const newScore = [...score];
        const makerTricks = newTWTeam[makerTeam];
        const defTeam = makerTeam === 0 ? 1 : 0;

        if (alonePlayer !== null) {
          if (makerTricks === 5) newScore[makerTeam] += 4;
          else if (makerTricks >= 3) newScore[makerTeam] += 1;
          else newScore[defTeam] += 2;
        } else {
          if (makerTricks === 5) newScore[makerTeam] += 2;
          else if (makerTricks >= 3) newScore[makerTeam] += 1;
          else newScore[defTeam] += 2;
        }

        setScore(newScore);
        setPhase("hand_over");
      }

      return completedNow;
    });
  }, 850);
}

  function resolveTrickIfComplete(newTrick, newHands) {
    const targetCount = inactivePlayer === null ? 4 : 3;
    if (newTrick.length < targetCount) return;

    const lead = effectiveSuit(newTrick[0].card, trump);
    let bestIdx = 0;
    let bestPow = -1;
    for (let i = 0; i < newTrick.length; i++) {
      const pow = cardPower(newTrick[i].card, trump, lead);
      if (pow > bestPow) (bestPow = pow), (bestIdx = i);
    }
    const winner = newTrick[bestIdx].player;

    const newTWTeam = [...tricksWonTeam];
    newTWTeam[teamOf(winner)] += 1;

    const newTWPlayer = [...tricksWonPlayer];
    newTWPlayer[winner] += 1;

    finishTrickAndAdvance(winner, newHands, newTWTeam, newTWPlayer);
  }

  function playCard(playerIndex, card) {
    if (phase !== "playing") return;
    if (pauseTrick) return;
    if (playerIndex !== turn) return;
    if (inactivePlayer !== null && playerIndex === inactivePlayer) return;

    const hand = hands[playerIndex];
    const legal = legalCards(hand, trump, leadSuit);
    const isLegal = legal.some((c) => c.r === card.r && c.s === card.s);
    if (!isLegal) return;

    const newHands = hands.map((h, i) => (i === playerIndex ? h.filter((c) => !(c.r === card.r && c.s === card.s)) : h));
    const newTrick = [...trick, { player: playerIndex, card }];

    setDeal({ hands: newHands, upcard });
    setTrick(newTrick);

    const targetCount = inactivePlayer === null ? 4 : 3;
    if (newTrick.length < targetCount) {
      setTurn(nextTurnIndex(turn));
      return;
    }

    setTimeout(() => resolveTrickIfComplete(newTrick, newHands), 250);
  }

  /** ---------- Bidding ---------- **/
  function pass() {
    if (phase !== "bid1" && phase !== "bid2") return;
    logBid(`${playerName(turn)} passes.`);
    flashBadge(turn, "PASS");
setCooldown();
    const next = (turn + 1) % 4;
    const backToFirst = next === (dealer + 1) % 4;

    if (phase === "bid1") {
      if (backToFirst) {
        setPhase("bid2");
        setTurn((dealer + 1) % 4);
        logBid(`— Round 2: choose a suit (not ${upcard.s}) or pass. —`);
        return;
      }
      setTurn(next);
      return;
    }

    if (backToFirst) {
      setForcedDealerPick(true);
      setTurn(dealer);
      logBid(`— Screw the Dealer: ${playerName(dealer)} must choose trump. —`);
      return;
    }
    setTurn(next);
  }

  function orderUp(goAlone = false) {
    if (phase !== "bid1") return;
    const caller = turn;
    flashBadge(caller, goAlone ? "ALONE" : "ORDER");
setCooldown();
    const t = upcard.s;

    setTrump(t);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    setAlonePlayer(goAlone ? caller : null);

    logBid(`${playerName(caller)} orders up ${t}${goAlone ? " (ALONE)" : ""}. Trump is ${t}.`);

    // If maker goes alone and the dealer is the sitting-out partner,
// skip dealer pickup/discard entirely.
const partnerSeat = (typeof partnerOf === "function")
  ? partnerOf(caller)
  : (caller + 2) % 4;

const dealerIsSittingOut = goAlone && partnerSeat === dealer;

if (dealerIsSittingOut) {
  setPendingDealerPickup(false);
  setPhase("playing");
  setForcedDealerPick(false);
  setLogOpen(false);

  const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
  setTurn(firstLead);

  logBid(`Dealer (${playerName(dealer)}) sits out — skipping pickup/discard.`);
} else {
  setPendingDealerPickup(true);
  setPhase("dealer_discard");
  setTurn(dealer);
}

    setDeal((prev) => {
      const nh = prev.hands.map((h, i) => (i === 0 ? sortHandForTrump(h, t) : h));
      return { ...prev, hands: nh };
    });
  }

  function callSuit(suit, goAlone = false) {
    if (phase !== "bid2" && !forcedDealerPick) return;
    if (suit === upcard.s) return;

    const caller = turn;
    flashBadge(caller, goAlone ? "ALONE" : `CALL ${suit}`);
setCooldown();

    setTrump(suit);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    setAlonePlayer(goAlone ? caller : null);

    logBid(`${playerName(caller)} calls ${suit}${goAlone ? " (ALONE)" : ""}. Trump is ${suit}.`);

    setPhase("playing");
    setForcedDealerPick(false);
    setLogOpen(false);

    const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
    setTurn(firstLead);

    setDeal((prev) => {
      const nh = prev.hands.map((h, i) => (i === 0 ? sortHandForTrump(h, suit) : h));
      return { ...prev, hands: nh };
    });
  }

  /** ---------- Bots ---------- **/
  function botAct() {
    if (Date.now() < cooldownUntil) return;
    if (turn === 0) return;
    if (pauseTrick) return;

    if (inactivePlayer !== null && turn === inactivePlayer) {
      setTurn(nextTurnIndex(turn));
      return;
    }

    if (phase === "dealer_discard" && pendingDealerPickup && turn === dealer) {
      const t = upcard.s;
      const hand = hands[dealer];
      const tempHand = [...hand, upcard];

      let discard = tempHand[0];
      let worst = Infinity;
      for (const c of tempHand) {
        const val = cardPower(c, t, t);
        const eff = effectiveSuit(c, t);
        const dscore = eff === t ? val + 50 : val;
        if (dscore < worst) (worst = dscore), (discard = c);
      }

      const newHands = hands.map((h) => [...h]);
      newHands[dealer] = tempHand.filter((c) => !(c.r === discard.r && c.s === discard.s));
      setDeal({ hands: newHands, upcard });

      setPendingDealerPickup(false);
      setPhase("playing");
      setLogOpen(false);

      const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
      setTurn(firstLead);

      logBid(`${playerName(dealer)} picked up and discarded.`);
      return;
    }

    if (phase === "bid1") {
      const hand = hands[turn];
      const seatIsDealer = turn === dealer;
      const seatIsPartnerDealer = turn === (dealer + 2) % 4;

      if (shouldOrderUp(hand, upcard.s, seatIsDealer, seatIsPartnerDealer)) {
        const alone = shouldGoAlone_STRICT(hand, upcard.s, seatIsDealer, upcard, true);
        orderUp(alone);
      } else pass();
      return;
    }

    if (phase === "bid2") {
      const hand = hands[turn];
      const mustPick = forcedDealerPick && turn === dealer;
      const seatIsDealer = turn === dealer;

      const res = shouldCallSuitRound2(hand, upcard.s, mustPick);
      if (res.call) {
        const alone = shouldGoAlone_STRICT(hand, res.suit, seatIsDealer, upcard, false);
        callSuit(res.suit, alone);
      } else pass();
      return;
    }

   if (phase === "playing") {
  const hand = hands[turn];
  const c = choosePlayCardAI(hand, trump, trick, turn, inactivePlayer);
  playCard(turn, c);
}
  }

  useEffect(() => {
  if (phase !== "dealer_discard") return;
  if (!pendingDealerPickup) return;
  if (inactivePlayer === null) return;

  if (dealer === inactivePlayer) {
    // dealer is sitting out; no discard needed
    setPendingDealerPickup(false);
    setPhase("playing");
    setLogOpen(false);

    const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
    setTurn(firstLead);

    logBid(`Dealer (${playerName(dealer)}) sits out — pickup/discard skipped.`);
  }
}, [phase, pendingDealerPickup, inactivePlayer, dealer]);

  useEffect(() => {
    if (botTimer.current) clearInterval(botTimer.current);
    botTimer.current = setInterval(() => {
      if (phase === "idle" || phase === "hand_over") return;
      if (turn !== 0) botAct();
    }, 340);
    return () => clearInterval(botTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, hands, trick, trump, pendingDealerPickup, forcedDealerPick, inactivePlayer, pauseTrick]);

  /** ---------- UI derived ---------- **/
  const yourHand = hands[0] || [];
  const yourLegal = phase === "playing" ? legalCards(yourHand, trump, leadSuit) : yourHand;
  const yourLegalSet = useMemo(() => new Set(yourLegal.map(cardKey)), [yourLegal]);

  const dealerDiscardChoices = useMemo(() => {
    if (!(phase === "dealer_discard" && pendingDealerPickup && dealer === 0)) return null;
    return [...hands[0], upcard];
  }, [phase, pendingDealerPickup, dealer, hands, upcard]);

  const trickCard = (p) => trick.find((t) => t.player === p)?.card || null;

  const shouldShowUpcardInCenter =
    upcard && (phase === "bid1" || phase === "bid2" || (phase === "dealer_discard" && pendingDealerPickup));

  const statusLine = useMemo(() => {
    if (phase === "playing") {
      if (inactivePlayer === 0) return `${playerName(alonePlayer)} is going alone — you sit out this hand.`;
      if (turn === 0) return leadSuit ? `Follow suit if possible: ${leadSuit}` : "You lead. Tap a card to play.";
      return `Waiting for ${playerName(turn)}…`;
    }
    return "";
  }, [phase, inactivePlayer, alonePlayer, turn, leadSuit]);

  const dealerOfSeat = (i) => i === dealer;
  const makerOfSeat = (i) => maker !== null && i === maker;

  const emphasizedSeat = pauseTrick ? trickWinnerPreview : currentWinningPlayer;

  function trickDim(seat) {
    if (!trick.length) return false;
    if (emphasizedSeat === null || emphasizedSeat === undefined) return false;
    return emphasizedSeat !== seat;
  }

  return (
    <div className="screen">
      <div className="topHUD">
        <button className="iconBtn" onClick={() => setShowSettings(true)} type="button" title="Settings">
          ⚙️
        </button>

        <div className="scorePill">
          <span className="scoreLabel">{playerName(0)} & {playerName(2)}</span>
          <span className="scoreNum">{score[0]}</span>
          <span className="divider" />
          <span className="scoreLabel">{playerName(1)} & {playerName(3)}</span>
          <span className="scoreNum">{score[1]}</span>
        </div>

        <div className="smallInfo">
          <div>
            Trump: <b>{trump ?? "—"}</b>
          </div>
        </div>
      </div>

      <div className="tableGrid">
        {/* LEFT LANE */}
        <div className="lane leftLane">
          <div className="sideSeat">
            <div className="seatHeader vertical">
              <Stars filled={tricksWonPlayer[1]} className="vertical" />
              <div className="nameRow verticalText">
                <span className="seatName">{playerName(1)}</span>
                {seatBadge[1] && <span className="seatBadge">{seatBadge[1]}</span>}
                {dealerOfSeat(1) && <DealerChip />}
                {makerOfSeat(1) && <TrumpChip suit={trump} />}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER LANE */}
        <div className="lane centerLane">
          {/* TOP seat */}
          <div className="topSeat">
            <div className="seatHeader horizontal">
              <div className="nameRow">
                <span className="seatName">{playerName(2)}</span>
                {seatBadge[2] && <span className="seatBadge">{seatBadge[2]}</span>}
                {dealerOfSeat(2) && <DealerChip />}
                {makerOfSeat(2) && <TrumpChip suit={trump} />}
              </div>
              <Stars filled={tricksWonPlayer[2]} />
            </div>
          </div>

          {/* MID area */}
          <div className="midArea">
            <div className="midBox">
              <div className="miniTitle">Current Trick</div>
              <div className="trickLayout">
                <div className="spot topSpot">
                  {trickCard(2) ? (
                    <Card
                      c={trickCard(2)}
                      highlight={emphasizedSeat === 2}
                      dim={trickDim(2)}
                    />
                  ) : (
                    <div className="ghost2" />
                  )}
                </div>

                <div className="spot leftSpot">
                  {trickCard(1) ? (
                    <Card
                      c={trickCard(1)}
                      highlight={emphasizedSeat === 1}
                      dim={trickDim(1)}
                    />
                  ) : (
                    <div className="ghost2" />
                  )}
                </div>

                <div className="spot rightSpot">
                  {trickCard(3) ? (
                    <Card
                      c={trickCard(3)}
                      highlight={emphasizedSeat === 3}
                      dim={trickDim(3)}
                    />
                  ) : (
                    <div className="ghost2" />
                  )}
                </div>

                <div className="spot bottomSpot">
                  {trickCard(0) ? (
                    <Card
                      c={trickCard(0)}
                      highlight={emphasizedSeat === 0}
                      dim={trickDim(0)}
                    />
                  ) : (
                    <div className="ghost2" />
                  )}
                </div>

                {shouldShowUpcardInCenter && (
                  <div className="upcardInCenter">
                    <div className="miniTitle upTitle">Upcard</div>
                    <Card c={upcard} />
                  </div>
                )}
              </div>
            </div>

            {/* ACTION + LOG column */}
            <div className="hudColumn">
              <div className="actionBox">
                <div className="boxTitle">Action</div>

                {phase === "idle" && (
                  <button className="bigBtn" onClick={() => startNewHand(dealer)} type="button">
                    Start Game / Deal Hand
                  </button>
                )}

                {phase === "hand_over" && !gameOver && (
                  <button className="bigBtn" onClick={nextDealerAndHand} type="button">
                    Next Hand
                  </button>
                )}

                {gameOver && (
                  <button className="bigBtn" onClick={resetEverything} type="button">
                    New Game
                  </button>
                )}

                {(phase === "bid1" || phase === "bid2" || phase === "dealer_discard") && (
                  <div className="boxInner">
                    {phase === "bid1" && (
                      <>
                        <div className="boxLine">
                          Round 1: Order up <b>{upcard?.s}</b> or pass.
                        </div>
                        {turn === 0 ? (
                          <div className="row">
                            <button className="btnPrimary" onClick={() => orderUp(false)} type="button">
                              Order Up
                            </button>
                            <button className="btnPrimary" onClick={() => orderUp(true)} type="button">
                              Order Up (Alone)
                            </button>
                            <button className="btnGhost" onClick={pass} type="button">
                              Pass
                            </button>
                          </div>
                        ) : (
                          <div className="muted">Waiting for {playerName(turn)}…</div>
                        )}
                      </>
                    )}

                    {phase === "dealer_discard" && pendingDealerPickup && (
                      <>
                        <div className="boxLine">
                          Trump is <b>{trump}</b>. Dealer picks up then discards.
                        </div>
                        {dealer === 0 ? (
                          <>
                            <div className="muted">Tap a card to discard it.</div>
                            <div className="discardStrip">
                              {dealerDiscardChoices?.map((c) => (
                                <Card key={cardKey(c)} c={c} onClick={() => dealerPickupAndDiscard(c)} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="muted">Waiting for dealer…</div>
                        )}
                      </>
                    )}

                    {phase === "bid2" && (
                      <>
                        <div className="boxLine">
                          Round 2: Choose a suit (not <b>{upcard?.s}</b>) or pass.
                        </div>
                        {forcedDealerPick && <div className="warn">Screw the Dealer: dealer must choose.</div>}

                        {turn === 0 ? (
                          <>
                            <div className="row">
                              {SUITS.filter((s) => s !== upcard?.s).map((s) => (
                                <button key={s} className="btnPrimary" onClick={() => callSuit(s, false)} type="button">
                                  Call {s}
                                </button>
                              ))}
                            </div>
                            <div className="row">
                              {SUITS.filter((s) => s !== upcard?.s).map((s) => (
                                <button key={`a-${s}`} className="btnPrimary" onClick={() => callSuit(s, true)} type="button">
                                  Call {s} (Alone)
                                </button>
                              ))}
                            </div>
                            {!forcedDealerPick && (
                              <button className="btnGhost" onClick={pass} type="button">
                                Pass
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="muted">Waiting for {playerName(turn)}…</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="logHeaderRow">
                <div className="boxTitle">Bidding Log</div>
                <button className="tinyBtn" type="button" onClick={() => setLogOpen((x) => !x)}>
                  {logOpen ? "Hide" : "Show"}
                </button>
              </div>

              {logOpen && (
                <div className="logBox">
                  <div className="logBody">
                    {bidLog.length ? bidLog.slice(-10).map((x, i) => <div key={i}>{x}</div>) : <div className="muted">—</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM seat */}
          <div className="bottomSeat">
            <div className="seatHeader horizontal">
              <div className="nameRow">
                <span className="seatName">{playerName(0)}</span>
                {seatBadge[0] && <span className="seatBadge">{seatBadge[0]}</span>}
                {dealerOfSeat(0) && <DealerChip />}
                {makerOfSeat(0) && <TrumpChip suit={trump} />}
              </div>
              <Stars filled={tricksWonPlayer[0]} />
            </div>

            <div className="handStrip">
              {yourHand.map((c) => {
                const legal = yourLegalSet.has(cardKey(c));
                const disabled =
                  phase !== "playing" ||
                  pauseTrick ||
                  turn !== 0 ||
                  !legal ||
                  gameOver ||
                  (inactivePlayer !== null && inactivePlayer === 0);

                return <Card key={cardKey(c)} c={c} disabled={disabled} onClick={() => playCard(0, c)} />;
              })}
            </div>

            <div className="hintLine">{statusLine}</div>
          </div>
        </div>

        {/* RIGHT LANE */}
        <div className="lane rightLane">
          <div className="sideSeat">
            <div className="seatHeader vertical">
              <Stars filled={tricksWonPlayer[3]} className="vertical" />
              <div className="nameRow verticalText">
                <span className="seatName">{playerName(3)}</span>
                {seatBadge[3] && <span className="seatBadge">{seatBadge[3]}</span>}
                {dealerOfSeat(3) && <DealerChip />}
                {makerOfSeat(3) && <TrumpChip suit={trump} />}
              </div>
            </div>
          </div>
        </div>
      </div>
      
{winningTeam() !== null && (
  <div className="modalBackdrop">
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="winTitle">
        {winningTeam() === 0
          ? `${playerName(0)} and ${playerName(2)} win!!`
          : `${playerName(1)} and ${playerName(3)} win!!`}
      </div>
      <div className="winScore">
        Final Score: <b>{score[0]}</b> – <b>{score[1]}</b>
      </div>
      <div className="modalBtns">
        <button className="btnPrimary" onClick={resetEverything} type="button">
          New Game
        </button>
      </div>
    </div>
  </div>
)}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modalBackdrop" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">Settings</div>

            <div className="sectionTitle">Player Names</div>

            <div className="field">
              <label>You (bottom)</label>
              <input value={names.p0} onChange={(e) => setNames((n) => ({ ...n, p0: e.target.value }))} />
            </div>
            <div className="field">
              <label>Left</label>
              <input value={names.p1} onChange={(e) => setNames((n) => ({ ...n, p1: e.target.value }))} />
            </div>
            <div className="field">
              <label>Partner (top)</label>
              <input value={names.p2} onChange={(e) => setNames((n) => ({ ...n, p2: e.target.value }))} />
            </div>
            <div className="field">
              <label>Right</label>
              <input value={names.p3} onChange={(e) => setNames((n) => ({ ...n, p3: e.target.value }))} />
            </div>

            <div className="modalBtns">
              <button className="btnPrimary" onClick={() => setShowSettings(false)} type="button">
                Done
              </button>
              <button className="btnGhost" onClick={resetEverything} type="button">
                Restart Game (Reset All)
              </button>
            </div>

            <div className="smallPrint">
              Dealer has a “D” chip. Caller shows a trump suit chip. Stars track each player’s own trick wins (not partner),
              and reset every hand.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
