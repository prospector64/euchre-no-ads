# Euchre (No Ads)

Four-player euchre against three bots: you and your partner (top) vs. the two bots on your left and right. First team to 10 wins.

## Files

- `engine.js`: the rules. Dealing, bidding, bottoms, trick-taking, scoring.
- `ai.js`: the bots. They only use what a person at the table would know: their own cards, cards already played, and who has shown out of a suit.
- `App.jsx` / `styles.css`: the screen.

## House rules

- **Stick the dealer:** if everyone passes twice, the dealer must name trump.
- **Bottoms (farmer's hand):** on your first turn to bid, if you hold three 9s or three 10s, you can show them and trade them for the three face-down cards under the upcard. Then you bid as normal. You can switch this off, or allow any mix of 9s and 10s, in Settings.
- **Going alone:** if your partner is the dealer, the upcard isn't picked up.

## Running it

```bash
npm install
npm run dev
```

Cloudflare Pages builds with `npm run build` and serves the `dist` folder.
