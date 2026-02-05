import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * EUCHRE — Mobile-first table UI + bidding + screw-the-dealer + going alone
 * Fixes in this version:
 * 1) Loner partner sits out: turn rotation + UI prompts skip inactive seat (no stuck game)
 * 2) Log option A: auto-collapses after bidding; toggle button to open/close
 * 3) Settings includes "Restart Game" (full reset)
 * 4) Layout lanes: center cannot overlap side stacks
 * 5) Upcard shown in center during bidding, disappears after pickup or bidding ends
 * 6) Much stricter AI loner rules (rare, needs very strong hand)
 */

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

function cardKey(c) {
  return `${c.r}${c.s}`;
}

function legalCards(hand, trump, leadSuit) {
  if (!leadSuit) return hand;
  const follows = hand.filter((c) => effectiveSuit(c, trump) === leadSuit);
  return follows.length ? follows : hand;
}

/** ---------- AI (public info only) ---------- **/

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
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return { suit: best, score: bestScore };
}

function shouldOrderUp(hand, upcardSuit, seatIsDealer, seatIsPartnerDealer) {
  const sc = handStrengthForTrump(hand, upcardSuit);
  const threshold = seatIsDealer ? 7.9 : seatIsPartnerDealer ? 7.2 : 7.7;
  return sc >= threshold;
}

function shouldCallSuitRound2(hand, forbiddenSuit, mustPick) {
  const { suit, score } = bestSuitChoice(hand, forbiddenSuit);
  if (mustPick) return { call: true, suit, score };
  return { call: score >= 7.55, suit, score };
}

/**
 * Stricter loner heuristic (rare):
 * Needs high chance at 4+ tricks.
 * Rules (typical in real play):
 * - Almost always requires Right Bower
 * - Wants 3 trump+ OR (RB+LB+2 trump) OR (RB+2 trump + strong protected side Ace)
 * - Also needs at least one side "winner" candidate (Ace) unless trump is 4+
 */
function shouldGoAlone_STRICT(hand, trump, seatIsDealer) {
  const sc = handStrengthForTrump(hand, trump);
  const hasRB = hand.some((c) => isRightBower(c, trump));
  if (!hasRB) return false;

  const hasLB = hand.some((c) => isLeftBower(c, trump));
  const trumpCards = hand.filter((c) => effectiveSuit(c, trump) === trump);
  const trumpCount = trumpCards.length;

  const sideAces = hand.filter((c) => c.r === "A" && effectiveSuit(c, trump) !== trump).length;

  // Very conservative thresholds so loners are uncommon:
  const baseThreshold = seatIsDealer ? 12.2 : 13.0;
  if (sc < baseThreshold) return false;

  if (trumpCount >= 4) return true;
  if (trumpCount >= 3 && (hasLB || sideAces >= 1)) return true;
  if (trumpCount >= 2 && hasLB && sideAces >= 1) return true;

  return false;
}

function choosePlayCardAI(hand, trump, trick) {
  const leadSuit = trick.length ? effectiveSuit(trick[0].card, trump) : null;
  const legal = legalCards(hand, trump, leadSuit);

  if (!leadSuit) {
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

    let pick = legal[0];
    let best = Infinity;
    for (const c of legal) {
      const p = cardPower(c, trump, effectiveSuit(c, trump));
      if (p < best) (best = p), (pick = c);
    }
    return pick;
  }

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

/** ---------- UI components ---------- **/

function Card({ c, onClick, disabled, faceDown }) {
  if (faceDown) return <div className="card facedown" />;
  const red = isRedSuit(c.s);
  return (
    <button
      className={`card ${red ? "red" : "black"} ${disabled ? "disabled" : ""}`}
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

function NamePill({ name }) {
  return <div className="namePill">{name}</div>;
}

/** ---------- Main App ---------- **/

export default function App() {
  const teamOf = (p) => p % 2;

  const [names, setNames] = useState({
    p0: "Me",
    p1: "Michael",
    p2: "Jerry",
    p3: "Barbara",
  });
  const [showSettings, setShowSettings] = useState(false);

  const [phase, setPhase] = useState("idle");
  // idle, bid1, dealer_discard, bid2, playing, hand_over

  const [{ hands, upcard }, setDeal] = useState(() => ({ hands: [[], [], [], []], upcard: null }));

  const [dealer, setDealer] = useState(3);
  const [turn, setTurn] = useState(0);

  const [trump, setTrump] = useState(null);
  const [maker, setMaker] = useState(null);
  const [makerTeam, setMakerTeam] = useState(null);

  const [alonePlayer, setAlonePlayer] = useState(null);
  const inactivePlayer = useMemo(() => (alonePlayer === null ? null : (alonePlayer + 2) % 4), [alonePlayer]);

  const [trick, setTrick] = useState([]);
  const [tricksWon, setTricksWon] = useState([0, 0]);
  const [score, setScore] = useState([0, 0]);

  const [bidLog, setBidLog] = useState([]);
  const [logOpen, setLogOpen] = useState(true); // opens during bidding; collapses after
  const [pendingDealerPickup, setPendingDealerPickup] = useState(false);
  const [forcedDealerPick, setForcedDealerPick] = useState(false);

  const botTimer = useRef(null);

  const playerName = (i) => (i === 0 ? names.p0 : i === 1 ? names.p1 : i === 2 ? names.p2 : names.p3);

  const leadSuit = useMemo(() => {
    if (!trick.length || !trump) return null;
    return effectiveSuit(trick[0].card, trump);
  }, [trick, trump]);

  const gameOver = score[0] >= 10 || score[1] >= 10;
  const winnerTeam = score[0] >= 10 ? 0 : score[1] >= 10 ? 1 : null;

  function logBid(msg) {
    setBidLog((l) => [...l, msg]);
  }

  function resetEverything() {
    setScore([0, 0]);
    setDealer(3);
    setPhase("idle");
    setDeal({ hands: [[], [], [], []], upcard: null });
    setTrump(null);
    setMaker(null);
    setMakerTeam(null);
    setAlonePlayer(null);
    setBidLog([]);
    setTrick([]);
    setTricksWon([0, 0]);
    setPendingDealerPickup(false);
    setForcedDealerPick(false);
    setLogOpen(true);
    setTurn(0);
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
    setTricksWon([0, 0]);

    setPendingDealerPickup(false);
    setForcedDealerPick(false);

    const first = (newDealer + 1) % 4;
    setTurn(first);
    setPhase("bid1");
    setLogOpen(true); // open during bidding

    logBid(`— New hand. Upcard is ${dealt.upcard.r}${dealt.upcard.s}. —`);
  }

  function nextDealerAndHand() {
    const nd = (dealer + 1) % 4;
    setDealer(nd);
    setTimeout(() => startNewHand(nd), 150);
  }

  /** Turn rotation that skips inactive player when someone is alone */
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
    // If loner state changes while it's inactive player's turn, immediately skip to next
    setTurn((t) => normalizeTurnMaybe(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inactivePlayer]);

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
    setLogOpen(false); // collapse log after bidding completes
    logBid(`${playerName(d)} picked up and discarded.`);
  }

  function resolveTrickIfComplete(newTrick, newHands) {
    // In a loner, trick size is 3; otherwise 4
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

    const newTW = [...tricksWon];
    newTW[teamOf(winner)] += 1;
    setTricksWon(newTW);

    setTrick([]);
    setTurn(normalizeTurnMaybe(winner));

    const tricksPlayed = 5 - newHands[0].length;
    if (tricksPlayed === 5) {
      const newScore = [...score];
      const makerTricks = newTW[makerTeam];
      const defTeam = makerTeam === 0 ? 1 : 0;

      if (alonePlayer !== null) {
        // Your loner scoring
        if (makerTricks === 5) newScore[makerTeam] += 4;
        else if (makerTricks >= 3) newScore[makerTeam] += 1;
        else newScore[defTeam] += 2;
      } else {
        // Normal scoring
        if (makerTricks === 5) newScore[makerTeam] += 2;
        else if (makerTricks >= 3) newScore[makerTeam] += 1;
        else newScore[defTeam] += 2;
      }

      setScore(newScore);
      setPhase("hand_over");
    }
  }

  function playCard(playerIndex, card) {
    if (phase !== "playing") return;
    if (playerIndex !== turn) return;
    if (inactivePlayer !== null && playerIndex === inactivePlayer) return;

    const hand = hands[playerIndex];
    const legal = legalCards(hand, trump, leadSuit);
    const isLegal = legal.some((c) => c.r === card.r && c.s === card.s);
    if (!isLegal) return;

    const newHands = hands.map((h, i) =>
      i === playerIndex ? h.filter((c) => !(c.r === card.r && c.s === card.s)) : h
    );

    const newTrick = [...trick, { player: playerIndex, card }];
    setDeal({ hands: newHands, upcard });
    setTrick(newTrick);

    const targetCount = inactivePlayer === null ? 4 : 3;
    if (newTrick.length < targetCount) {
      setTurn(nextTurnIndex(turn));
      return;
    }

    setTimeout(() => resolveTrickIfComplete(newTrick, newHands), 220);
  }

  /** ---------- Bidding ---------- **/

  function pass() {
    if (phase !== "bid1" && phase !== "bid2") return;
    logBid(`${playerName(turn)} passes.`);
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
    const t = upcard.s;

    setTrump(t);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    setAlonePlayer(goAlone ? caller : null);

    logBid(`${playerName(caller)} orders up ${t}${goAlone ? " (ALONE)" : ""}. Trump is ${t}.`);

    setPendingDealerPickup(true);
    setPhase("dealer_discard");
    setTurn(dealer);
  }

  function callSuit(suit, goAlone = false) {
    if (phase !== "bid2" && !forcedDealerPick) return;
    if (suit === upcard.s) return;

    const caller = turn;
    setTrump(suit);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    setAlonePlayer(goAlone ? caller : null);

    logBid(`${playerName(caller)} calls ${suit}${goAlone ? " (ALONE)" : ""}. Trump is ${suit}.`);

    // bidding ends here; upcard disappears now
    setPhase("playing");
    setForcedDealerPick(false);
    setLogOpen(false);

    const firstLead = normalizeTurnMaybe((dealer + 1) % 4);
    setTurn(firstLead);
  }

  /** ---------- Bots ---------- **/

  function botAct() {
    if (turn === 0) return;

    // If it ever lands on inactive seat, skip immediately (prevents stuck)
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
        const alone = shouldGoAlone_STRICT(hand, upcard.s, seatIsDealer);
        orderUp(alone);
      } else {
        pass();
      }
      return;
    }

    if (phase === "bid2") {
      const hand = hands[turn];
      const mustPick = forcedDealerPick && turn === dealer;
      const seatIsDealer = turn === dealer;

      const res = shouldCallSuitRound2(hand, upcard.s, mustPick);
      if (res.call) {
        const alone = shouldGoAlone_STRICT(hand, res.suit, seatIsDealer);
        callSuit(res.suit, alone);
      } else {
        pass();
      }
      return;
    }

    if (phase === "playing") {
      const hand = hands[turn];
      const c = choosePlayCardAI(hand, trump, trick);
      playCard(turn, c);
    }
  }

  useEffect(() => {
    if (botTimer.current) clearInterval(botTimer.current);
    botTimer.current = setInterval(() => {
      if (phase === "idle" || phase === "hand_over") return;
      if (turn !== 0) botAct();
    }, 320);
    return () => clearInterval(botTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, hands, trick, trump, pendingDealerPickup, forcedDealerPick, inactivePlayer]);

  /** ---------- UI helpers ---------- **/

  const yourHand = hands[0] || [];
  const yourLegal = phase === "playing" ? legalCards(yourHand, trump, leadSuit) : yourHand;
  const yourLegalSet = useMemo(() => new Set(yourLegal.map(cardKey)), [yourLegal]);

  const dealerDiscardChoices = useMemo(() => {
    if (!(phase === "dealer_discard" && pendingDealerPickup && dealer === 0)) return null;
    return [...hands[0], upcard];
  }, [phase, pendingDealerPickup, dealer, hands, upcard]);

  const trickCard = (p) => trick.find((t) => t.player === p)?.card || null;

  const shouldShowUpcardInCenter =
    upcard &&
    (phase === "bid1" || phase === "bid2" || (phase === "dealer_discard" && pendingDealerPickup));

  const statusLine = useMemo(() => {
    if (phase === "playing") {
      if (inactivePlayer === 0) return `${playerName(alonePlayer)} is going alone — you sit out this hand.`;
      if (turn === 0) return leadSuit ? `Follow suit if possible: ${leadSuit}` : "You lead. Tap a card to play.";
      return `Waiting for ${playerName(turn)}…`;
    }
    return "";
  }, [phase, inactivePlayer, alonePlayer, playerName, turn, leadSuit]);

  return (
    <div className="screen">
      <div className="topHUD">
        <button className="iconBtn" onClick={() => setShowSettings(true)} type="button" title="Settings">
          ⚙️
        </button>

        <div className="scorePill">
          <span className="scoreLabel">US</span>
          <span className="scoreNum">{score[0]}</span>
          <span className="divider" />
          <span className="scoreLabel">THEM</span>
          <span className="scoreNum">{score[1]}</span>
        </div>

        <div className="smallInfo">
          <div>
            Dealer: <b>{playerName(dealer)}</b>
          </div>
          <div>
            Trump: <b>{trump ?? "—"}</b>
          </div>
        </div>
      </div>

      <div className="tableGrid">
        {/* LEFT LANE */}
        <div className="lane leftLane">
          <div className="verticalName">{playerName(1)}</div>
          <div className="sideBacks">
            {Array.from({ length: hands[1]?.length ?? 0 }).map((_, i) => (
              <Card key={i} faceDown />
            ))}
          </div>
        </div>

        {/* CENTER LANE */}
        <div className="lane centerLane">
          <div className="topArea">
            <NamePill name={playerName(2)} />
            <div className="backRow">
              {Array.from({ length: hands[2]?.length ?? 0 }).map((_, i) => (
                <Card key={i} faceDown />
              ))}
            </div>
          </div>

          <div className="midArea">
            <div className="midBox">
              <div className="miniTitle">Current Trick</div>
              <div className="trickLayout">
                <div className="spot topSpot">{trickCard(2) ? <Card c={trickCard(2)} /> : <div className="ghost2" />}</div>
                <div className="spot leftSpot">{trickCard(1) ? <Card c={trickCard(1)} /> : <div className="ghost2" />}</div>
                <div className="spot rightSpot">{trickCard(3) ? <Card c={trickCard(3)} /> : <div className="ghost2" />}</div>
                <div className="spot bottomSpot">{trickCard(0) ? <Card c={trickCard(0)} /> : <div className="ghost2" />}</div>

                {shouldShowUpcardInCenter && (
                  <div className="upcardInCenter">
                    <div className="miniTitle upTitle">Upcard</div>
                    <Card c={upcard} />
                  </div>
                )}
              </div>
            </div>

            {/* Action + Log (does not cover board) */}
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
                                <button
                                  key={`a-${s}`}
                                  className="btnPrimary"
                                  onClick={() => callSuit(s, true)}
                                  type="button"
                                >
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

          <div className="bottomArea">
            <NamePill name={playerName(0)} />
            <div className="handStrip" aria-label="Your hand">
              {yourHand.map((c) => {
                const legal = yourLegalSet.has(cardKey(c));
                const disabled =
                  phase !== "playing" ||
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
          <div className="verticalName">{playerName(3)}</div>
          <div className="sideBacks">
            {Array.from({ length: hands[3]?.length ?? 0 }).map((_, i) => (
              <Card key={i} faceDown />
            ))}
          </div>
        </div>
      </div>

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
              Loner rules: partner sits out (3-card tricks). AI loners are intentionally rare and require very strong hands
              (Right Bower + strong trump control + likely winners).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
