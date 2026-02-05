import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * EUCHRE — Playable browser app (minimal but complete)
 * - 2-round bidding with Screw the Dealer
 * - dealer pickup + discard when ordered up
 * - legal play enforcement (effective suit for bowers)
 * - competent heuristic AI for bidding + play
 * - card-shaped UI
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
  // Higher is better. Returns 0 if cannot win (off-suit non-trump).
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

/** ---------- Euchre heuristics (bidding + play) ---------- **/

function handStrengthForTrump(hand, trump) {
  // heuristic score
  let score = 0;
  for (const c of hand) {
    if (isRightBower(c, trump)) score += 9;
    else if (isLeftBower(c, trump)) score += 7;
    else if (effectiveSuit(c, trump) === trump) {
      // trump card
      score += 2 + (rankOrder[c.r] ?? 0) * 0.3;
    } else {
      // side aces are valuable
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
  // Order-up threshold tuned to feel “competent”
  // Dealer/partner-dealer can order a bit lighter since dealer will gain a trump.
  const sc = handStrengthForTrump(hand, upcardSuit);
  const threshold = seatIsDealer ? 8.0 : seatIsPartnerDealer ? 7.3 : 7.8;
  return sc >= threshold;
}

function shouldCallSuitRound2(hand, forbiddenSuit, mustPick) {
  const { suit, score } = bestSuitChoice(hand, forbiddenSuit);
  // Call threshold
  if (mustPick) return { call: true, suit };
  return { call: score >= 7.6, suit };
}

function legalCards(hand, trump, leadSuit) {
  if (!leadSuit) return hand;
  const follows = hand.filter((c) => effectiveSuit(c, trump) === leadSuit);
  return follows.length ? follows : hand;
}

function choosePlayCardAI(hand, trump, trick, playerIndex) {
  const leadSuit = trick.length ? effectiveSuit(trick[0].card, trump) : null;
  const legal = legalCards(hand, trump, leadSuit);

  // If leading: lead strongest non-trump ace if no great trump, else lead strong trump
  if (!leadSuit) {
    const trumpCards = legal.filter((c) => effectiveSuit(c, trump) === trump);
    const hasTopTrump =
      trumpCards.some((c) => isRightBower(c, trump) || isLeftBower(c, trump) || c.r === "A");

    if (hasTopTrump && trumpCards.length) {
      // lead highest trump
      let best = trumpCards[0];
      let bestP = -1;
      for (const c of trumpCards) {
        const p = cardPower(c, trump, trump);
        if (p > bestP) (bestP = p), (best = c);
      }
      return best;
    }

    // lead a side ace if possible
    const sideAces = legal.filter((c) => c.r === "A" && effectiveSuit(c, trump) !== trump);
    if (sideAces.length) return sideAces[0];

    // otherwise lead lowest legal
    let pick = legal[0];
    let best = Infinity;
    for (const c of legal) {
      const p = cardPower(c, trump, effectiveSuit(c, trump));
      if (p < best) (best = p), (pick = c);
    }
    return pick;
  }

  // Not leading: try to win cheaply if possible, else dump lowest
  const lead = leadSuit;
  const currentWinning = (() => {
    let bestIdx = 0;
    let bestPow = -1;
    for (let i = 0; i < trick.length; i++) {
      const pow = cardPower(trick[i].card, trump, lead);
      if (pow > bestPow) (bestPow = pow), (bestIdx = i);
    }
    return { pow: bestPow, card: trick[bestIdx].card };
  })();

  // Find cheapest card that wins
  let winningCandidates = [];
  for (const c of legal) {
    const pow = cardPower(c, trump, lead);
    if (pow > currentWinning.pow) winningCandidates.push({ c, pow });
  }
  if (winningCandidates.length) {
    // choose the one with minimum pow that still wins
    winningCandidates.sort((a, b) => a.pow - b.pow);
    return winningCandidates[0].c;
  }

  // Can't win: dump lowest power card (prefer shedding non-trump)
  let pick = legal[0];
  let best = Infinity;
  for (const c of legal) {
    const pow = cardPower(c, trump, lead);
    // Treat off-suit non-trump as ultra-low to dump
    const eff = effectiveSuit(c, trump);
    const dumpScore = eff === trump ? pow + 50 : pow;
    if (dumpScore < best) (best = dumpScore), (pick = c);
  }
  return pick;
}

/** ---------- UI Components ---------- **/

function Card({ c, onClick, disabled, small, faceDown, selected }) {
  if (faceDown) {
    return (
      <div
        className={`card ${small ? "small" : ""} facedown`}
        aria-label="Face down"
        title="Face down"
      />
    );
  }
  const red = isRedSuit(c.s);
  return (
    <button
      className={`card ${small ? "small" : ""} ${red ? "red" : "black"} ${
        disabled ? "disabled" : ""
      } ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={`${c.r} of ${SUIT_NAMES[c.s]}`}
      type="button"
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

/** ---------- Main App ---------- **/

export default function App() {
  // players: 0 you, 1 left, 2 partner, 3 right
  const teamOf = (p) => (p % 2); // 0: (0,2) 1: (1,3)

  const [phase, setPhase] = useState("idle");
  // phases: idle, dealt, bid1, dealer_discard, bid2, playing, hand_over

  const [{ hands, upcard }, setDeal] = useState(() => ({ hands: [[], [], [], []], upcard: null }));

  const [dealer, setDealer] = useState(0);
  const [turn, setTurn] = useState(0);

  const [trump, setTrump] = useState(null);
  const [maker, setMaker] = useState(null); // player index who called trump
  const [makerTeam, setMakerTeam] = useState(null);
  const [bidLog, setBidLog] = useState([]);

  const [trick, setTrick] = useState([]); // {player, card}
  const [tricksWon, setTricksWon] = useState([0, 0]);
  const [score, setScore] = useState([0, 0]);

  const [pendingDealerPickup, setPendingDealerPickup] = useState(false);
  const [forcedDealerPick, setForcedDealerPick] = useState(false);

  const botTimer = useRef(null);

  const leader = useMemo(() => {
    if (!trick.length) return turn; // current turn is leader at trick start
    return trick[0].player;
  }, [trick, turn]);

  const leadSuit = useMemo(() => {
    if (!trick.length || !trump) return null;
    return effectiveSuit(trick[0].card, trump);
  }, [trick, trump]);

  function startNewHand() {
    const dealt = dealHand();
    setDeal(dealt);
    setTrump(null);
    setMaker(null);
    setMakerTeam(null);
    setBidLog([]);
    setTrick([]);
    setTricksWon([0, 0]);
    setPendingDealerPickup(false);
    setForcedDealerPick(false);

    // turn starts left of dealer for bidding
    const first = (dealer + 1) % 4;
    setTurn(first);
    setPhase("bid1");
  }

  function nextDealerAndHand() {
    const newDealer = (dealer + 1) % 4;
    setDealer(newDealer);
    // next hand begins
    setTimeout(() => {
      // set dealer first, then deal
      // (state updates async; this is fine for our purposes)
      startNewHand();
    }, 250);
  }

  function logBid(msg) {
    setBidLog((l) => [...l, msg]);
  }

  function playerName(i) {
    if (i === 0) return "You";
    if (i === 1) return "P1";
    if (i === 2) return "Partner";
    return "P3";
  }

  // Dealer pickup/discard helper
  function dealerPickupAndDiscard(discardCard) {
    const d = dealer;
    const newHands = hands.map((h) => [...h]);
    // add upcard
    newHands[d].push(upcard);
    // remove chosen discard
    const idx = newHands[d].findIndex((c) => c.r === discardCard.r && c.s === discardCard.s);
    if (idx >= 0) newHands[d].splice(idx, 1);
    setDeal({ hands: newHands, upcard });
    setPendingDealerPickup(false);
    // Start play: leader is left of dealer
    const firstLead = (dealer + 1) % 4;
    setTurn(firstLead);
    setPhase("playing");
    logBid(`${playerName(d)} picked up and discarded.`);
  }

  function resolveTrickIfComplete(newTrick, newHands) {
    if (newTrick.length < 4) return;

    const lead = effectiveSuit(newTrick[0].card, trump);
    let bestIdx = 0;
    let bestPow = -1;
    for (let i = 0; i < 4; i++) {
      const pow = cardPower(newTrick[i].card, trump, lead);
      if (pow > bestPow) {
        bestPow = pow;
        bestIdx = i;
      }
    }
    const winner = newTrick[bestIdx].player;

    const newTW = [...tricksWon];
    newTW[teamOf(winner)] += 1;
    setTricksWon(newTW);

    setTrick([]);
    setTurn(winner);

    // after 5 tricks, score hand
    const tricksPlayed = 5 - newHands[0].length; // everyone same length
    if (tricksPlayed === 5) {
      const newScore = [...score];
      const makerTricks = newTW[makerTeam];
      const defTeam = makerTeam === 0 ? 1 : 0;

      if (makerTricks === 5) newScore[makerTeam] += 2;
      else if (makerTricks >= 3) newScore[makerTeam] += 1;
      else newScore[defTeam] += 2; // euchred

      setScore(newScore);
      setPhase("hand_over");

      // auto-next if game not over
      const gameOver = newScore[0] >= 10 || newScore[1] >= 10;
      if (!gameOver) {
        setTimeout(() => {
          nextDealerAndHand();
        }, 900);
      }
    }
  }

  function playCard(playerIndex, card) {
    if (phase !== "playing") return;
    if (playerIndex !== turn) return;

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

    if (newTrick.length < 4) {
      setTurn((turn + 1) % 4);
      return;
    }
    // resolve trick
    setTimeout(() => resolveTrickIfComplete(newTrick, newHands), 250);
  }

  /** ---------- Bidding actions ---------- **/

  function pass() {
    if (phase !== "bid1" && phase !== "bid2") return;
    logBid(`${playerName(turn)} passes.`);
    const next = (turn + 1) % 4;

    // if we just passed and we looped around:
    const backToFirst = next === (dealer + 1) % 4;

    if (phase === "bid1") {
      // after 4 passes -> round2
      if (backToFirst) {
        setPhase("bid2");
        setTurn((dealer + 1) % 4);
        logBid(`— Round 2: choose a different suit (cannot be ${upcard.s}). —`);
        return;
      }
      setTurn(next);
      return;
    }

    // phase bid2
    if (backToFirst) {
      // everyone passed again -> screw the dealer: dealer must choose
      setForcedDealerPick(true);
      setTurn(dealer);
      logBid(`— Screw the Dealer: ${playerName(dealer)} must choose trump. —`);
      return;
    }

    setTurn(next);
  }

  function orderUp() {
    // Round 1: set trump to upcard suit; maker is turn
    if (phase !== "bid1") return;

    const caller = turn;
    const t = upcard.s;
    setTrump(t);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    logBid(`${playerName(caller)} orders up ${t}. Trump is ${t}.`);

    // if dealer is ordered up, they must pick up and discard (human if dealer=0)
    setPendingDealerPickup(true);
    setPhase("dealer_discard");
    setTurn(dealer);
  }

  function callSuit(suit) {
    // Round 2: choose suit != upcard.s
    if (phase !== "bid2" && !forcedDealerPick) return;
    if (suit === upcard.s) return;

    const caller = turn;
    setTrump(suit);
    setMaker(caller);
    setMakerTeam(teamOf(caller));
    logBid(`${playerName(caller)} calls ${suit}. Trump is ${suit}.`);

    // start play, leader left of dealer
    const firstLead = (dealer + 1) % 4;
    setTurn(firstLead);
    setPhase("playing");
    setForcedDealerPick(false);
  }

  /** ---------- Bot logic driver ---------- **/

  function botAct() {
    if (turn === 0) return; // your move

    // dealer discard step
    if (phase === "dealer_discard" && pendingDealerPickup && turn === dealer) {
      // simple discard: throw lowest value for trump (upcard suit)
      const t = upcard.s;
      const hand = hands[dealer];
      // dealer will have 5 cards currently; upcard not yet added in our data model for discard UI.
      // For bots, simulate pick up then discard:
      const tempHand = [...hand, upcard];
      let pick = tempHand[0];
      let worst = Infinity;
      for (const c of tempHand) {
        const val = cardPower(c, t, t); // value under trump
        // prefer discarding non-trump junk
        const eff = effectiveSuit(c, t);
        const dscore = eff === t ? val + 50 : val;
        if (dscore < worst) (worst = dscore), (pick = c);
      }
      // apply pickup + discard
      const newHands = hands.map((h) => [...h]);
      newHands[dealer] = tempHand.filter((c) => !(c.r === pick.r && c.s === pick.s));
      setDeal({ hands: newHands, upcard });
      setPendingDealerPickup(false);
      setPhase("playing");
      const firstLead = (dealer + 1) % 4;
      setTurn(firstLead);
      logBid(`${playerName(dealer)} picked up and discarded.`);
      return;
    }

    // bidding
    if (phase === "bid1") {
      const hand = hands[turn];
      const seatIsDealer = turn === dealer;
      const seatIsPartnerDealer = turn === (dealer + 2) % 4;

      if (shouldOrderUp(hand, upcard.s, seatIsDealer, seatIsPartnerDealer)) {
        orderUp();
      } else {
        pass();
      }
      return;
    }

    if (phase === "bid2") {
      const hand = hands[turn];
      const mustPick = forcedDealerPick && turn === dealer;
      const res = shouldCallSuitRound2(hand, upcard.s, mustPick);
      if (res.call) callSuit(res.suit);
      else pass();
      return;
    }

    // playing
    if (phase === "playing") {
      const hand = hands[turn];
      const c = choosePlayCardAI(hand, trump, trick, turn);
      playCard(turn, c);
    }
  }

  // Bot ticking
  useEffect(() => {
    if (botTimer.current) clearInterval(botTimer.current);
    botTimer.current = setInterval(() => {
      // bots only act in active phases
      if (phase === "idle" || phase === "hand_over") return;
      if (turn !== 0) botAct();
    }, 350);
    return () => clearInterval(botTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, hands, trick, trump, pendingDealerPickup, forcedDealerPick]);

  /** ---------- UI data ---------- **/

  const gameOver = score[0] >= 10 || score[1] >= 10;
  const winnerTeam = score[0] >= 10 ? 0 : score[1] >= 10 ? 1 : null;

  const yourHand = hands[0] || [];
  const yourLegal = phase === "playing" ? legalCards(yourHand, trump, leadSuit) : yourHand;
  const yourLegalSet = useMemo(() => new Set(yourLegal.map(cardKey)), [yourLegal]);

  const dealerHandForDiscardUI = useMemo(() => {
    if (!(phase === "dealer_discard" && pendingDealerPickup && dealer === 0)) return null;
    // show your 5 + upcard, then you click which to discard
    return [...hands[0], upcard];
  }, [phase, pendingDealerPickup, dealer, hands, upcard]);

  /** ---------- Render ---------- **/

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="title">Euchre</div>
        <div className="subtitle">No Ads • Browser App</div>
      </header>

      <div className="hud">
        <div className="hudBox">
          <div className="hudRow"><span className="label">Dealer</span><span className="val">{playerName(dealer)}</span></div>
          <div className="hudRow"><span className="label">Turn</span><span className="val">{playerName(turn)}</span></div>
          <div className="hudRow"><span className="label">Upcard</span><span className="val">{upcard ? `${upcard.r}${upcard.s}` : "—"}</span></div>
          <div className="hudRow"><span className="label">Trump</span><span className="val">{trump ? trump : "—"}</span></div>
          <div className="hudRow"><span className="label">Lead Suit</span><span className="val">{leadSuit ? leadSuit : "—"}</span></div>
        </div>

        <div className="hudBox">
          <div className="hudTitle">Tricks (this hand)</div>
          <div className="hudRow"><span className="label">Team 0 (You+Partner)</span><span className="val">{tricksWon[0]}</span></div>
          <div className="hudRow"><span className="label">Team 1 (P1+P3)</span><span className="val">{tricksWon[1]}</span></div>
          {maker !== null && trump && (
            <div className="hudNote">
              Maker: <b>{playerName(maker)}</b> (Team {makerTeam})
            </div>
          )}
        </div>

        <div className="hudBox">
          <div className="hudTitle">Score (to 10)</div>
          <div className="hudRow"><span className="label">Team 0</span><span className="val">{score[0]}</span></div>
          <div className="hudRow"><span className="label">Team 1</span><span className="val">{score[1]}</span></div>
          {gameOver && (
            <div className="hudNote">
              ✅ Team {winnerTeam} wins!
            </div>
          )}
        </div>
      </div>

      <div className="controls">
        {phase === "idle" && (
          <button className="primary" onClick={() => startNewHand()} type="button">
            Start Game / Deal Hand
          </button>
        )}

        {(phase === "hand_over" && !gameOver) && (
          <button className="primary" onClick={() => nextDealerAndHand()} type="button">
            Next Hand
          </button>
        )}

        {gameOver && (
          <button
            className="primary"
            onClick={() => {
              setScore([0, 0]);
              setDealer(0);
              setPhase("idle");
              setDeal({ hands: [[], [], [], []], upcard: null });
              setTrump(null);
              setMaker(null);
              setMakerTeam(null);
              setBidLog([]);
              setTrick([]);
              setTricksWon([0, 0]);
            }}
            type="button"
          >
            New Game
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table">
        <div className="seat top">
          <div className="seatName">{playerName(2)} (Partner)</div>
          <div className="handFanned">
            {Array.from({ length: hands[2]?.length ?? 0 }).map((_, i) => (
              <Card key={i} faceDown small />
            ))}
          </div>
        </div>

        <div className="seat left">
          <div className="seatName">{playerName(1)}</div>
          <div className="handFanned">
            {Array.from({ length: hands[1]?.length ?? 0 }).map((_, i) => (
              <Card key={i} faceDown small />
            ))}
          </div>
        </div>

        <div className="center">
          <div className="centerTop">
            {upcard && (
              <div className="upcard">
                <div className="miniLabel">Upcard</div>
                <Card c={upcard} small />
              </div>
            )}

            <div className="trickArea">
              <div className="miniLabel">Current Trick</div>
              <div className="trickGrid">
                {/* top */}
                <div className="trickSpot topSpot">
                  {trick.find((t) => t.player === 2) ? (
                    <Card c={trick.find((t) => t.player === 2).card} />
                  ) : (
                    <div className="ghost">—</div>
                  )}
                </div>
                {/* left */}
                <div className="trickSpot leftSpot">
                  {trick.find((t) => t.player === 1) ? (
                    <Card c={trick.find((t) => t.player === 1).card} />
                  ) : (
                    <div className="ghost">—</div>
                  )}
                </div>
                {/* right */}
                <div className="trickSpot rightSpot">
                  {trick.find((t) => t.player === 3) ? (
                    <Card c={trick.find((t) => t.player === 3).card} />
                  ) : (
                    <div className="ghost">—</div>
                  )}
                </div>
                {/* bottom (you) */}
                <div className="trickSpot bottomSpot">
                  {trick.find((t) => t.player === 0) ? (
                    <Card c={trick.find((t) => t.player === 0).card} />
                  ) : (
                    <div className="ghost">—</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bidding panel */}
          {(phase === "bid1" || phase === "bid2" || phase === "dealer_discard") && (
            <div className="panel">
              <div className="panelTitle">Action</div>

              {phase === "bid1" && (
                <div className="panelBody">
                  <div className="panelLine">
                    Round 1: Order up <b>{upcard?.s}</b> or pass.
                  </div>

                  {turn === 0 ? (
                    <div className="btnRow">
                      <button className="primary" onClick={orderUp} type="button">
                        Order Up
                      </button>
                      <button className="secondary" onClick={pass} type="button">
                        Pass
                      </button>
                    </div>
                  ) : (
                    <div className="panelLine muted">Waiting for {playerName(turn)}…</div>
                  )}
                </div>
              )}

              {phase === "dealer_discard" && pendingDealerPickup && (
                <div className="panelBody">
                  <div className="panelLine">
                    Trump is <b>{trump}</b>. Dealer must pick up the upcard and discard one.
                  </div>

                  {dealer === 0 ? (
                    <>
                      <div className="panelLine muted">Tap a card below to discard it.</div>
                      <div className="discardRow">
                        {dealerHandForDiscardUI?.map((c) => (
                          <Card
                            key={cardKey(c)}
                            c={c}
                            onClick={() => dealerPickupAndDiscard(c)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="panelLine muted">Waiting for dealer…</div>
                  )}
                </div>
              )}

              {phase === "bid2" && (
                <div className="panelBody">
                  <div className="panelLine">
                    Round 2: Choose a suit (not <b>{upcard?.s}</b>) or pass.
                  </div>
                  {forcedDealerPick && (
                    <div className="panelLine warn">Screw the Dealer: dealer must choose.</div>
                  )}

                  {turn === 0 ? (
                    <div className="btnCol">
                      <div className="btnRow">
                        {SUITS.filter((s) => s !== upcard?.s).map((s) => (
                          <button
                            key={s}
                            className="primary"
                            onClick={() => callSuit(s)}
                            type="button"
                          >
                            Call {s}
                          </button>
                        ))}
                      </div>
                      {!forcedDealerPick && (
                        <button className="secondary" onClick={pass} type="button">
                          Pass
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="panelLine muted">Waiting for {playerName(turn)}…</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bid log */}
          <div className="log">
            <div className="logTitle">Bidding Log</div>
            <div className="logBody">
              {bidLog.length ? bidLog.slice(-10).map((x, i) => <div key={i}>{x}</div>) : <div className="muted">—</div>}
            </div>
          </div>
        </div>

        <div className="seat right">
          <div className="seatName">{playerName(3)}</div>
          <div className="handFanned">
            {Array.from({ length: hands[3]?.length ?? 0 }).map((_, i) => (
              <Card key={i} faceDown small />
            ))}
          </div>
        </div>

        <div className="seat bottom">
          <div className="seatName">{playerName(0)} (You)</div>

          <div className="yourHand">
            {yourHand.map((c) => {
              const legal = yourLegalSet.has(cardKey(c));
              const disabled =
                phase !== "playing" || turn !== 0 || !legal || gameOver;

              return (
                <Card
                  key={cardKey(c)}
                  c={c}
                  onClick={() => playCard(0, c)}
                  disabled={disabled}
                  selected={phase === "playing" && turn === 0 && legal}
                />
              );
            })}
          </div>

          {phase === "playing" && turn === 0 && (
            <div className="hint">
              {leadSuit
                ? `Follow suit if possible: ${leadSuit}`
                : "You lead. Tap a card to play."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
