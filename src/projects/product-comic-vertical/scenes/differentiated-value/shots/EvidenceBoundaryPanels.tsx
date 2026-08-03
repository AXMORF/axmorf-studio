import type {CSSProperties, FC} from "react";
import {interpolate, spring} from "remotion";

const COLORS = {
  paper: "#f5e9d2",
  white: "#fffaf0",
  ink: "#171717",
  muted: "#756b5d",
  current: "#176b87",
  currentLight: "#cce9ed",
  stale: "#ef684f",
  staleLight: "#ffd8cb",
  yellow: "#f3c64c",
} as const;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const inkText: CSSProperties = {
  color: COLORS.ink,
  fontFamily: "system-ui, sans-serif",
  fontWeight: 900,
  letterSpacing: 1,
};

const Character: FC<{
  kind: "producer" | "checker";
  x: number;
  y: number;
  scale: number;
}> = ({kind, x, y, scale}) => {
  const isProducer = kind === "producer";
  return (
    <div
      data-character={kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 128,
        height: 152,
        scale,
        transformOrigin: "50% 100%",
      }}
    >
      <svg viewBox="0 0 128 152" style={{width: 128, height: 152}}>
        <circle
          cx="64"
          cy="42"
          r="31"
          fill={COLORS.paper}
          stroke={COLORS.ink}
          strokeWidth="7"
        />
        <path
          d={isProducer ? "M34 40 Q64 3 96 40 L90 18 Q62 -1 37 20 Z" : "M36 39 Q64 12 92 39"}
          fill={isProducer ? COLORS.ink : "none"}
          stroke={COLORS.ink}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="53" cy="43" r="4" fill={COLORS.ink} />
        <circle cx="76" cy="43" r="4" fill={COLORS.ink} />
        <path
          d="M54 59 Q64 67 76 58"
          fill="none"
          stroke={COLORS.ink}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M25 147 Q25 82 64 79 Q103 82 103 147 Z"
          fill={isProducer ? COLORS.current : COLORS.yellow}
          stroke={COLORS.ink}
          strokeWidth="7"
        />
        {!isProducer ? (
          <path
            d="M43 39 H60 M69 39 H86 M60 39 H69"
            stroke={COLORS.ink}
            strokeWidth="5"
          />
        ) : null}
      </svg>
    </div>
  );
};

const StageCard: FC<{
  title: string;
  detail: string;
  index: number;
  reveal: number;
}> = ({title, detail, index, reveal}) => {
  const visible = interpolate(reveal, [index * 0.22, index * 0.22 + 0.34], [0, 1], clamp);
  return (
    <div
      style={{
        width: 200,
        height: 150,
        boxSizing: "border-box",
        border: `6px solid ${COLORS.ink}`,
        borderRadius: 16,
        background: COLORS.white,
        boxShadow: `8px 9px 0 ${COLORS.ink}`,
        padding: "22px 18px",
        opacity: visible,
        translate: `0 ${22 * (1 - visible)}px`,
      }}
    >
      <div style={{...inkText, color: COLORS.current, fontSize: 36}}>
        {title}
      </div>
      <div style={{...inkText, marginTop: 16, fontSize: 36}}>{detail}</div>
    </div>
  );
};

const IdentityCard: FC<{
  label: string;
  mechanism: string;
  index: number;
  reveal: number;
}> = ({label, mechanism, index, reveal}) => {
  const visible = interpolate(reveal, [index * 0.25, index * 0.25 + 0.34], [0, 1], clamp);
  return (
    <div
      data-identity={label.toLowerCase()}
      style={{
        position: "relative",
        width: 282,
        height: 164,
        boxSizing: "border-box",
        border: `6px solid ${COLORS.ink}`,
        borderRadius: 16,
        background: COLORS.white,
        padding: "20px 20px",
        opacity: visible,
        translate: `0 ${18 * (1 - visible)}px`,
      }}
    >
      <div style={{...inkText, fontSize: 40}}>{label}</div>
      <div style={{...inkText, marginTop: 18, color: COLORS.current, fontSize: 36}}>
        {mechanism}
      </div>
      <div
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          width: 22,
          height: 22,
          borderRadius: 999,
          background: COLORS.current,
        }}
      />
    </div>
  );
};

export const EvidenceBoundaryPanels: FC<{
  sceneFrame: number;
  durationInFrames: number;
}> = ({sceneFrame, durationInFrames}) => {
  const stampIn = spring({
    frame: sceneFrame,
    fps: 30,
    config: {damping: 17, stiffness: 150},
  });
  const stageReveal = interpolate(sceneFrame, [90, 220], [0, 1], clamp);
  const mutation = interpolate(sceneFrame, [235, 279], [0, 1], clamp);
  const impact = interpolate(sceneFrame, [262, 280], [0, 1], clamp);
  const invalidated = interpolate(sceneFrame, [280, 322], [0, 1], clamp);
  const identityReveal = interpolate(sceneFrame, [305, 405], [0, 1], clamp);
  const runtimeReveal = interpolate(sceneFrame, [430, 494], [0, 1], clamp);
  const settle = interpolate(
    sceneFrame,
    [durationInFrames - 70, durationInFrames - 18],
    [0, 1],
    clamp,
  );
  const shakeEnvelope = interpolate(
    sceneFrame,
    [276, 280, 292],
    [0, 1, 0],
    clamp,
  );
  const shakeX = Math.sin(sceneFrame * 2.6) * 11 * shakeEnvelope;
  const isInvalid = sceneFrame >= 280;

  return (
    <div
      data-scene-state={isInvalid ? "evidence-invalidated" : "evidence-current"}
      data-exit-state={runtimeReveal > 0.7 ? "verified-vs-invalidated" : "forming"}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "system-ui, sans-serif",
        translate: `${shakeX}px 0`,
      }}
    >
      <svg
        viewBox="0 0 1080 1920"
        style={{position: "absolute", inset: 0}}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="differentiated-halftone"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="5" cy="5" r="2.2" fill={COLORS.muted} opacity="0.28" />
          </pattern>
        </defs>
        <path d="M0 0 H1080 V1920 H0 Z" fill="url(#differentiated-halftone)" opacity="0.28" />
        <path d="M48 94 L1032 58" stroke={COLORS.ink} strokeWidth="8" />
        <path d="M52 1460 L1028 1460" stroke={COLORS.muted} strokeWidth="4" strokeDasharray="15 18" />
        <path
          d="M900 120 C1008 180 1010 274 928 322"
          fill="none"
          stroke={COLORS.current}
          strokeWidth="12"
          strokeDasharray="290"
          strokeDashoffset={290 * (1 - Math.min(1, stampIn))}
        />
      </svg>

      <section
        data-panel="current-stamp"
        style={{
          position: "absolute",
          left: 70,
          top: 120,
          width: 940,
          height: 242,
          boxSizing: "border-box",
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 22,
          background: COLORS.white,
          boxShadow: `-12px 14px 0 ${COLORS.ink}`,
          padding: "36px 42px",
          opacity: stampIn,
          translate: `0 ${34 * (1 - stampIn)}px`,
        }}
      >
        <div style={{...inkText, color: COLORS.current, fontSize: 42}}>
          CURRENT EVIDENCE
        </div>
        <div style={{...inkText, marginTop: 15, fontSize: 72, lineHeight: 1.05}}>
          差异来自<span style={{color: COLORS.current}}>可复算</span>
        </div>
        <div
          style={{
            ...inkText,
            position: "absolute",
            right: 36,
            top: 36,
            border: `6px solid ${COLORS.current}`,
            borderRadius: 999,
            color: COLORS.current,
            padding: "12px 22px",
            fontSize: 36,
            rotate: `${-6 + stampIn * 4}deg`,
          }}
        >
          VERIFIED
        </div>
      </section>

      <section
        data-panel="ownership-dependencies"
        style={{
          position: "absolute",
          left: 70,
          top: 400,
          width: 940,
          height: 316,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 20,
          background: COLORS.currentLight,
          boxSizing: "border-box",
          padding: "98px 34px 30px",
          overflow: "hidden",
        }}
      >
        <div style={{...inkText, position: "absolute", left: 34, top: 24, fontSize: 40}}>
          OWNERSHIP × DEPENDENCIES
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            margin: "0 94px",
          }}
        >
          <StageCard title="STORY" detail="owner" index={0} reveal={stageReveal} />
          <StageCard title="SCENE" detail="depends" index={1} reveal={stageReveal} />
          <StageCard title="PROOF" detail="identity" index={2} reveal={stageReveal} />
        </div>
        <Character kind="producer" x={0} y={158} scale={0.63 + stageReveal * 0.06} />
        <Character kind="checker" x={812} y={158} scale={0.63 + stageReveal * 0.06} />
        <svg
          viewBox="0 0 940 316"
          style={{position: "absolute", inset: 0}}
          aria-hidden="true"
        >
          <path
            d="M292 190 H352 M585 190 H645"
            stroke={COLORS.current}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray="120"
            strokeDashoffset={120 * (1 - stageReveal)}
          />
        </svg>
      </section>

      <section
        data-panel="causal-boundary"
        style={{
          position: "absolute",
          left: 70,
          top: 752,
          width: 940,
          height: 338,
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 22,
          background: COLORS.white,
          overflow: "hidden",
          boxShadow: `10px 12px 0 ${COLORS.ink}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 570,
            height: 338,
            background: COLORS.current,
            clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)",
            translate: `${-510 * (1 - impact)}px 0`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 570,
            height: 338,
            background: COLORS.stale,
            clipPath: "polygon(18% 0, 100% 0, 100% 100%, 0 100%)",
            translate: `${510 * (1 - impact)}px 0`,
          }}
        />
        <div
          style={{
            ...inkText,
            position: "absolute",
            left: 42,
            top: 42,
            width: 370,
            color: COLORS.white,
            fontSize: 46,
            opacity: impact,
          }}
        >
          CURRENT
          <div style={{fontSize: 36, marginTop: 20}}>input · identity</div>
        </div>
        <div
          style={{
            ...inkText,
            position: "absolute",
            right: 38,
            top: 42,
            width: 370,
            textAlign: "right",
            color: COLORS.white,
            fontSize: 46,
            opacity: impact,
          }}
        >
          STALE
          <div style={{fontSize: 36, marginTop: 20}}>old · evidence</div>
        </div>
        <div
          data-boundary-state={isInvalid ? "invalidated" : "changing"}
          style={{
            ...inkText,
            position: "absolute",
            left: 260,
            top: 208,
            width: 420,
            border: `7px solid ${COLORS.ink}`,
            borderRadius: 14,
            background: COLORS.yellow,
            textAlign: "center",
            padding: "18px 0",
            boxShadow: `8px 9px 0 ${COLORS.ink}`,
            fontSize: 48,
            opacity: Math.max(mutation * 0.3, invalidated),
            scale: 0.84 + invalidated * 0.16,
            rotate: `${-5 + invalidated * 8}deg`,
          }}
        >
          {isInvalid ? "INVALIDATED" : "INPUT CHANGED"}
        </div>
        <svg
          viewBox="0 0 940 338"
          style={{position: "absolute", inset: 0, opacity: invalidated}}
          aria-hidden="true"
        >
          <path
            d="M500 0 L454 70 L513 128 L462 190 L527 251 L486 338"
            fill="none"
            stroke={COLORS.paper}
            strokeWidth="18"
          />
          <path
            d="M500 0 L454 70 L513 128 L462 190 L527 251 L486 338"
            fill="none"
            stroke={COLORS.ink}
            strokeWidth="7"
          />
        </svg>
      </section>

      <section
        data-panel="separate-identities"
        style={{
          position: "absolute",
          left: 70,
          top: 1122,
          width: 940,
          height: 204,
          display: "flex",
          justifyContent: "space-between",
          gap: 20,
          opacity: identityReveal,
        }}
      >
        <IdentityCard label="TIME" mechanism="FINGERPRINT" index={0} reveal={identityReveal} />
        <IdentityCard label="REFERENCE" mechanism="CHECKSUM" index={1} reveal={identityReveal} />
        <IdentityCard label="APPROVAL" mechanism="RECEIPT" index={2} reveal={identityReveal} />
      </section>

      <section
        data-panel="sealed-runtime"
        style={{
          position: "absolute",
          left: 98,
          top: 1340,
          width: 884,
          height: 106,
          boxSizing: "border-box",
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 18,
          background: runtimeReveal > 0.5 ? COLORS.ink : COLORS.white,
          color: runtimeReveal > 0.5 ? COLORS.white : COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: runtimeReveal,
          scale: 0.9 + settle * 0.1,
          boxShadow: `9px 10px 0 ${COLORS.stale}`,
        }}
      >
        <div style={{...inkText, color: "inherit", fontSize: 36}}>
          NO AGENT · NO NETWORK · NO GIT · NO SCAN
        </div>
      </section>
    </div>
  );
};
