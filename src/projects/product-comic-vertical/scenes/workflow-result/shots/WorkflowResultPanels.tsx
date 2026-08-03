import type { CSSProperties, FC } from "react";
import { Easing, interpolate, spring } from "remotion";

const COLORS = {
  ink: "#171717",
  paper: "#f7f1df",
  accent: "#f05b3d",
  support: "#3b78cc",
  muted: "#c9c0aa",
  white: "#fffdf6",
  paleBlue: "#dbe8fb",
} as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const labelStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontWeight: 850,
  letterSpacing: 0.6,
};

const Person: FC<{
  kind: "producer" | "checker";
  x: number;
  y: number;
  scale: number;
}> = ({ kind, x, y, scale }) => {
  const producer = kind === "producer";
  return (
    <div
      data-character={kind}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 132,
        height: 174,
        scale,
        transformOrigin: "bottom center",
      }}
    >
      <svg viewBox="0 0 132 174" width="132" height="174" aria-hidden="true">
        <path
          d={
            producer
              ? "M31 154 Q22 108 35 68 Q50 39 68 42 Q95 46 102 77 Q112 117 98 154 Z"
              : "M27 154 L32 74 L54 43 L97 53 L108 154 Z"
          }
          fill={COLORS.white}
          stroke={COLORS.ink}
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <circle
          cx={producer ? 65 : 72}
          cy="43"
          r="29"
          fill={COLORS.paper}
          stroke={COLORS.ink}
          strokeWidth="8"
        />
        {producer ? (
          <path
            d="M29 83 L15 51 L41 65 Z"
            fill={COLORS.accent}
            stroke={COLORS.ink}
            strokeWidth="5"
          />
        ) : (
          <>
            <rect
              x="63"
              y="34"
              width="24"
              height="24"
              rx="3"
              fill={COLORS.support}
              stroke={COLORS.ink}
              strokeWidth="5"
            />
            <rect
              x="78"
              y="98"
              width="42"
              height="52"
              rx="5"
              fill={COLORS.paper}
              stroke={COLORS.ink}
              strokeWidth="5"
            />
            <path
              d="M86 113 H112 M86 126 H109 M86 139 H105"
              stroke={COLORS.support}
              strokeWidth="5"
            />
          </>
        )}
      </svg>
      <div
        style={{
          ...labelStyle,
          position: "absolute",
          left: -22,
          right: -22,
          bottom: -38,
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

const EvidenceRow: FC<{
  label: string;
  detail: string;
  index: number;
  frame: number;
  current: boolean;
}> = ({ label, detail, index, frame, current }) => {
  const reveal = spring({
    frame: frame - (132 + index * 28),
    fps: 30,
    config: { damping: 20, mass: 0.72, stiffness: 170 },
  });
  return (
    <div
      data-evidence={label}
      data-state={current ? "current" : "checking"}
      style={{
        width: 402,
        minHeight: 112,
        border: `5px solid ${current ? COLORS.support : COLORS.ink}`,
        borderRadius: 14,
        background: current ? COLORS.paleBlue : COLORS.white,
        display: "grid",
        gridTemplateColumns: "52px 1fr",
        alignItems: "center",
        columnGap: 16,
        padding: "16px 18px",
        boxSizing: "border-box",
        opacity: reveal,
        translate: `${28 * (1 - reveal)}px 0`,
        boxShadow: `7px 8px 0 ${current ? COLORS.support : COLORS.muted}`,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: `5px solid ${current ? COLORS.support : COLORS.ink}`,
          borderRadius: 999,
          color: current ? COLORS.support : COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          fontWeight: 950,
        }}
      >
        ✓
      </div>
      <div>
        <div style={{ ...labelStyle, fontSize: 38, lineHeight: 1.05 }}>
          {label}
        </div>
        <div
          style={{
            ...labelStyle,
            marginTop: 7,
            fontSize: 36,
            lineHeight: 1.05,
            color: COLORS.support,
          }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
};

const FactChip: FC<{
  label: string;
  index: number;
  frame: number;
  current: boolean;
}> = ({ label, index, frame, current }) => {
  const reveal = interpolate(
    frame,
    [254 + index * 16, 290 + index * 16],
    [0, 1],
    {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    },
  );
  return (
    <div
      data-proof={label}
      style={{
        minHeight: 68,
        border: `4px solid ${current ? COLORS.support : COLORS.ink}`,
        borderRadius: 999,
        background: current ? COLORS.support : COLORS.white,
        color: current ? COLORS.white : COLORS.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 17px",
        boxSizing: "border-box",
        fontFamily: "system-ui, sans-serif",
        fontWeight: 900,
        fontSize: 36,
        opacity: reveal,
        scale: 0.84 + reveal * 0.16,
      }}
    >
      {label}
    </div>
  );
};

export const WorkflowResultPanels: FC<{
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}> = ({ sceneFrame, durationInFrames, width, height }) => {
  const scale = Math.min(width / 1080, height / 1920);
  const frameBuild = interpolate(sceneFrame, [0, 58], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const entry = interpolate(sceneFrame, [12, 80], [0, 1], clamp);
  const preview = spring({
    frame: sceneFrame - 86,
    fps: 30,
    config: { damping: 19, mass: 0.8, stiffness: 150 },
  });
  const proof = interpolate(sceneFrame, [228, 288], [0, 1], clamp);
  const current = sceneFrame >= 356;
  const stamp = spring({
    frame: sceneFrame - 356,
    fps: 30,
    config: { damping: 12, mass: 0.62, stiffness: 240 },
  });
  const borderColor = current ? COLORS.support : COLORS.ink;

  return (
    <div
      data-scene-state={
        current ? "current-evidence-bound" : "delivery-checking"
      }
      data-reference-mode="inspiration-only-frame-snap"
      data-duration-in-frames={durationInFrames}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1920,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          overflow: "hidden",
          background: COLORS.paper,
        }}
      >
        <svg
          viewBox="0 0 1080 1920"
          style={{ position: "absolute", inset: 0 }}
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="workflow-result-tone"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="4" cy="4" r="2" fill={COLORS.muted} opacity="0.32" />
            </pattern>
          </defs>
          <path
            d="M0 0 H1080 V1920 H0 Z"
            fill="url(#workflow-result-tone)"
            opacity="0.19"
          />
          <path
            d="M95 214 C214 246 214 326 184 412 C154 505 168 654 226 721 C284 789 284 958 238 1062 C201 1148 252 1260 404 1384"
            fill="none"
            stroke={COLORS.support}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray="1540"
            strokeDashoffset={1540 * (1 - entry)}
          />
          <path
            d="M56 1470 H1024"
            stroke={COLORS.muted}
            strokeWidth="3"
            strokeDasharray="15 18"
          />
        </svg>

        <div
          data-frame-state={current ? "current" : "checking"}
          style={{
            position: "absolute",
            left: 44 - 22 * (1 - frameBuild),
            top: 74 - 28 * (1 - frameBuild),
            width: 992 + 44 * (1 - frameBuild),
            height: 1374 + 56 * (1 - frameBuild),
            border: `${8 + frameBuild * 6}px solid ${borderColor}`,
            borderRadius: 30,
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        />

        <section
          data-panel="delivery-title"
          style={{
            position: "absolute",
            left: 72,
            top: 112,
            width: 936,
            height: 214,
            border: `6px solid ${COLORS.ink}`,
            borderRadius: 20,
            background: COLORS.white,
            padding: "28px 38px",
            boxSizing: "border-box",
            opacity: entry,
            translate: `0 ${28 * (1 - entry)}px`,
          }}
        >
          <div style={{ ...labelStyle, fontSize: 36, color: COLORS.support }}>
            SEALED · STATIC · EVIDENCE-BOUND
          </div>
          <div
            style={{
              ...labelStyle,
              marginTop: 17,
              fontSize: 68,
              lineHeight: 1,
            }}
          >
            交付的不只<span style={{ color: COLORS.support }}>成片</span>
          </div>
        </section>

        <section
          data-panel="delivery-preview"
          style={{
            position: "absolute",
            left: 72,
            top: 360,
            width: 456,
            height: 598,
            border: `7px solid ${COLORS.ink}`,
            borderRadius: 20,
            background: COLORS.white,
            overflow: "hidden",
            opacity: preview,
            scale: 0.84 + preview * 0.16,
            transformOrigin: "top left",
            boxShadow: `10px 13px 0 ${current ? COLORS.support : COLORS.muted}`,
          }}
        >
          <div
            style={{
              height: 64,
              background: COLORS.ink,
              color: COLORS.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 22px",
              ...labelStyle,
              fontSize: 36,
            }}
          >
            <span>FINAL PREVIEW</span>
            <span style={{ color: COLORS.support }}>▶</span>
          </div>
          <div
            style={{
              position: "relative",
              height: 444,
              margin: 20,
              border: `5px solid ${COLORS.ink}`,
              borderRadius: 14,
              background: COLORS.paper,
              overflow: "hidden",
            }}
          >
            <svg
              viewBox="0 0 406 444"
              width="406"
              height="444"
              aria-hidden="true"
            >
              <path
                d="M42 58 H364 V168 H42 Z"
                fill={COLORS.white}
                stroke={COLORS.ink}
                strokeWidth="6"
              />
              <path
                d="M42 193 H188 V344 H42 Z M214 193 H364 V344 H214 Z"
                fill={COLORS.white}
                stroke={COLORS.ink}
                strokeWidth="6"
              />
              <path
                d="M84 104 H314"
                stroke={COLORS.support}
                strokeWidth="14"
                strokeLinecap="round"
              />
              <circle
                cx="116"
                cy="266"
                r="40"
                fill={COLORS.accent}
                stroke={COLORS.ink}
                strokeWidth="6"
              />
              <path
                d="M252 235 H328 M252 270 H316 M252 305 H336"
                stroke={COLORS.support}
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M50 340 H356"
                stroke={COLORS.support}
                strokeWidth="8"
                strokeDasharray="16 11"
              />
            </svg>
            <div
              style={{
                ...labelStyle,
                position: "absolute",
                left: 28,
                right: 28,
                bottom: 32,
                fontSize: 36,
                color: COLORS.support,
                textAlign: "center",
              }}
            >
              checksum bound
            </div>
          </div>
          <div
            style={{
              ...labelStyle,
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 15,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 36,
            }}
          >
            <span>H.264 · AAC</span>
            <span>1080×1920</span>
          </div>
        </section>

        <section
          data-panel="delivery-evidence"
          style={{
            position: "absolute",
            left: 558,
            top: 360,
            width: 450,
            height: 598,
            border: `6px solid ${COLORS.ink}`,
            borderRadius: 20,
            background: COLORS.paper,
            padding: "28px 24px",
            boxSizing: "border-box",
            opacity: preview,
          }}
        >
          <div style={{ ...labelStyle, fontSize: 40 }}>随片交付</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              marginTop: 24,
            }}
          >
            <EvidenceRow
              label="媒体参数"
              detail="ffprobe"
              index={0}
              frame={sceneFrame}
              current={current}
            />
            <EvidenceRow
              label="完整解码"
              detail="EOF PASS"
              index={1}
              frame={sceneFrame}
              current={current}
            />
            <EvidenceRow
              label="批量 REVIEW"
              detail="visual + sound"
              index={2}
              frame={sceneFrame}
              current={current}
            />
          </div>
        </section>

        <section
          data-panel="gps-proof"
          style={{
            position: "absolute",
            left: 72,
            top: 994,
            width: 936,
            height: 354,
            border: `6px solid ${borderColor}`,
            borderRadius: 20,
            background: current ? COLORS.paleBlue : COLORS.white,
            padding: "28px 32px",
            boxSizing: "border-box",
            opacity: proof,
            translate: `0 ${24 * (1 - proof)}px`,
          }}
        >
          <div style={{ ...labelStyle, fontSize: 42 }}>
            GPS 当前实证 <span style={{ color: COLORS.support }}>可复核</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
              marginTop: 24,
            }}
          >
            {["M1–M8 完成", "5 SCENES", "全局装配", "用户批准", "最终检查"].map(
              (label, index) => (
                <FactChip
                  key={label}
                  label={label}
                  index={index}
                  frame={sceneFrame}
                  current={current}
                />
              ),
            )}
          </div>
        </section>

        <Person kind="producer" x={90} y={1150} scale={0.72 + proof * 0.08} />
        <Person kind="checker" x={858} y={1150} scale={0.72 + stamp * 0.08} />

        <div
          data-evidence-stamp={current ? "current" : "pending"}
          data-continuity="identity-invalidation-runtime-boundary-next"
          style={{
            position: "absolute",
            left: 230,
            top: 1366,
            width: 620,
            height: 78,
            border: `7px solid ${current ? COLORS.support : COLORS.ink}`,
            borderRadius: 16,
            background: current ? COLORS.support : COLORS.white,
            color: current ? COLORS.white : COLORS.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 950,
            fontSize: 38,
            letterSpacing: 1,
            opacity: current ? 1 : 0.22,
            rotate: `${current ? -1.5 + 1.5 * stamp : 0}deg`,
            scale: current ? 0.78 + stamp * 0.22 : 1,
            boxShadow: current ? "8px 9px 0 #171717" : "none",
          }}
        >
          {current ? "CURRENT · EVIDENCE BOUND" : "CHECKING EVIDENCE"}
        </div>
      </div>
    </div>
  );
};
