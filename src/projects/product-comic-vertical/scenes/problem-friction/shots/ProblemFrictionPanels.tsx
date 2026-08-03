import type {CSSProperties, FC, ReactNode} from "react";
import {interpolate, spring} from "remotion";

const COLORS = {
  ink: "#171717",
  paper: "#f7f1df",
  accent: "#f05b3d",
  support: "#3b78cc",
  muted: "#c9c0aa",
  white: "#fffdf6",
} as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const labelStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontWeight: 900,
  letterSpacing: 1,
};

const EvidenceRole: FC<{
  kind: "producer" | "checker";
  x: number;
  y: number;
}> = ({kind, x, y}) => {
  const producer = kind === "producer";
  return (
    <div
      data-character={kind}
      style={{position: "absolute", left: x, top: y, width: 108, height: 128}}
    >
      <svg viewBox="0 0 108 128" width="108" height="128" aria-hidden="true">
        <circle
          cx="54"
          cy="35"
          r="27"
          fill={COLORS.paper}
          stroke={COLORS.ink}
          strokeWidth="7"
        />
        <path
          d={producer ? "M19 121 Q22 63 54 62 Q87 63 90 121 Z" : "M15 121 L24 65 L82 65 L94 121 Z"}
          fill={COLORS.white}
          stroke={COLORS.ink}
          strokeWidth="7"
          strokeLinejoin="round"
        />
        {producer ? (
          <path d="M23 61 L9 36 L34 46 Z" fill={COLORS.accent} stroke={COLORS.ink} strokeWidth="4" />
        ) : (
          <rect x="48" y="25" width="23" height="23" rx="3" fill={COLORS.support} stroke={COLORS.ink} strokeWidth="4" />
        )}
      </svg>
    </div>
  );
};

const FrictionPanel: FC<{
  index: number;
  top: number;
  frame: number;
  start: number;
  title: string;
  kicker: string;
  children: ReactNode;
}> = ({index, top, frame, start, title, kicker, children}) => {
  const reveal = spring({
    frame: frame - start,
    fps: 30,
    config: {damping: 19, stiffness: 155, mass: 0.75},
  });
  const boil = Math.floor(Math.max(0, frame - start) / 3 + index) % 4;
  const dx = [0, 2, -2, 1][boil] ?? 0;
  const dy = [0, -1, 2, -2][boil] ?? 0;
  return (
    <section
      data-friction-index={index}
      style={{
        position: "absolute",
        left: 72,
        top,
        width: 936,
        height: 298,
        boxSizing: "border-box",
        overflow: "hidden",
        border: `7px solid ${COLORS.ink}`,
        borderRadius: 20,
        background: COLORS.white,
        boxShadow: `${-10 + dx}px ${12 + dy}px 0 ${index === 3 ? COLORS.accent : COLORS.ink}`,
        opacity: reveal,
        translate: `${(1 - reveal) * (index % 2 === 0 ? 70 : -70) + dx}px ${dy}px`,
        clipPath: `polygon(${index % 2 === 0 ? 4 : 0}% 0, 100% 0, ${index % 2 === 0 ? 96 : 100}% 100%, 0 100%)`,
      }}
    >
      <div
        style={{
          ...labelStyle,
          position: "absolute",
          left: 34,
          top: 25,
          fontSize: 36,
          color: index === 3 ? COLORS.accent : COLORS.support,
        }}
      >
        {String(index).padStart(2, "0")} · {kicker}
      </div>
      <div
        style={{
          ...labelStyle,
          position: "absolute",
          left: 34,
          top: 80,
          fontSize: 58,
          color: COLORS.ink,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
};

export const ProblemFrictionPanels: FC<{
  sceneFrame: number;
  durationInFrames: number;
}> = ({sceneFrame, durationInFrames}) => {
  const thread = interpolate(sceneFrame, [18, 448], [0, 1], clamp);
  const guessedTiming = interpolate(sceneFrame, [104, 176], [0, 1], clamp);
  const approximateReference = interpolate(sceneFrame, [216, 286], [0, 1], clamp);
  const missingEvidence = interpolate(sceneFrame, [316, 374], [0, 1], clamp);
  const conclusion = interpolate(sceneFrame, [420, 470], [0, 1], clamp);
  const settle = interpolate(
    sceneFrame,
    [durationInFrames - 58, durationInFrames - 12],
    [0, 1],
    clamp,
  );
  const cursorOffset = guessedTiming * 148;
  const referenceGap = approximateReference * 45;

  return (
    <div
      data-scene-state={conclusion > 0.7 ? "evidence-chain-awaiting-connection" : "broken-by-drift"}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <svg viewBox="0 0 1080 1920" style={{position: "absolute", inset: 0}} aria-hidden="true">
        <defs>
          <pattern id="problem-friction-tone" width="25" height="25" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="2.2" fill={COLORS.muted} opacity="0.35" />
          </pattern>
        </defs>
        <rect width="1080" height="1920" fill="url(#problem-friction-tone)" opacity="0.2" />
        <path d="M48 104 L1032 72" stroke={COLORS.ink} strokeWidth="7" />
        <path d="M50 1450 L1030 1450" stroke={COLORS.muted} strokeWidth="3" strokeDasharray="14 18" />
        <path
          d="M540 285 C770 390 285 585 540 755 C790 925 300 1095 540 1360"
          fill="none"
          stroke={COLORS.support}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray="1340"
          strokeDashoffset={1340 * (1 - thread)}
        />
        {[552, 898, 1244].map((y, index) => {
          const broken = sceneFrame >= [174, 286, 316][index]!;
          return broken ? (
            <g key={y}>
              <circle cx="540" cy={y} r="25" fill={COLORS.paper} stroke={COLORS.accent} strokeWidth="9" />
              <path d={`M524 ${y - 16} L556 ${y + 16} M556 ${y - 16} L524 ${y + 16}`} stroke={COLORS.accent} strokeWidth="8" />
            </g>
          ) : null;
        })}
      </svg>

      <header
        style={{
          position: "absolute",
          left: 72,
          top: 125,
          width: 936,
          height: 145,
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 20,
          background: COLORS.ink,
          color: COLORS.white,
          boxSizing: "border-box",
          padding: "29px 38px",
          zIndex: 5,
        }}
      >
        <div style={{...labelStyle, fontSize: 36, color: COLORS.accent}}>BROKEN BY DRIFT</div>
        <div style={{...labelStyle, marginTop: 8, fontSize: 48}}>三种制作摩擦</div>
      </header>

      <FrictionPanel index={1} top={306} frame={sceneFrame} start={12} kicker="TIMING" title="先猜时长">
        <svg viewBox="0 0 570 112" style={{position: "absolute", left: 430, top: 144, width: 460, height: 112}} aria-hidden="true">
          <path d="M0 58 H570" stroke={COLORS.muted} strokeWidth="6" />
          {Array.from({length: 18}, (_, index) => {
            const height = 18 + ((index * 17) % 55);
            return <path key={index} d={`M${index * 32 + 8} ${56 - height / 2} V${56 + height / 2}`} stroke={COLORS.support} strokeWidth="8" strokeLinecap="round" />;
          })}
          <path d={`M${96 + cursorOffset} 5 V108`} stroke={COLORS.accent} strokeWidth="10" />
        </svg>
        <div style={{...labelStyle, position: "absolute", left: 34, top: 176, fontSize: 36, color: COLORS.accent}}>
          SCENE / 字幕 → 追波形移动
        </div>
      </FrictionPanel>

      <FrictionPanel index={2} top={652} frame={sceneFrame} start={190} kicker="LINEAGE" title="近似引用">
        <div style={{...labelStyle, position: "absolute", left: 420 - referenceGap, top: 160, width: 190, height: 72, border: `6px solid ${COLORS.ink}`, borderRadius: 12, fontSize: 36, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.paper}}>
          ≈ DEMO
        </div>
        <div style={{...labelStyle, position: "absolute", left: 652 + referenceGap, top: 160, width: 210, height: 72, border: `6px dashed ${COLORS.accent}`, borderRadius: 12, fontSize: 36, color: COLORS.accent, display: "flex", alignItems: "center", justifyContent: "center"}}>
          准确来源？
        </div>
        <svg viewBox="0 0 250 70" style={{position: "absolute", left: 585, top: 162, width: 250, height: 70}} aria-hidden="true">
          <path d="M0 35 H250" stroke={COLORS.accent} strokeWidth="8" strokeDasharray="15 13" />
        </svg>
      </FrictionPanel>

      <FrictionPanel index={3} top={998} frame={sceneFrame} start={286} kicker="EXPORT IDENTITY" title="无 CHECKSUM">
        <div style={{...labelStyle, position: "absolute", left: 34, top: 176, fontSize: 36, color: COLORS.accent}}>
          无审查记录
        </div>
        <div
          data-export-state={missingEvidence > 0.5 ? "unbound" : "pending"}
          style={{
            ...labelStyle,
            position: "absolute",
            right: 52,
            top: 132,
            width: 330,
            height: 108,
            border: `7px solid ${COLORS.accent}`,
            borderRadius: 14,
            background: COLORS.paper,
            color: COLORS.accent,
            fontSize: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            rotate: `${-3 + missingEvidence * 6}deg`,
            scale: 0.9 + missingEvidence * 0.1,
          }}
        >
          导出 ≠ 当前输入
        </div>
      </FrictionPanel>

      <EvidenceRole kind="producer" x={94} y={1312} />
      <EvidenceRole kind="checker" x={878} y={1312} />
      <div
        style={{
          ...labelStyle,
          position: "absolute",
          left: 185,
          top: 1378,
          width: 710,
          height: 70,
          borderRadius: 999,
          background: conclusion > 0.55 ? COLORS.support : COLORS.accent,
          color: COLORS.white,
          fontSize: 39,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: Math.max(0.15, conclusion),
          scale: 0.92 + settle * 0.08,
          zIndex: 4,
        }}
      >
        证据链待连接
      </div>
    </div>
  );
};
