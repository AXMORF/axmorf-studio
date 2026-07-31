import { interpolate, useCurrentFrame } from "remotion";

function TypewriterSubtitle() {
  const frame = useCurrentFrame();

  const text = "I like typing...";
  const visibleCharacters = Math.floor(
    interpolate(frame, [0, 45], [0, text.length], {
      extrapolateRight: "clamp",
    })
  );

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {text
        .slice(0, visibleCharacters)
        .split("")
        .map((char, index) => {

          return (
            <span
              key={index}
              style={{
                display: "inline-block",
                fontFamily: "'Courier New', monospace",
                fontSize: "3rem",
                fontWeight: "bold",
                color: `white`,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          );
        })}
      <span
        style={{
          fontSize: "3rem",
          color: "#60a5fa",
          opacity: frame % 15 < 7 ? 1 : 0,

          marginLeft: "0.2rem",
          verticalAlign: "middle",
        }}
      >
        ▌
      </span>
    </div>
  );
}

export default TypewriterSubtitle;
