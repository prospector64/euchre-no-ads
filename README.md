# Card Night (No Ads)

Euchre, Hearts, Rummy 500 and Blackjack against bots, plus Solitaire, in the browser. Pick a game from the home screen.

## Files

- `App.jsx`: home screen and switching between games.
- `ui.jsx`: shared pieces (cards, pop-ups, saving, the how-to-play sheet).
- `guides.js`: the how-to-play guide text for every game (opens with the ? button, and automatically on a first visit).
- `engine.js` / `ai.js` / `EuchreApp.jsx`: Euchre rules, bots and screen.
- `hearts-engine.js` / `hearts-ai.js` / `HeartsApp.jsx`: Hearts rules, bots and screen.
- `rummy-engine.js` / `rummy-ai.js` / `RummyApp.jsx`: Rummy 500 rules, bots and screen.
- `solitaire-engine.js` / `SolitaireApp.jsx`: Klondike solitaire rules and screen.
- `blackjack-engine.js` / `blackjack-ai.js` / `BlackjackApp.jsx`: Blackjack rules, the other players, and the table.

The bots only use what a person at the table would know: their own cards, what's been played, and who has run out of a suit.

## Euchre house rules

- **Stick the dealer:** if everyone passes twice, the dealer must name trump.
- **Bottoms (farmer's hand):** on your first turn to bid, three 9s or three 10s can be traded for the three face-down cards under the upcard. That uses up your round-1 turn (no ordering up), but you still get your turn in round 2. You can switch this off or allow any mix of 9s and 10s in Settings.
- **Going alone:** if your partner is the dealer, the upcard isn't picked up.

## Hearts house rules

- **3–6 players.** Every card is dealt. The extras go face down to whoever wins the first trick, and they're revealed and scored at the end of the hand. Whoever holds the lowest club leads.
- **Passing:** choose 0–4 cards and a direction: left, right, across (4 or 6 players), hold, random (everyone's passed cards get shuffled and dealt back out), rotate, or cycle (a random direction each hand from the ones you pick, never the same twice in a row).
- **Scoring:** hearts are 1 point each, the Q♠ is 13. Shoot the moon (all 26, face-down cards included) and everyone else gets 26.
- **The game ends when someone reaches the score limit, and that player loses.** If several players go over on the same hand, the highest score loses.
- **Optional rules:** hearts can't be led until broken, the Q♠ breaks hearts, and no points on the first trick.

## Running it

```bash
npm install
npm run dev
```

Cloudflare Pages builds with `npm run build` and serves the `dist` folder.

## Rummy 500 house rules

- **2 players** (13 cards each) by default, or 3–4 players (7 cards each).
- **Melds:** 3 or 4 of a kind, or 3+ in a row of one suit. Ace is high or low, but no wrap-around (K-A-2).
- **Laying down is optional.** Anyone can play single cards off any meld on the table. Melds can't be rearranged once they're down.
- **Discard pile:** take as deep as you like, but you must play the bottom card you took that same turn.
- **You must discard to go out.**
- **Scoring:** aces 15, 10/J/Q/K 10, 2–9 are 5. You score what you've laid down, minus what's left in your hand. First to 500.

## Solitaire (Klondike)

- Draw 1 (default) or Draw 3, with unlimited passes through the deck.
- Tap a card to send it to the best spot, or drag it where you want it.
- Every draw, move and undo counts as a move. A timer runs from your first move.
- If no useful moves are left, a banner says the deal is stuck and offers Undo or Redeal.
- Once every card is face up, a Finish button plays the rest up for you.

## Blackjack

- 1–5 players (3 by default). You always sit in the middle, across from the dealer; the others are Zach, Josh, Collin and Syd.
- Start with $50 (adjustable). $1 minimum bet, chips of $1, $5, $25 and $100. Go broke and you can buy back in or start a new table.
- Standard Vegas rules by default: 6-deck shoe with a cut card, blackjack pays 3:2, dealer stands on soft 17, double on any first two cards and after splits, split up to 4 hands (split aces get one card each), insurance, and late surrender. All adjustable in Settings.
- The other players mostly play basic strategy with the occasional human mistake, each with their own betting style, and leave when they go broke.
- Stats, and an optional Hi-Lo card count display.
