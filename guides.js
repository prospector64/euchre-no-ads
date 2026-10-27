/** ---------- How-to-play guides ----------
 * One guide per game, written for the house rules this site uses.
 * Each section is { title, items: [string] }. Text in **double stars** is bolded.
 */

export const GUIDES = {
  euchre: {
    title: "How to play Euchre",
    intro: "You and your partner (across the table) play against the two players on your left and right. First team to 10 points wins.",
    sections: [
      {
        title: "The cards",
        items: [
          "Only the 9, 10, J, Q, K and A of each suit are used: 24 cards.",
          "Once trump is picked, the **right bower** (jack of trump) is the highest card, then the **left bower** (the other jack of the same color), then A, K, Q, 10, 9 of trump.",
          "The left bower counts as a trump card, not as its own suit.",
        ],
      },
      {
        title: "Picking trump",
        items: [
          "Everyone gets 5 cards and one card is turned face up.",
          "**Round 1:** going around the table, each player can tell the dealer to pick up that card (making its suit trump) or pass. If someone orders it up, the dealer takes it and throws away a card.",
          "**Round 2:** if everyone passed, that card is turned down and each player can name any other suit as trump, or pass.",
          "**Stick the dealer:** if it gets back to the dealer in round 2, the dealer has to name trump.",
          "The team that picks trump is the **makers** and needs at least 3 of the 5 tricks.",
        ],
      },
      {
        title: "Going alone",
        items: [
          "When you call trump you can **go alone**: your partner sits out and you play the hand by yourself for a bigger payoff.",
          "If your partner is the dealer and you go alone, the upcard isn't picked up.",
        ],
      },
      {
        title: "Bottoms (house rule)",
        items: [
          "Dealt three 9s or three 10s? On your first turn in round 1 you can **take the bottoms**: show those three cards and swap them for the three face-down cards under the upcard.",
          "Taking the bottoms **uses up your round-1 turn** (you can't order it up), but you still get your turn in round 2.",
          "Settings can turn this off, or allow any mix of 9s and 10s.",
        ],
      },
      {
        title: "Playing the tricks",
        items: [
          "The player to the dealer's left leads first. After that, whoever wins a trick leads the next one.",
          "You must **follow suit** if you can. If you can't, play anything, including trump.",
          "The highest trump wins the trick. If no trump was played, the highest card of the suit that was led wins.",
        ],
      },
      {
        title: "Scoring",
        items: [
          "Makers take 3 or 4 tricks: **1 point**.",
          "Makers take all 5 (a **march**): **2 points**.",
          "Going alone and taking all 5: **4 points**.",
          "Makers take fewer than 3 (**euchred**): the other team gets **2 points**.",
        ],
      },
      {
        title: "Using the app",
        items: [
          "Use the buttons under the table to order up, pass, call a suit or go alone.",
          "On your turn, the cards you're allowed to play are raised. Tap one to play it.",
          "**Last trick** shows the previous trick. ☰ opens the full game log. ⚙︎ has names, bottoms rules and speed.",
        ],
      },
    ],
  },

  hearts: {
    title: "How to play Hearts",
    intro: "Avoid taking hearts and the queen of spades. Points are bad: when someone reaches the score limit, that player loses.",
    sections: [
      {
        title: "The deal",
        items: [
          "Every card is dealt out as evenly as possible to 3–6 players.",
          "Any extra cards are put **face down**. Whoever wins the first trick takes them without looking, and they're revealed and scored at the end of the hand.",
          "A gold **?** badge shows who has the face-down cards, since there might be points hiding in them.",
        ],
      },
      {
        title: "Passing",
        items: [
          "Before each hand, everyone picks cards to pass (3 by default).",
          "**Left / Right / Across:** pass to that player. Across only works with 4 or 6 players.",
          "**Random:** everyone's passed cards are shuffled together and dealt back out. You might get some of your own back.",
          "**Hold:** no passing this hand.",
          "**Cycle:** a random direction each hand from the ones you pick in Settings, never the same twice in a row.",
        ],
      },
      {
        title: "Playing the tricks",
        items: [
          "Whoever has the lowest club (usually the 2♣) leads it to start.",
          "You must **follow suit** if you can. If you can't, you can throw anything, which is your chance to dump hearts or the Q♠ on someone.",
          "The highest card of the suit that was led wins the trick. There's no trump.",
          "**Hearts can't be led until they're broken** (someone has thrown one). Playing the Q♠ also breaks hearts.",
          "No points can be played on the very first trick unless you have nothing else.",
        ],
      },
      {
        title: "Scoring",
        items: [
          "Each heart you take is **1 point**. The Q♠ is **13 points**.",
          "**Shoot the moon:** take every point in the hand (all 26, face-down cards included) and everyone else gets 26 instead.",
          "The game ends when someone reaches the limit (100 by default), and that player loses. If several players cross it on the same hand, the highest score loses.",
        ],
      },
      {
        title: "Using the app",
        items: [
          "To pass, tap the cards you want to give away, then press **Pass**.",
          "Cards you received have a gold border until the first trick is over.",
          "On your turn, cards you can't play are darkened. Tap a legal card to play it.",
          "Tap the title for the score sheet. ⚙︎ has players, names, passing, score limit and house rules.",
        ],
      },
    ],
  },

  rummy: {
    title: "How to play Rummy 500",
    intro: "Lay down sets and runs to score points, play off the table, and be the first to go out. First to 500 wins.",
    sections: [
      {
        title: "Melds",
        items: [
          "A **set** is 3 or 4 cards of the same rank, like 7♠ 7♥ 7♦. Pairs don't count.",
          "A **run** is 3 or more cards in a row in one suit, like 4♦ 5♦ 6♦.",
          "The ace can be high (Q-K-A) or low (A-2-3), but runs can't wrap around (no K-A-2).",
        ],
      },
      {
        title: "Your turn",
        items: [
          "**1. Draw:** take the top card of the pile, or pick up from the discards.",
          "**2. Play (optional):** lay down melds, and/or play single cards off **any** meld on the table, including other players' melds.",
          "**3. Discard** one card to end your turn.",
          "You don't have to lay down a meld when you can. Holding it keeps others from playing off it, but if someone goes out, cards in your hand count against you.",
          "Once a meld is down it can't be rearranged.",
        ],
      },
      {
        title: "Digging into the discards",
        items: [
          "You can pick up as deep into the discard pile as you want. You take that card and every card above it.",
          "You **must play the bottom card you took** that same turn, in a meld or off the table.",
          "That's allowed even if you have to play other cards first to make room. For example, play your 5♦ on the table's A-2-3-4♦, then the 6♦ you picked up.",
          "You can only make the pickup if you'd still have a card left to discard.",
        ],
      },
      {
        title: "Going out and scoring",
        items: [
          "You go out by getting rid of all your cards, and **you must end with a discard**.",
          "When someone goes out, everyone scores the cards they've laid down **minus** the cards still in their hand.",
          "Card values: **aces 15**, **10/J/Q/K 10**, **2–9 are 5**.",
          "First to 500 wins.",
        ],
      },
      {
        title: "Using the app",
        items: [
          "Tap the pile to draw, or tap a card in the discards to see how much you'd pick up, then press **Pick up**.",
          "Cards you just picked up have a gold outline. The one you must play also says **PLAY**.",
          "Tap cards in your hand to select them (blue ring), then press **Lay down**. With one card selected, any meld it fits on glows. Tap it to play the card there.",
          "Select one card and press **Discard** to end your turn.",
          "The colored bars under table cards show who played each one.",
        ],
      },
    ],
  },

  solitaire: {
    title: "How to play Solitaire",
    intro: "Classic Klondike. Move all 52 cards onto the four foundations (top right), from ace up to king in each suit.",
    sections: [
      {
        title: "The layout",
        items: [
          "**Columns:** 7 columns, with the top card of each face up.",
          "**Deck** (top left): flip cards from here when you're stuck.",
          "**Foundations** (top right): one pile per suit, built ace, 2, 3 … up to king.",
        ],
      },
      {
        title: "Moving cards",
        items: [
          "In the columns, stack cards **down in alternating colors**, like a red 7 on a black 8.",
          "You can move a whole run of face-up cards together.",
          "Only a **king** (or a run starting with a king) can go in an empty column.",
          "When you move the last face-up card off a column, the card under it flips over.",
          "Cards can also come back down from a foundation if you need them.",
        ],
      },
      {
        title: "The deck",
        items: [
          "Tap the deck to flip 1 card (or 3 on Draw 3) onto the waste pile. Only the top waste card can be played.",
          "When the deck runs out, tap it again to turn the waste back over. You can go through as many times as you like.",
        ],
      },
      {
        title: "Using the app",
        items: [
          "**Tap** a card to send it to the best spot automatically, or **drag** it where you want it.",
          "↶ undoes a move and ↻ starts a new deal. Every draw, move and undo counts toward your move total.",
          "If there are no useful moves left, a banner tells you the deal is stuck so you can undo or redeal.",
          "When every card is face up, press **Finish** to play the rest up.",
          "⚙︎ switches between Draw 1 and Draw 3 and shows your stats.",
        ],
      },
    ],
  },

  blackjack: {
    title: "How to play Blackjack",
    intro: "Beat the dealer by getting closer to 21 without going over. You start with $50. See how far you can run it.",
    sections: [
      {
        title: "Card values",
        items: [
          "2–10 are worth their number. J, Q and K are worth **10**.",
          "An ace is worth **11 or 1**, whichever helps. A hand with an ace counted as 11 is **soft** (shown like 7/17).",
          "**Blackjack** is an ace plus a 10-value card on your first two cards.",
        ],
      },
      {
        title: "How a round goes",
        items: [
          "Everyone bets, then gets two cards face up. The dealer gets one up and one face down.",
          "If the dealer shows an ace, you're offered **insurance** first, and the dealer checks for blackjack.",
          "Players act one at a time, starting from the dealer's left (your right).",
          "Then the dealer turns over the hidden card and must **hit until 17 or more** (standing on soft 17 by default).",
        ],
      },
      {
        title: "Your options",
        items: [
          "**Hit:** take another card. Go over 21 and you **bust** and lose.",
          "**Stand:** keep what you have.",
          "**Double:** double your bet, take exactly one more card, then you're done.",
          "**Split:** with a pair, split into two hands with a bet on each. You can split up to 4 hands. Split aces get one card each.",
          "**Surrender:** give up your first two cards and get half your bet back.",
          "**Insurance:** when the dealer shows an ace, bet half your bet that the dealer has blackjack. Pays 2 to 1.",
        ],
      },
      {
        title: "Payouts",
        items: [
          "Beat the dealer, or the dealer busts: win **1 to 1**.",
          "Blackjack pays **3 to 2** (a $10 bet wins $15).",
          "Same total as the dealer: **push**, and your bet comes back.",
          "A 21 made after splitting counts as 21, not blackjack.",
        ],
      },
      {
        title: "Using the app",
        items: [
          "Tap chips to build your bet ($1 minimum), then press **Deal**. **Rebet** repeats your last bet and **2×** doubles it.",
          "Your bet stays in place, so you can just keep pressing Deal.",
          "Go broke and you can **buy back in** or start a new table.",
          "The shoe meter (top right) shows how much of the 6-deck shoe is left. The red line is the cut card, and it reshuffles after that.",
          "⚙︎ has players, names, starting money, table rules, deal speed and an optional Hi-Lo card count. Tap the title for your stats.",
        ],
      },
    ],
  },
};
