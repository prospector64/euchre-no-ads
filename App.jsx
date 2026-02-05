import { useMemo, useState } from "react";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["9", "10", "J", "Q", "K", "A"];
const sameColor = (a, b) =>
  (a === "♠" || a === "♣") === (b === "♠" || b === "♣");

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
  return c.r === "J" && sameColor(c.s, trump) && c.s !== trump;
}
function effectiveSuit(c, trump) {
  if (isRightBower(c, trump) || isLeftBower(c, trump)) return trump;
  return c.s;
}

function cardPower(c, trump, leadSuit) {
  // Higher is better
  if (isRightBower(c, trump)) return 200;
  if (isLeftBower(c, trump)) return 190;

  const eff = effectiveSuit(c, trump);
  const isTrump = eff === trump;
  const followsLead = eff === leadSuit;

  // Non-following, non-trump can't win
  if (!isTrump && !followsLead) return 0;

  const rankOrder = { A: 6, K: 5, Q: 4, J: 3, "10": 2, "9": 1 };
  const base = rankOrder[c.r] || 0;
  return (isTrump ? 100 : 50) + base;
}

function dealHands() {
  const deck = shuffle(makeDeck());
  const hands = [[], [], [], []];
  let idx = 0;
  for (let i = 0; i < 20; i++) {
    hands[idx].push(deck.pop());
    idx = (idx + 1) % 4;
  }
  const upcard = deck.pop();
  return { hands, upcard, deck };
}

function cardLabel(c) {
  return `${c.r}${c.s}`;
}

export default function App() {
  const [trump, setTrump] = useState("♥");
  const [{ hands, upcard }, setDeal] = useState(() => dealHands());
  const [dealer, setDealer] = useState(0);
  const [leader, setLeader] = useState((dealer + 1) % 4);
  const [turn, setTurn] = useState((dealer + 1) % 4);
  const [trick, setTrick] = useState([]); // {player, card}
  const [tricksWon, setTricksWon] = useState([0, 0]); // team0: players 0&2, team1: 1&3
  const [score, setScore] = useState([0, 0]);
  const [makerTeam, setMakerTeam] = useState(0); // simplified: team0 is maker by default

  const teamOf = (p) => (p % 2); // 0: (0,2) 1: (1,3)

  const leadSuit = useMemo(() => {
    if (trick.length === 0) return null;
    return effectiveSuit(trick[0].card, trump);
  }, [trick, trump]);

  function resetHand(newDealer = (dealer + 1) % 4) {
    const dealt = dealHands();
    setDeal(dealt);
    setDealer(newDealer);
    const newLeader = (newDealer + 1) % 4;
    setLeader(newLeader);
    setTurn(newLeader);
    setTrick([]);
    setTricksWon([0, 0]);
    setTrump(trump); // keep current trump
    setMakerTeam(0); // keep simple
  }

  function legalCards(playerIndex) {
    const hand = hands[playerIndex];
    if (!leadSuit) return hand;
    const follows = hand.filter((c) => effectiveSuit(c, trump) === leadSuit);
    return follows.length ? follows : hand;
  }

  function playCard(playerIndex, card) {
    // enforce turn + legal
    if (playerIndex !== turn) return;

    const legal = legalCards(playerIndex);
    const isLegal = legal.some((c) => c.s === card.s && c.r === card.r);
    if (!isLegal) return;

    // remove card from hand
    const newHands = hands.map((h, i) =>
      i === playerIndex ? h.filter((c) => !(c.s === card.s && c.r === card.r)) : h
    );

    const newTrick = [...trick, { player: playerIndex, card }];
    setDeal({ hands: newHands, upcard });

    if (newTrick.length < 4) {
      setTrick(newTrick);
      setTurn((turn + 1) % 4);
      return;
    }

    // resolve trick
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
    const winnerPlayer = newTrick[bestIdx].player;

    const newTW = [...tricksWon];
    newTW[teamOf(winnerPlayer)] += 1;
    setTricksWon(newTW);

    // next trick
    setTrick([]);
    setLeader(winnerPlayer);
    setTurn(winnerPlayer);

    // after 5 tricks, score hand (simplified makerTeam)
    const tricksPlayedSoFar = 5 - newHands[0].length;
    if (tricksPlayedSoFar === 5) {
      const makerTricks = newTW[makerTeam];
      const defTeam = makerTeam === 0 ? 1 : 0;

      const newScore = [...score];
      if (makerTricks >= 3 && makerTricks < 5) newScore[makerTeam] += 1;
      else if (makerTricks === 5) newScore[makerTeam] += 2;
      else newScore[defTeam] += 2; // euchred
      setScore(newScore);

      // new hand
      resetHand((dealer + 1) % 4);
    }
  }

  // super simple bot: plays lowest legal card
  function botStep() {
    if (turn === 0) return; // player 0 is you
    const hand = hands[turn];
    const legal = legalCards(turn);
    // pick lowest by power (but legal)
    const lead = leadSuit ?? effectiveSuit(legal[0], trump);
    let pick = legal[0];
    let best = Infinity;
    for (const c of legal) {
      const p = cardPower(c, trump, lead);
      if (p < best) {
        best = p;
        pick = c;
      }
    }
    playCard(turn, pick);
  }

  // Run bots until it's your turn
  useMemo(() => {
    const id = setInterval(() => {
      if (turn !== 0) botStep();
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, hands, trick, trump]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 900 }}>
      <h2>Euchre (No Ads) — Minimal</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div><b>Trump:</b> {trump}</div>
          <div><b>Upcard:</b> {cardLabel(upcard)}</div>
          <div><b>Dealer:</b> P{dealer}</div>
          <div><b>Turn:</b> P{turn} {turn===0?"(You)":""}</div>
          <div><b>Lead Suit:</b> {leadSuit ?? "—"}</div>
        </div>

        <div>
          <div><b>Tricks won this hand</b></div>
          <div>Team 0 (P0+P2): {tricksWon[0]}</div>
          <div>Team 1 (P1+P3): {tricksWon[1]}</div>
        </div>

        <div>
          <div><b>Score (to 10)</b></div>
          <div>Team 0: {score[0]}</div>
          <div>Team 1: {score[1]}</div>
        </div>

        <div>
          <button onClick={() => setTrump("♠")}>Trump ♠</button>{" "}
          <button onClick={() => setTrump("♥")}>Trump ♥</button>{" "}
          <button onClick={() => setTrump("♦")}>Trump ♦</button>{" "}
          <button onClick={() => setTrump("♣")}>Trump ♣</button>{" "}
          <button onClick={() => resetHand()}>Redeal</button>
        </div>
      </div>

      <hr />

      <h3>Current Trick</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {trick.length === 0 ? (
          <div>—</div>
        ) : (
          trick.map((t) => (
            <div key={`${t.player}-${t.card.s}-${t.card.r}`}>
              <b>P{t.player}:</b> {cardLabel(t.card)}
            </div>
          ))
        )}
      </div>

      <hr />

      <h3>Your Hand (P0)</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {hands[0].map((c) => {
          const legal = legalCards(0).some((x) => x.s === c.s && x.r === c.r);
          return (
            <button
              key={`${c.s}-${c.r}`}
              onClick={() => playCard(0, c)}
              disabled={turn !== 0 || !legal}
              title={legal ? "Play" : "Must follow suit"}
              style={{
                padding: "10px 12px",
                opacity: legal ? 1 : 0.4,
                cursor: legal ? "pointer" : "not-allowed",
              }}
            >
              {cardLabel(c)}
            </button>
          );
        })}
      </div>

      <hr />

      <details>
        <summary>Other players (hands hidden size only)</summary>
        <div>P1 cards: {hands[1].length}</div>
        <div>P2 cards: {hands[2].length}</div>
        <div>P3 cards: {hands[3].length}</div>
      </details>

      <p style={{ marginTop: 16, color: "#555" }}>
        This is a minimal engine: it enforces legal plays (follow suit using effective suit for bowers),
        resolves trick winners, tracks hand scoring, and runs simple bots. Next upgrades are bidding,
        ordering up, going alone, and better AI.
      </p>
    </div>
  );
}
