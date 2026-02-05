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
      title={`${c.r}${c.s}`}
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
