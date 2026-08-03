import type {CSSProperties, FC, ReactNode} from "react";
import {AbsoluteFill, interpolate, spring} from "remotion";

type CapabilityCascadeProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

type NodeCardProps = Readonly<{
  children: ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  startFrame: number;
  shotFrame: number;
  fps: number;
  accent?: "ink" | "blue" | "coral";
  dataNode: string;
}>;

const colors = {
  ink: "#171717",
  paper: "#f7f1df",
  accent: "#f05b3d",
  support: "#3b78cc",
  muted: "#c9c0aa",
} as const;

const inkShadow = "10px 12px 0 rgba(23,23,23,0.12)";

const NodeCard: FC<NodeCardProps> = ({
  children,
  x,
  y,
  width,
  height,
  startFrame,
  shotFrame,
  fps,
  accent = "ink",
  dataNode,
}) => {
  const reveal = interpolate(
    shotFrame,
    [startFrame, startFrame + 18],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );
  const cardScale = spring({
    fps,
    frame: Math.max(0, shotFrame - startFrame),
    config: {damping: 18, stiffness: 150, mass: 0.7},
  });
  const borderColor =
    accent === "blue"
      ? colors.support
      : accent === "coral"
        ? colors.accent
        : colors.ink;

  return (
    <div
      data-node={dataNode}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        boxSizing: "border-box",
        border: `6px solid ${borderColor}`,
        borderRadius: 18,
        background: colors.paper,
        boxShadow: inkShadow,
        color: colors.ink,
        opacity: reveal,
        scale: `${0.82 + cardScale * 0.18}`,
        transformOrigin: "50% 50%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 18,
          background: borderColor,
        }}
      />
      {children}
    </div>
  );
};

const CharacterBadge: FC<{
  side: "left" | "right";
  label: string;
  character: "producer" | "checker";
}> = ({side, label, character}) => (
  <div
    data-character={character}
    style={{
      position: "absolute",
      left: side === "left" ? 102 : 810,
      top: 220,
      width: 168,
      height: 98,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      border: `5px solid ${colors.ink}`,
      borderRadius: side === "left" ? "48px 18px 18px 48px" : "18px 48px 48px 18px",
      background: side === "left" ? colors.accent : colors.support,
      color: colors.paper,
      fontFamily: "system-ui, sans-serif",
      fontSize: 36,
      fontWeight: 900,
      letterSpacing: 1,
    }}
  >
    <span
      style={{
        width: 38,
        height: 38,
        border: `4px solid ${colors.paper}`,
        borderRadius: character === "producer" ? 999 : 7,
        background: colors.ink,
      }}
    />
    {label}
  </div>
);

const phaseOpacity = (frame: number, start: number) =>
  interpolate(frame, [start, start + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const pathProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const specCards = [
  {label: "VideoBrief", detail: "目标与边界", x: 132, y: 478, start: 62},
  {label: "StorySpec", detail: "Beat 与意义", x: 552, y: 478, start: 84},
  {label: "NarrationSpec", detail: "朗读决策", x: 132, y: 624, start: 106},
  {label: "RenderSpec", detail: "画布与输出", x: 552, y: 624, start: 128},
] as const;

const specLineStyle: CSSProperties = {
  position: "absolute",
  left: 34,
  right: 20,
  top: 18,
  color: colors.ink,
  fontFamily: "system-ui, sans-serif",
  fontSize: 42,
  fontWeight: 900,
  letterSpacing: -1,
};

export const CapabilityCascade: FC<CapabilityCascadeProps> = ({
  shotFrame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  const typedCount = Math.floor(
    interpolate(shotFrame, [8, 52], [1, 11], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const rootText = "主题进入生产链".slice(0, typedCount);
  const settlePulse = interpolate(
    shotFrame,
    [452, 460, 468],
    [1, 1.035, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  return (
    <AbsoluteFill
      data-safe-bottom="1470"
      data-scene="core-capabilities"
      style={{
        width,
        height,
        backgroundColor: colors.paper,
        color: colors.ink,
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <svg
        aria-hidden="true"
        width={width}
        height={height}
        viewBox="0 0 1080 1920"
        style={{position: "absolute", inset: 0}}
      >
        <defs>
          <pattern id="core-dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="3" fill={colors.muted} opacity="0.45" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="1080" height="1920" fill={colors.paper} />
        <rect x="0" y="0" width="1080" height="1920" fill="url(#core-dot-grid)" opacity="0.35" />
        <path d="M 88 108 L 992 108" stroke={colors.ink} strokeWidth="8" />
        <path d="M 88 1440 L 992 1440" stroke={colors.ink} strokeWidth="8" />
        <path
          d="M 540 418 L 540 450 M 540 450 L 322 450 L 322 478 M 540 450 L 742 450 L 742 478 M 540 450 L 322 450 L 322 624 M 540 450 L 742 450 L 742 624"
          fill="none"
          stroke={colors.support}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={pathProgress(shotFrame, 48, 145)}
        />
        <path
          d="M 322 756 L 322 780 L 540 780 M 742 756 L 742 780 L 540 780 L 540 806"
          fill="none"
          stroke={colors.support}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={pathProgress(shotFrame, 148, 228)}
        />
        <path
          d="M 540 932 L 540 972"
          fill="none"
          stroke={colors.support}
          strokeWidth="10"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={pathProgress(shotFrame, 246, 304)}
        />
        <path
          d="M 540 1118 L 540 1154"
          fill="none"
          stroke={colors.support}
          strokeWidth="10"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={pathProgress(shotFrame, 324, 382)}
        />
        <path
          d="M 540 1270 L 540 1290 L 320 1290 L 320 1310 M 540 1290 L 760 1290 L 760 1310"
          fill="none"
          stroke={colors.support}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={pathProgress(shotFrame, 394, 446)}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: 88,
          top: 120,
          fontSize: 38,
          fontWeight: 900,
          letterSpacing: 7,
        }}
      >
        SYSTEM 04 · 可验证系统
      </div>
      <div
        style={{
          position: "absolute",
          left: 88,
          top: 174,
          color: colors.support,
          fontSize: 36,
          fontWeight: 900,
        }}
      >
        IDENTITY THREAD · CURRENT
      </div>

      <CharacterBadge side="left" label="创作" character="producer" />
      <CharacterBadge side="right" label="检查" character="checker" />

      <NodeCard
        x={296}
        y={304}
        width={488}
        height={114}
        startFrame={4}
        shotFrame={shotFrame}
        fps={fps}
        accent="ink"
        dataNode="authored-root"
      >
        <div
          style={{
            position: "absolute",
            left: 38,
            right: 24,
            top: 20,
            fontSize: 48,
            fontWeight: 950,
            letterSpacing: 1,
          }}
        >
          {rootText}
          <span style={{color: colors.accent}}>▌</span>
        </div>
      </NodeCard>

      {specCards.map((card) => (
        <NodeCard
          key={card.label}
          x={card.x}
          y={card.y}
          width={396}
          height={132}
          startFrame={card.start}
          shotFrame={shotFrame}
          fps={fps}
          accent="blue"
          dataNode={card.label}
        >
          <div style={specLineStyle}>{card.label}</div>
          <div
            style={{
              position: "absolute",
              left: 34,
              right: 20,
              bottom: 13,
              color: colors.support,
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            {card.detail}
          </div>
        </NodeCard>
      ))}

      <NodeCard
        x={132}
        y={806}
        width={816}
        height={146}
        startFrame={220}
        shotFrame={shotFrame}
        fps={fps}
        accent="ink"
        dataNode="semantic-tts-chunks"
      >
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 14,
            fontSize: 44,
            fontWeight: 950,
          }}
        >
          ttsChunks
        </div>
        <div
          style={{
            position: "absolute",
            left: 280,
            top: 18,
            color: colors.support,
            fontSize: 40,
            fontWeight: 900,
          }}
        >
          语义 · 语气 · 节奏
        </div>
        <div
          style={{
            position: "absolute",
            left: 280,
            top: 82,
            color: colors.accent,
            fontSize: 36,
            fontWeight: 900,
            opacity: phaseOpacity(shotFrame, 238),
          }}
        >
          ≠ 按标点机械拆分
        </div>
      </NodeCard>

      <NodeCard
        x={132}
        y={972}
        width={816}
        height={146}
        startFrame={292}
        shotFrame={shotFrame}
        fps={fps}
        accent="blue"
        dataNode="sealed-pcm"
      >
        <div
          style={{
            position: "absolute",
            left: 38,
            top: 14,
            fontSize: 44,
            fontWeight: 950,
          }}
        >
          SEALED PCM
        </div>
        <div
          style={{
            position: "absolute",
            right: 28,
            top: 18,
            color: colors.support,
            fontSize: 38,
            fontWeight: 900,
          }}
        >
          唯一时间权威
        </div>
        <svg
          aria-label="sealed mono PCM waveform"
          width="720"
          height="52"
          viewBox="0 0 720 52"
          style={{position: "absolute", left: 48, bottom: 12}}
        >
          <path
            d="M 0 26 L 22 26 L 34 8 L 48 44 L 64 16 L 82 35 L 104 26 L 132 26 L 148 11 L 168 41 L 188 18 L 210 34 L 238 26 L 270 26 L 286 6 L 304 46 L 324 14 L 346 38 L 372 26 L 406 26 L 422 10 L 442 43 L 462 17 L 484 35 L 512 26 L 548 26 L 564 8 L 584 44 L 606 16 L 628 36 L 656 26 L 720 26"
            fill="none"
            stroke={colors.support}
            strokeWidth="8"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={pathProgress(shotFrame, 304, 338)}
          />
        </svg>
      </NodeCard>

      <NodeCard
        x={132}
        y={1154}
        width={816}
        height={116}
        startFrame={370}
        shotFrame={shotFrame}
        fps={fps}
        accent="blue"
        dataNode="absolute-frame-boundary"
      >
        <div
          style={{
            position: "absolute",
            left: 38,
            top: 18,
            fontSize: 40,
            fontWeight: 950,
          }}
        >
          累计整数 sample-frame
        </div>
        <div
          style={{
            position: "absolute",
            right: 34,
            top: 15,
            color: colors.support,
            fontSize: 44,
            fontWeight: 950,
          }}
        >
          → 绝对帧
        </div>
        <div
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            bottom: 14,
            height: 8,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${colors.support} ${interpolate(
              shotFrame,
              [378, 408],
              [0, 100],
              {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
            )}%, ${colors.muted} 0%)`,
          }}
        />
      </NodeCard>

      <div
        style={{
          position: "absolute",
          left: 132,
          top: 1310,
          width: 376,
          height: 96,
          boxSizing: "border-box",
          border: `6px solid ${colors.ink}`,
          borderRadius: 18,
          background: colors.ink,
          color: colors.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          fontWeight: 950,
          opacity: phaseOpacity(shotFrame, 420),
          scale: settlePulse,
        }}
      >
        SCENE PACKAGE
      </div>
      <div
        style={{
          position: "absolute",
          right: 132,
          top: 1310,
          width: 376,
          height: 96,
          boxSizing: "border-box",
          border: `6px solid ${colors.support}`,
          borderRadius: 18,
          background: colors.support,
          color: colors.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 38,
          fontWeight: 950,
          opacity: phaseOpacity(shotFrame, 440),
          scale: settlePulse,
        }}
      >
        FINAL ASSEMBLY
      </div>

      <div
        style={{
          position: "absolute",
          left: 88,
          top: 1468,
          width: 904,
          height: 4,
          background: colors.support,
          opacity: 0.18,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 1848,
          color: colors.muted,
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: 4,
        }}
      >
        04 / 10 · CORE CAPABILITIES · {durationInFrames}F
      </div>
    </AbsoluteFill>
  );
};
