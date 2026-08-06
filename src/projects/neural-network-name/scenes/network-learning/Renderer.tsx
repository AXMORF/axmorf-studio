import type { FC } from "react";
import { interpolate, spring } from "remotion";

type RendererProps = Readonly<{
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
}>;

const INK = "#2f3431";
const SAGE = "#78a88b";
const SAGE_PALE = "#bad1bd";
const INDIGO = "#415aa8";
const CORAL = "#df735a";

const nodes = [
  { id: "i1", x: 125, y: 355, delay: 0 },
  { id: "i2", x: 125, y: 650, delay: 4 },
  { id: "i3", x: 125, y: 945, delay: 8 },
  { id: "h1", x: 430, y: 275, delay: 12 },
  { id: "h2", x: 430, y: 530, delay: 16 },
  { id: "h3", x: 430, y: 785, delay: 20 },
  { id: "h4", x: 430, y: 1040, delay: 24 },
  { id: "o1", x: 730, y: 520, delay: 28 },
  { id: "o2", x: 730, y: 815, delay: 32 },
] as const;

const connections = [
  { id: "c1", d: "M151 355 C250 351 321 286 404 275", delay: 38 },
  { id: "c2", d: "M151 355 C270 418 322 497 404 530", delay: 41 },
  { id: "c3", d: "M151 650 C262 586 331 542 404 530", delay: 44 },
  { id: "c4", d: "M151 650 C267 700 330 773 404 785", delay: 47 },
  { id: "c5", d: "M151 945 C264 904 325 810 404 785", delay: 50 },
  { id: "c6", d: "M151 945 C262 1010 332 1044 404 1040", delay: 53 },
  { id: "c7", d: "M456 275 C574 321 632 444 704 520", delay: 56 },
  { id: "c8", d: "M456 530 C569 516 635 517 704 520", delay: 59 },
  { id: "c9", d: "M456 785 C566 800 634 812 704 815", delay: 62 },
  { id: "c10", d: "M456 1040 C571 987 637 885 704 815", delay: 65 },
] as const;

const Renderer: FC<RendererProps> = ({ sceneFrame, fps }) => {
  const networkIn = spring({
    frame: sceneFrame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.8 },
  });
  const signalProgress = interpolate(sceneFrame, [65, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const compareIn = interpolate(sceneFrame, [112, 134], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const correctionProgress = interpolate(sceneFrame, [136, 176], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const learnedPulse = interpolate(sceneFrame, [170, 184, 205], [0, 1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <svg
      aria-label="分层连接的人工神经元经过误差修正改变连接权重"
      viewBox="0 0 900 1470"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        fontSize: 36,
      }}
    >
      {connections.map((connection, index) => {
        const reveal = interpolate(
          sceneFrame,
          [connection.delay, connection.delay + 24],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const learnedWidth = index % 3 === 0 ? 5 + learnedPulse * 6 : 5;
        return (
          <g key={connection.id} opacity={networkIn}>
            <path
              d={connection.d}
              fill="none"
              stroke={INK}
              strokeLinecap="round"
              strokeWidth={learnedWidth + 2}
              strokeDasharray="900"
              strokeDashoffset={900 * (1 - reveal)}
              opacity={0.2}
            />
            <path
              d={connection.d}
              fill="none"
              stroke={SAGE}
              strokeLinecap="round"
              strokeWidth={learnedWidth}
              strokeDasharray="900"
              strokeDashoffset={900 * (1 - reveal)}
            />
          </g>
        );
      })}

      {connections.map((connection, index) => {
        const localSignal = interpolate(
          signalProgress,
          [index / 16, Math.min(1, index / 16 + 0.34)],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return (
          <path
            key={`signal-${connection.id}`}
            d={connection.d}
            fill="none"
            stroke={INDIGO}
            strokeLinecap="round"
            strokeWidth={9}
            strokeDasharray="14 34"
            strokeDashoffset={-localSignal * 210}
            opacity={localSignal * (1 - correctionProgress * 0.65)}
          />
        );
      })}

      {nodes.map((node) => {
        const appear = spring({
          frame: sceneFrame - node.delay,
          fps,
          config: { damping: 13, stiffness: 150, mass: 0.65 },
        });
        return (
          <g key={node.id} opacity={appear}>
            <circle
              cx={node.x + 3}
              cy={node.y + 4}
              r={28 + appear * 12}
              fill="none"
              stroke={INK}
              strokeWidth={5}
              opacity={0.32}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={26 + appear * 12}
              fill={SAGE_PALE}
              stroke={INK}
              strokeWidth={6}
            />
            <circle
              cx={node.x - 8}
              cy={node.y - 7}
              r={8 + learnedPulse * 3}
              fill={SAGE}
            />
          </g>
        );
      })}

      <g opacity={compareIn}>
        <path
          d="M770 520 C826 494 852 452 855 400"
          fill="none"
          stroke={CORAL}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray="15 13"
        />
        <circle
          cx={855}
          cy={375}
          r={31}
          fill="none"
          stroke={CORAL}
          strokeWidth={8}
          strokeDasharray="12 9"
        />
        <path
          d="M830 350 L880 400 M880 350 L830 400"
          fill="none"
          stroke={CORAL}
          strokeWidth={7}
          strokeLinecap="round"
        />
      </g>

      <path
        d="M855 375 C790 438 770 574 710 660 C605 814 465 878 335 895 C225 910 170 858 102 800"
        fill="none"
        stroke={CORAL}
        strokeLinecap="round"
        strokeWidth={11}
        strokeDasharray="22 18"
        strokeDashoffset={correctionProgress * 520}
        opacity={correctionProgress}
      />
      <path
        d="M120 785 L92 800 L116 820"
        fill="none"
        stroke={CORAL}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={11}
        opacity={correctionProgress}
      />

      <g opacity={learnedPulse}>
        <path
          d="M318 1170 C385 1210 520 1210 587 1170"
          fill="none"
          stroke={INK}
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d="M566 1149 L590 1170 L563 1189"
          fill="none"
          stroke={INK}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={270} cy={1155} r={22} fill={SAGE} stroke={INK} strokeWidth={5} />
        <circle cx={635} cy={1155} r={31} fill={SAGE} stroke={INK} strokeWidth={8} />
      </g>
    </svg>
  );
};

export default Renderer;
