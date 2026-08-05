import type {FC} from "react";

type RendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

const smooth = (value: number) => {
  const progress = clamp(value);
  return progress * progress * (3 - 2 * progress);
};

const Renderer: FC<RendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
}) => {
  if (
    storyId !== "rounded-airplane-windows" ||
    meaningId !== "square-corner-stress" ||
    durationInFrames !== 568 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("square-corner-stress Renderer received stale Scene identity.");
  }

  const pressureReveal = smooth((sceneFrame - 18) / 86);
  const stressReveal = smooth((sceneFrame - 282) / 110);
  const detailReveal = smooth((sceneFrame - 386) / 86);
  const cyclePhase = (sceneFrame % 96) / 96;
  const pulse = Math.sin(cyclePhase * Math.PI * 2) * 0.5 + 0.5;
  const ringInset = 32 - pulse * 22;
  const hotRadius = 12 + stressReveal * (12 + pulse * 7);
  const crackLength = 76 * detailReveal;
  const cycleCount = Math.max(1, Math.floor(sceneFrame / 96) + 1);
  const corners = [
    [180, 590],
    [900, 590],
    [180, 1280],
    [900, 1280],
  ] as const;

  return (
    <div
      data-scene="square-corner-stress"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        color: "#f2ecd8",
        background:
          "radial-gradient(circle at 50% 42%, #123552 0%, #0a243a 48%, #061827 100%)",
        fontFamily: '"Arial", "Noto Sans SC", sans-serif',
      }}
    >
      <svg
        viewBox="0 0 1080 1920"
        width="1080"
        height="1920"
        style={{position: "absolute", inset: 0}}
      >
        <defs>
          <pattern id="stress-grid" width="54" height="54" patternUnits="userSpaceOnUse">
            <path d="M 54 0 L 0 0 0 54" fill="none" stroke="#6ea6c7" strokeWidth="1" opacity="0.12" />
          </pattern>
          <filter id="stress-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <clipPath id="detail-clip">
            <circle cx="826" cy="416" r="128" />
          </clipPath>
        </defs>

        <rect width="1080" height="1920" fill="url(#stress-grid)" />
        <path
          d="M80 460 C270 386 810 386 1000 460 L1000 1442 C810 1512 270 1512 80 1442 Z"
          fill="#0b2b43"
          stroke="#6ea6c7"
          strokeWidth="3"
          opacity="0.78"
        />

        {[0, 1, 2].map((index) => {
          const inset = ringInset + index * 35;
          return (
            <rect
              key={index}
              x={80 + inset}
              y={460 + inset}
              width={920 - inset * 2}
              height={982 - inset * 2}
              rx={90 + index * 18}
              fill="none"
              stroke="#72d5dc"
              strokeWidth={4 - index}
              opacity={pressureReveal * (0.48 - index * 0.1)}
              strokeDasharray="18 18"
            />
          );
        })}

        <rect x="180" y="590" width="720" height="690" rx="22" fill="#071d2d" stroke="#f2ecd8" strokeWidth="9" />
        <rect x="208" y="618" width="664" height="634" rx="8" fill="#0c304a" stroke="#6ea6c7" strokeWidth="3" opacity="0.56" />

        {[
          "M90 500 C132 524 154 552 180 590",
          "M990 500 C948 524 926 552 900 590",
          "M90 1370 C132 1344 154 1316 180 1280",
          "M990 1370 C948 1344 926 1316 900 1280",
          "M540 492 C420 520 294 548 180 590",
          "M540 492 C660 520 786 548 900 590",
          "M540 1410 C420 1384 294 1332 180 1280",
          "M540 1410 C660 1384 786 1332 900 1280",
        ].map((path, index) => (
          <path
            key={path}
            d={path}
            fill="none"
            stroke={index < 4 ? "#ff7b48" : "#e45634"}
            strokeWidth={index < 4 ? 7 : 4}
            strokeLinecap="round"
            strokeDasharray="24 17"
            strokeDashoffset={-sceneFrame * (1.4 + index * 0.05)}
            opacity={stressReveal * (index < 4 ? 0.94 : 0.62)}
          />
        ))}

        {corners.map(([cx, cy], index) => (
          <g key={`${cx}-${cy}`} opacity={0.18 + stressReveal * 0.82}>
            <circle cx={cx} cy={cy} r={hotRadius * 2.3} fill="#ff5d35" opacity="0.25" filter="url(#stress-glow)" />
            <circle cx={cx} cy={cy} r={hotRadius} fill="#ff6a3d" />
            <path
              d={`M${cx + (index % 2 === 0 ? 13 : -13)} ${cy + (index < 2 ? 13 : -13)} l${index % 2 === 0 ? crackLength * 0.45 : -crackLength * 0.45} ${index < 2 ? crackLength * 0.24 : -crackLength * 0.24}`}
              stroke="#ffd0b8"
              strokeWidth="4"
              fill="none"
              opacity={detailReveal}
            />
          </g>
        ))}

        <path d="M900 590 C916 528 870 510 842 524" fill="none" stroke="#f2ecd8" strokeWidth="2" opacity={detailReveal} strokeDasharray="8 8" />
        <g opacity={detailReveal}>
          <circle cx="826" cy="416" r="132" fill="#071d2d" stroke="#f2ecd8" strokeWidth="5" />
          <g clipPath="url(#detail-clip)">
            <path d="M700 520 L700 286 L934 286" fill="none" stroke="#f2ecd8" strokeWidth="12" />
            <circle cx="700" cy="286" r="54" fill="#ff6a3d" opacity="0.55" filter="url(#stress-glow)" />
            <circle cx="700" cy="286" r="20" fill="#ff6a3d" />
            <path d={`M704 291 l${crackLength * 0.5} ${crackLength * 0.25} l${crackLength * 0.16} ${-crackLength * 0.2}`} stroke="#ffd0b8" strokeWidth="7" fill="none" />
          </g>
          <text x="826" y="574" textAnchor="middle" fill="#ffb08b" fontSize="23" letterSpacing="3">DETAIL A · CRACK ORIGIN</text>
        </g>
      </svg>

      <div style={{position: "absolute", left: 80, top: 100, width: 660}}>
        <div style={{fontSize: 25, letterSpacing: 7, color: "#72d5dc"}}>PRESSURE CYCLE / 01</div>
        <div style={{marginTop: 18, fontSize: 72, fontWeight: 750, letterSpacing: -2}}>尖角会把载荷挤在一点</div>
        <div style={{marginTop: 18, fontSize: 28, lineHeight: 1.5, color: "#a7bed0"}}>
          CABIN PRESSURE · REPEATED LOAD · STRESS PEAK
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 80,
          top: 1512,
          display: "flex",
          gap: 28,
          alignItems: "flex-end",
        }}
      >
        <div>
          <div style={{fontSize: 19, letterSpacing: 4, color: "#8aa7ba"}}>PRESSURE CYCLES</div>
          <div style={{marginTop: 8, fontSize: 72, lineHeight: 1, color: "#72d5dc"}}>{String(cycleCount).padStart(2, "0")}</div>
        </div>
        <div style={{width: 390, paddingBottom: 8}}>
          <div style={{height: 4, background: "rgba(110,166,199,0.24)"}}>
            <div style={{width: `${Math.round(pulse * 100)}%`, height: 4, background: "#72d5dc"}} />
          </div>
          <div style={{marginTop: 17, fontSize: 22, color: "#b8cbd6"}}>膨胀 → 收缩 → 再次加载</div>
        </div>
      </div>

      <div style={{position: "absolute", left: 80, bottom: 92, display: "flex", alignItems: "center", gap: 18}}>
        <div style={{width: 14, height: 14, borderRadius: 7, background: stressReveal > 0.7 ? "#ff6a3d" : "#72d5dc"}} />
        <div style={{fontSize: 24, letterSpacing: 2, color: "#b8cbd6"}}>SHARP CORNER / FATIGUE INITIATION</div>
      </div>
    </div>
  );
};

export default Renderer;
