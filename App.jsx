import React, { useEffect, useState } from "react";
import EuchreApp from "./EuchreApp.jsx";
import HeartsApp from "./HeartsApp.jsx";
import RummyApp from "./RummyApp.jsx";
import SolitaireApp from "./SolitaireApp.jsx";
import { Card, load } from "./ui.jsx";

const GAMES = [
  {
    id: "euchre",
    name: "Euchre",
    blurb: "You and a partner vs. two bots. Bowers, loners and bottoms.",
    cards: [{ r: "J", s: "♥" }, { r: "J", s: "♦" }, { r: "A", s: "♥" }],
    saveKey: "euchre.game.v2",
  },
  {
    id: "hearts",
    name: "Hearts",
    blurb: "3–6 players. Dodge the hearts and the Q♠. Hit the limit and you lose.",
    cards: [{ r: "Q", s: "♠" }, { r: "A", s: "♥" }, { r: "2", s: "♣" }],
    saveKey: "hearts.game.v1",
  },
  {
    id: "rummy",
    name: "Rummy 500",
    blurb: "2–4 players. Lay down sets and runs, play off the table, dig the discards. First to 500.",
    cards: [{ r: "7", s: "♦" }, { r: "8", s: "♦" }, { r: "9", s: "♦" }],
    saveKey: "rummy.game.v1",
  },
  {
    id: "solitaire",
    name: "Solitaire",
    blurb: "Classic Klondike, just you. Draw 1 or 3, undo, and a move counter.",
    cards: [{ r: "K", s: "♠" }, { r: "Q", s: "♥" }, { r: "J", s: "♣" }],
    saveKey: "solitaire.game.v1",
    active: (g) => g.moves > 0 && !g.won,
  },
];

const inProgress = (game) => {
  const g = load(game.saveKey, null);
  if (!g) return false;
  return game.active ? game.active(g) : !["idle", "gameOver"].includes(g.phase);
};

function Home({ onPick }) {
  return (
    <div className="home">
      <h1 className="homeTitle">Card Night</h1>
      <p className="homeSub">No ads. Pick a game.</p>
      <div className="gameTiles">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className="gameTile" onClick={() => onPick(g.id)}>
            <span className="tileFan">
              {g.cards.map((c, i) => (
                <Card key={i} c={c} size="sm" className={`fan${i}`} />
              ))}
            </span>
            <span className="tileText">
              <span className="tileName">{g.name}</span>
              <span className="tileBlurb">{g.blurb}</span>
              {inProgress(g) && <span className="tileResume">Game in progress · Resume ›</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (r) => {
    window.location.hash = r;
  };

  if (route === "euchre") return <EuchreApp onHome={() => go("")} />;
  if (route === "hearts") return <HeartsApp onHome={() => go("")} />;
  if (route === "rummy") return <RummyApp onHome={() => go("")} />;
  if (route === "solitaire") return <SolitaireApp onHome={() => go("")} />;
  return <Home onPick={go} />;
}
