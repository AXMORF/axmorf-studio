import type {CSSProperties, FC} from "react";
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
  fontWeight: 850,
  letterSpacing: 1,
};

const Person: FC<{
  kind: "producer" | "checker";
  x: number;
  y: number;
  scale: number;
}> = ({kind, x, y, scale}) => {
  const producer = kind === "producer";
  return (
    <div
      data-character={kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 142,
        height: 190,
        scale,
        transformOrigin: "bottom center",
      }}
    >
      <svg viewBox="0 0 142 190" width="142" height="190" aria-hidden="true">
        <path
          d={
            producer
              ? "M35 166 Q24 115 38 72 Q53 42 72 45 Q101 49 108 82 Q118 125 104 166 Z"
              : "M30 166 L35 78 L58 47 L104 57 L116 166 Z"
          }
          fill={COLORS.white}
          stroke={COLORS.ink}
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <circle
          cx={producer ? 68 : 76}
          cy="47"
          r="31"
          fill={COLORS.paper}
          stroke={COLORS.ink}
          strokeWidth="8"
        />
        {producer ? (
          <path
            d="M31 90 L17 57 L43 70 Z"
            fill={COLORS.accent}
            stroke={COLORS.ink}
            strokeWidth="5"
          />
        ) : (
          <>
            <rect
              x="67"
              y="37"
              width="25"
              height="25"
              rx="3"
              fill={COLORS.support}
              stroke={COLORS.ink}
              strokeWidth="5"
            />
            <rect
              x="84"
              y="106"
              width="43"
              height="55"
              rx="5"
              fill={COLORS.paper}
              stroke={COLORS.ink}
              strokeWidth="5"
            />
            <path d="M92 121 H119 M92 134 H116 M92 147 H111" stroke={COLORS.support} strokeWidth="5" />
          </>
        )}
      </svg>
      <div
        style={{
          ...labelStyle,
          position: "absolute",
          left: -10,
          right: -10,
          bottom: -40,
          fontSize: 36,
          textAlign: "center",
          color: producer ? COLORS.accent : COLORS.support,
        }}
      >
        {producer ? "PRODUCER" : "CHECKER"}
      </div>
    </div>
  );
};

const AuthorityCard: FC<{
  label: string;
  index: number;
  frame: number;
  stale: boolean;
}> = ({label, index, frame, stale}) => {
  const reveal = spring({
    frame: frame - (76 + index * 18),
    fps: 30,
    config: {damping: 18, mass: 0.7, stiffness: 170},
  });
  const boil = Math.floor(Math.max(0, frame - 76) / 3 + index) % 4;
  const dx = [0, 2, -2, 1][boil] ?? 0;
  const dy = [0, -1, 2, -2][boil] ?? 0;
  return (
    <div
      data-authority={label}
      data-state={stale ? "stale" : "connected"}
      style={{
        position: "relative",
        width: 162,
        height: 154,
        opacity: reveal,
        scale: 0.84 + reveal * 0.16,
        translate: `${dx}px ${dy}px`,
        border: `6px solid ${stale ? COLORS.accent : COLORS.ink}`,
        borderRadius: 16,
        background: COLORS.white,
        boxShadow: `${-7 + dx}px ${9 + dy}px 0 ${stale ? COLORS.accent : COLORS.muted}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{...labelStyle, fontSize: 39, color: COLORS.ink}}>{label}</div>
      <div
        style={{
          ...labelStyle,
          marginTop: 15,
          borderRadius: 999,
          padding: "5px 12px",
          fontSize: 36,
          color: stale ? COLORS.white : COLORS.support,
          background: stale ? COLORS.accent : "#dbe8fb",
        }}
      >
        {stale ? "旧证据" : "已对应"}
      </div>
      {stale ? (
        <svg
          viewBox="0 0 162 154"
          style={{position: "absolute", inset: 0, overflow: "visible"}}
          aria-hidden="true"
        >
          <path d="M18 18 L144 136 M144 18 L18 136" stroke={COLORS.accent} strokeWidth="10" strokeLinecap="round" />
        </svg>
      ) : null}
    </div>
  );
};

export const ProblemHookPanels: FC<{
  sceneFrame: number;
  durationInFrames: number;
}> = ({sceneFrame, durationInFrames}) => {
  const headlineIn = spring({
    frame: sceneFrame,
    fps: 30,
    config: {damping: 20, stiffness: 160},
  });
  const inputChange = interpolate(sceneFrame, [276, 314], [0, 1], clamp);
  const invalidation = interpolate(sceneFrame, [314, 366], [0, 1], clamp);
  const finalState = interpolate(sceneFrame, [405, 478], [0, 1], clamp);
  const threadProgress = interpolate(sceneFrame, [118, 238], [0, 1], clamp);
  const chainReveal = interpolate(sceneFrame, [58, 102], [0, 1], clamp);
  const driftReveal = interpolate(sceneFrame, [228, 282], [0, 1], clamp);
  const settle = interpolate(
    sceneFrame,
    [durationInFrames - 88, durationInFrames - 26],
    [0, 1],
    clamp,
  );
  const stale = invalidation > 0.46;

  return (
    <div
      data-scene-state={
        finalState > 0.7 ? "identity-protected" : stale ? "evidence-broken" : "authorities-connected"
      }
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
          <pattern id="problem-hook-tone" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="2.3" fill={COLORS.muted} opacity="0.34" />
          </pattern>
        </defs>
        <path d="M0 0 H1080 V1920 H0 Z" fill="url(#problem-hook-tone)" opacity="0.18" />
        <path d="M50 115 L1030 75" stroke={COLORS.ink} strokeWidth="7" />
        <path d="M45 1450 L1035 1450" stroke={COLORS.muted} strokeWidth="3" strokeDasharray="14 18" />
      </svg>

      <section
        data-panel="claim"
        style={{
          position: "absolute",
          left: 72,
          top: 132,
          width: 936,
          height: 290,
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 22,
          background: COLORS.white,
          boxShadow: "-12px 15px 0 #171717",
          padding: "42px 48px",
          boxSizing: "border-box",
          opacity: headlineIn,
          translate: `0 ${36 * (1 - headlineIn)}px`,
        }}
      >
        <div style={{...labelStyle, fontSize: 36, color: COLORS.accent}}>完整视频生产</div>
        <div style={{...labelStyle, marginTop: 18, fontSize: 77, lineHeight: 1.06}}>
          不只是<span style={{color: COLORS.accent}}>画面</span>
        </div>
        <div style={{...labelStyle, marginTop: 18, fontSize: 36, color: COLORS.support}}>
          多种权威必须对应
        </div>
      </section>

      <section
        data-panel="authority-chain"
        style={{
          position: "absolute",
          left: 72,
          top: 456,
          width: 936,
          height: 388,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 20,
          background: COLORS.paper,
          padding: "70px 26px 34px",
          boxSizing: "border-box",
          opacity: chainReveal,
          translate: `0 ${28 * (1 - chainReveal)}px`,
        }}
      >
        <div style={{...labelStyle, position: "absolute", left: 34, top: 22, fontSize: 36}}>
          一条作品身份链
        </div>
        <svg viewBox="0 0 884 220" style={{position: "absolute", left: 26, top: 92, width: 884, height: 220}} aria-hidden="true">
          <path
            d="M78 102 C210 45 270 160 396 103 S590 52 806 103"
            fill="none"
            stroke={stale ? COLORS.accent : COLORS.support}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray="880"
            strokeDashoffset={880 * (1 - threadProgress)}
          />
          {stale ? (
            <>
              <circle cx="442" cy="102" r={26 + invalidation * 14} fill={COLORS.paper} stroke={COLORS.accent} strokeWidth="10" />
              <path d="M422 80 L462 124 M462 80 L422 124" stroke={COLORS.accent} strokeWidth="9" />
            </>
          ) : null}
        </svg>
        <div style={{position: "relative", display: "flex", justifyContent: "space-between", gap: 12}}>
          {["故事", "旁白", "镜头", "声音", "审核"].map((label, index) => (
            <AuthorityCard key={label} label={label} index={index} frame={sceneFrame} stale={stale && index > 0} />
          ))}
        </div>
      </section>

      <section
        data-panel="drift"
        style={{
          position: "absolute",
          left: 72,
          top: 880,
          width: 936,
          height: 480,
          border: `6px solid ${stale ? COLORS.accent : COLORS.ink}`,
          borderRadius: 20,
          background: COLORS.white,
          overflow: "hidden",
          opacity: driftReveal,
          translate: `0 ${30 * (1 - driftReveal)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: COLORS.accent,
            opacity: inputChange * 0.08,
          }}
        />
        <Person kind="producer" x={42} y={190} scale={0.9 + inputChange * 0.08} />
        <div
          data-input-state={stale ? "changed" : "current"}
          style={{
            position: "absolute",
            left: 245,
            top: 78,
            width: 420,
            height: 292,
            border: `7px solid ${stale ? COLORS.accent : COLORS.ink}`,
            borderRadius: 16,
            background: COLORS.paper,
            rotate: `${-2 + inputChange * 4}deg`,
            padding: "32px",
            boxSizing: "border-box",
            boxShadow: `12px 14px 0 ${stale ? COLORS.accent : COLORS.support}`,
          }}
        >
          <div style={{...labelStyle, fontSize: 36, color: stale ? COLORS.accent : COLORS.support}}>
            INPUT {stale ? "CHANGED" : "CURRENT"}
          </div>
          <div style={{...labelStyle, marginTop: 38, fontSize: 58, lineHeight: 1.08}}>
            输入一变
          </div>
          <div style={{...labelStyle, marginTop: 24, fontSize: 36, color: COLORS.ink}}>
            下游身份必须重算
          </div>
        </div>
        <Person kind="checker" x={742} y={190} scale={0.9 + finalState * 0.08} />
        <svg viewBox="0 0 936 480" style={{position: "absolute", inset: 0}} aria-hidden="true">
          <path d="M190 260 C230 220 235 206 260 202" fill="none" stroke={COLORS.ink} strokeWidth="8" markerEnd="url(#none)" />
          <path d="M664 210 C712 190 740 207 770 246" fill="none" stroke={stale ? COLORS.accent : COLORS.support} strokeWidth="9" strokeDasharray="18 12" />
        </svg>
        <div
          style={{
            ...labelStyle,
            position: "absolute",
            right: 42,
            top: 14,
            fontSize: 36,
            color: stale ? COLORS.accent : COLORS.support,
            opacity: Math.max(0.15, invalidation),
          }}
        >
          {stale ? "旧字幕 · 旧镜头 · 旧预览 → STALE" : "机械核对身份"}
        </div>
      </section>

      <div
        data-final-claim="protect-work-identity"
        style={{
          position: "absolute",
          left: 120,
          top: 1378,
          width: 840,
          height: 72,
          borderRadius: 999,
          background: finalState > 0.55 ? COLORS.support : COLORS.ink,
          color: COLORS.white,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 39,
          letterSpacing: 2,
          opacity: finalState,
          scale: 0.9 + settle * 0.1,
        }}
      >
        难点：守住作品身份
      </div>
    </div>
  );
};
