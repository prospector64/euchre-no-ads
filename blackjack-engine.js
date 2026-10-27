/** ---------- Blackjack rules engine ----------
 * Pure functions only: every move is applyAction(state, action) -> new state.
 * Casino flow: bets → deal (one card at a time) → insurance → dealer peek →
 * players act (first base, the dealer's left, goes first) → dealer plays → settle.
 *
 * Seats are slots 0–4 left to right as you look at the table; slot 2 is the
 * middle seat, which is always you.
 */

export const SUITS = ["♠", "♥", "♣", "♦"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const ME = 0; // person index of the human player
export const MIDDLE = 2;

export const DEFAULT_RULES = {
  decks: 6,
  hitSoft17: false,
  bjPays: 1.5, // 3:2 (6:5 = 1.2)
  doubleAfterSplit: true,
  maxHands: 4,
  surrender: true,
  insurance: true,
  penetration: 0.75, // cut card position
  minBet: 1,
  maxBet: 500,
};

export const money = (n) => Math.round(n * 100) / 100;
export const cardKey = (c) => `${c.r}${c.s}${c.d ?? ""}`;
export const isTenValue = (c) => ["10", "J", "Q", "K"].includes(c.r);
const cardValue = (c) => (c.r === "A" ? 1 : isTenValue(c) ? 10 : +c.r);

/** Hi-Lo count value of a card. */
export const hiLo = (c) => (c.r === "A" || isTenValue(c) ? -1 : cardValue(c) <= 6 ? 1 : 0);

export function handTotal(cards) {
  let total = cards.reduce((n, c) => n + cardValue(c), 0);
  const hasAce = cards.some((c) => c.r === "A");
  const soft = hasAce && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft };
}

export const isBlackjack = (hand) => hand.cards.length === 2 && !hand.fromSplit && handTotal(hand.cards).total === 21;
export const isBust = (hand) => handTotal(hand.cards).total > 21;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newShoe(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push({ r, s, d });
  return shuffle(cards);
}

/** Which slots are used for a table of n players (you are always the middle). */
export function slotsFor(n) {
  // Fill outward from the middle: left, right, far left, far right
  return [MIDDLE, 1, 3, 0, 4].slice(0, n);
}

export function newSession({ players = 3, bankroll = 50, rules = DEFAULT_RULES } = {}) {
  const slots = slotsFor(players);
  return {
    v: 1,
    gameId: Date.now(),
    rules,
    startBankroll: bankroll,
    phase: "betting", // betting, dealing, insurance, playing, dealer, roundOver
    players: slots.map((slot, person) => ({
      person,
      slot,
      bankroll: bankroll,
      out: false,
      bet: 0,
      lastBet: 0,
      hands: [],
      insurance: 0,
      insuranceDecided: false,
      result: null,
    })),
    dealer: { cards: [], holeHidden: true },
    shoe: newShoe(rules.decks),
    pos: 0,
    cut: Math.floor(rules.decks * 52 * rules.penetration),
    runningCount: 0,
    shuffleNext: false,
    dealQueue: [],
    turn: null, // { p, h }: index into players, index into that player's hands
    roundNo: 0,
    message: "",
    log: [],
    logId: 0,
  };
}

function addLog(s, text, kind = "info") {
  s.logId += 1;
  s.log = [...s.log, { id: s.logId, text, kind }].slice(-120);
}

/** Players in play order: first base (the dealer's left = right side of your screen) first. */
export const playOrder = (s) =>
  s.players.map((p, i) => ({ p, i })).filter(({ p }) => p.hands.length).sort((a, b) => b.p.slot - a.p.slot).map(({ i }) => i);

function draw(s, visible = true) {
  if (s.pos >= s.shoe.length) {
    // Ran the shoe dry mid-round (tiny shoes only): reshuffle what's not on the table
    s.shoe = newShoe(s.rules.decks);
    s.pos = 0;
    s.runningCount = 0;
    addLog(s, "Shoe ran out — reshuffled", "info");
  }
  const c = s.shoe[s.pos++];
  if (visible) s.runningCount += hiLo(c);
  if (s.pos >= s.cut) s.shuffleNext = true;
  return c;
}

export const decksLeft = (s) => Math.max(0.5, (s.shoe.length - s.pos) / 52);
export const trueCount = (s) => s.runningCount / decksLeft(s);

const newHand = (bet, cards = [], extra = {}) => ({ cards, bet, doubled: false, done: false, result: null, payout: 0, ...extra });

/** ---------- What can the player in turn do? ---------- */
export function legalActions(s) {
  if (s.phase !== "playing" || !s.turn) return {};
  const pl = s.players[s.turn.p];
  const hand = pl.hands[s.turn.h];
  const two = hand.cards.length === 2;
  const canAfford = pl.bankroll >= hand.bet;
  const sameValue = two && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
  return {
    hit: !hand.splitAces,
    stand: true,
    double: two && canAfford && !hand.splitAces && (!hand.fromSplit || s.rules.doubleAfterSplit),
    split: sameValue && canAfford && pl.hands.length < s.rules.maxHands && !(hand.splitAces && hand.cards[0].r === "A"),
    surrender: s.rules.surrender && two && pl.hands.length === 1 && !hand.fromSplit,
  };
}

/** ---------- Turn flow ---------- */
function nextTurn(s) {
  const order = playOrder(s);
  let start = 0;
  if (s.turn) {
    // Next unfinished hand of the same player first
    const pl = s.players[s.turn.p];
    const h = pl.hands.findIndex((x) => !x.done);
    if (h >= 0) {
      s.turn = { p: s.turn.p, h };
      return;
    }
    start = order.indexOf(s.turn.p) + 1;
  }
  for (let k = start; k < order.length; k++) {
    const i = order[k];
    const h = s.players[i].hands.findIndex((x) => !x.done);
    if (h >= 0) {
      s.turn = { p: i, h };
      return;
    }
  }
  s.turn = null;
  startDealer(s);
}

function finishHandIfDone(s, hand) {
  const { total } = handTotal(hand.cards);
  if (total >= 21 || hand.doubled || hand.splitAces) hand.done = true;
}

function startDealer(s) {
  s.phase = "dealer";
  s.dealer.holeHidden = false;
  s.runningCount += hiLo(s.dealer.cards[1]);
  addLog(s, `Dealer turns over ${label(s.dealer.cards[1])} (${handTotal(s.dealer.cards).total})`, "dealer");
}

const label = (c) => `${c.r}${c.s}`;

/** Does the dealer need to draw? Only if someone is still in it. */
function dealerShouldDraw(s) {
  const live = s.players.some((p) => p.hands.some((h) => !h.surrendered && !isBust(h) && !(isBlackjack(h) && h.result)));
  if (!live) return false;
  const { total, soft } = handTotal(s.dealer.cards);
  if (total < 17) return true;
  return total === 17 && soft && s.rules.hitSoft17;
}

function settle(s) {
  const d = handTotal(s.dealer.cards).total;
  const dealerBJ = isBlackjack({ cards: s.dealer.cards });
  for (const pl of s.players) {
    if (!pl.hands.length) continue;
    let net = 0;
    for (const h of pl.hands) {
      if (h.result) {
        net += h.payout;
        continue;
      }
      const t = handTotal(h.cards).total;
      if (t > 21) (h.result = "bust"), (h.payout = -h.bet);
      else if (dealerBJ) (h.result = "lose"), (h.payout = -h.bet);
      else if (d > 21 || t > d) (h.result = "win"), (h.payout = h.bet);
      else if (t === d) (h.result = "push"), (h.payout = 0);
      else (h.result = "lose"), (h.payout = -h.bet);
      pl.bankroll = money(pl.bankroll + h.bet + h.payout); // stake comes back on win/push
      net += h.payout;
    }
    if (pl.insurance) net += pl.insuranceWon ? pl.insurance * 2 : -pl.insurance;
    pl.result = { net: money(net) };
  }
  s.phase = "roundOver";
  s.turn = null;
  addLog(s, `Dealer ${d > 21 ? "busts" : `has ${d}`} · ${s.players.filter((p) => p.result).map((p) => `{${p.person}} ${p.result.net >= 0 ? "+" : ""}${p.result.net}`).join(", ")}`, "result");
  for (const pl of s.players) {
    if (pl.bankroll < s.rules.minBet && !pl.out) {
      pl.out = true;
      if (pl.person !== ME) addLog(s, `{${pl.person}} is out of money and leaves the table`, "info");
    }
  }
}

/** After the deal (and insurance): dealer peeks, blackjacks get paid. */
function afterDeal(s) {
  const up = s.dealer.cards[0];
  const peek = up.r === "A" || isTenValue(up);
  const dealerBJ = isBlackjack({ cards: s.dealer.cards });
  if (peek && dealerBJ) {
    s.dealer.holeHidden = false;
    s.runningCount += hiLo(s.dealer.cards[1]);
    addLog(s, "Dealer has blackjack", "dealer");
    for (const pl of s.players) {
      if (pl.insurance) {
        pl.insuranceWon = true;
        pl.bankroll = money(pl.bankroll + pl.insurance * 3); // stake back + 2:1
      }
      for (const h of pl.hands) {
        if (isBlackjack(h)) (h.result = "push"), (h.payout = 0), (pl.bankroll = money(pl.bankroll + h.bet));
        else (h.result = "lose"), (h.payout = -h.bet);
        h.done = true;
      }
    }
    settle(s);
    return;
  }
  if (peek && up.r === "A") addLog(s, "Dealer checks — no blackjack", "dealer");
  // Player blackjacks are paid right away
  for (const pl of s.players) {
    for (const h of pl.hands) {
      if (isBlackjack(h)) {
        h.result = "blackjack";
        h.payout = money(h.bet * s.rules.bjPays);
        pl.bankroll = money(pl.bankroll + h.bet + h.payout);
        h.done = true;
      }
    }
  }
  s.phase = "playing";
  s.turn = null;
  nextTurn(s);
}

/** Apply one move. Invalid moves return the state unchanged. */
export function applyAction(state, a) {
  switch (a.type) {
    case "startRound": {
      if (state.phase !== "betting" && state.phase !== "roundOver") return state;
      const s = structuredClone(state);
      const { minBet, maxBet } = s.rules;
      // a.bets: { [person]: amount }
      for (const pl of s.players) {
        const want = money(a.bets?.[pl.person] ?? 0);
        pl.hands = [];
        pl.insurance = 0;
        pl.insuranceWon = false;
        pl.insuranceDecided = false;
        pl.result = null;
        if (pl.out || want < minBet) continue;
        const bet = Math.min(want, maxBet, pl.bankroll);
        if (bet < minBet) continue;
        pl.bankroll = money(pl.bankroll - bet);
        pl.lastBet = bet;
        pl.hands = [newHand(bet)];
      }
      if (!s.players.some((p) => p.hands.length)) return state;
      if (s.shuffleNext) {
        s.shoe = newShoe(s.rules.decks);
        s.pos = 0;
        s.cut = Math.floor(s.rules.decks * 52 * s.rules.penetration);
        s.runningCount = 0;
        s.shuffleNext = false;
        addLog(s, "Cut card reached — new shoe shuffled", "deal");
      }
      s.roundNo += 1;
      s.dealer = { cards: [], holeHidden: true };
      s.turn = null;
      // Two passes: each player, then the dealer
      const order = playOrder(s);
      s.dealQueue = [...order.map((i) => ({ p: i })), { dealer: true }, ...order.map((i) => ({ p: i })), { dealer: true, hole: true }];
      s.phase = "dealing";
      addLog(s, `Round ${s.roundNo}`, "deal");
      return s;
    }
    case "dealStep": {
      if (state.phase !== "dealing") return state;
      const s = structuredClone(state);
      const step = s.dealQueue.shift();
      if (step.dealer) s.dealer.cards.push(draw(s, !step.hole));
      else s.players[step.p].hands[0].cards.push(draw(s));
      if (!s.dealQueue.length) {
        if (s.rules.insurance && s.dealer.cards[0].r === "A") {
          s.phase = "insurance";
          addLog(s, "Dealer shows an ace — insurance?", "dealer");
        } else afterDeal(s);
      }
      return s;
    }
    case "insurance": {
      if (state.phase !== "insurance") return state;
      const i = state.players.findIndex((p) => p.person === a.person);
      const pl = state.players[i];
      if (!pl || !pl.hands.length || pl.insuranceDecided) return state;
      const cost = money(pl.hands[0].bet / 2);
      if (a.take && pl.bankroll < cost) return state;
      const s = structuredClone(state);
      const p2 = s.players[i];
      p2.insuranceDecided = true;
      if (a.take) {
        p2.insurance = cost;
        p2.bankroll = money(p2.bankroll - cost);
        addLog(s, `{${p2.person}} takes insurance`, "bet");
      }
      if (s.players.every((p) => !p.hands.length || p.insuranceDecided)) afterDeal(s);
      return s;
    }
    case "hit":
    case "stand":
    case "double":
    case "split":
    case "surrender": {
      if (state.phase !== "playing" || !state.turn) return state;
      if (state.players[state.turn.p].person !== a.person) return state;
      if (!legalActions(state)[a.type]) return state;
      const s = structuredClone(state);
      const pl = s.players[s.turn.p];
      const hand = pl.hands[s.turn.h];
      if (a.type === "hit") {
        hand.cards.push(draw(s));
        finishHandIfDone(s, hand);
      } else if (a.type === "stand") {
        hand.done = true;
      } else if (a.type === "double") {
        pl.bankroll = money(pl.bankroll - hand.bet);
        hand.bet = money(hand.bet * 2);
        hand.doubled = true;
        hand.cards.push(draw(s));
        hand.done = true;
        addLog(s, `{${pl.person}} doubles`, "bet");
      } else if (a.type === "surrender") {
        hand.surrendered = true;
        hand.result = "surrender";
        hand.payout = money(-hand.bet / 2);
        pl.bankroll = money(pl.bankroll + hand.bet / 2);
        hand.done = true;
        addLog(s, `{${pl.person}} surrenders`, "bet");
      } else if (a.type === "split") {
        pl.bankroll = money(pl.bankroll - hand.bet);
        const aces = hand.cards[0].r === "A";
        const second = newHand(hand.bet, [hand.cards.pop()], { fromSplit: true, splitAces: aces });
        hand.fromSplit = true;
        hand.splitAces = aces;
        hand.cards.push(draw(s));
        second.cards.push(draw(s));
        pl.hands.splice(s.turn.h + 1, 0, second);
        finishHandIfDone(s, hand);
        finishHandIfDone(s, second);
        addLog(s, `{${pl.person}} splits ${aces ? "aces" : `${hand.cards[0].r}s`}`, "bet");
      }
      if (hand.done) nextTurn(s);
      return s;
    }
    case "dealerStep": {
      if (state.phase !== "dealer") return state;
      const s = structuredClone(state);
      if (dealerShouldDraw(s)) s.dealer.cards.push(draw(s));
      else settle(s);
      return s;
    }
    case "rebuy": {
      // Start over with a fresh bankroll (for you), keeping the table as it is
      const s = structuredClone(state);
      const pl = s.players.find((p) => p.person === a.person);
      if (!pl) return state;
      pl.bankroll = money(a.amount ?? s.startBankroll);
      pl.out = false;
      addLog(s, `{${pl.person}} buys back in for $${pl.bankroll}`, "info");
      return s;
    }
    default:
      return state;
  }
}
