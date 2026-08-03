import type {FC, ReactNode} from "react";
import {Easing, interpolate} from "remotion";

const COLORS = {
  paper: "#f6ecd8",
  ink: "#171a22",
  blue: "#3b78cc",
  coral: "#f05b3d",
  amber: "#e9a23b",
  quiet: "#736b60",
} as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Panel: FC<{
  readonly children: ReactNode;
  readonly top: number;
  readonly height: number;
  readonly rotate?: number;
}> = ({children, top, height, rotate = 0}) => (
  <div
    style={{
      position: "absolute",
      left: 64,
      top,
      width: 952,
      height,
      rotate: `${rotate}deg`,
      boxSizing: "border-box",
      border: `6px solid ${COLORS.ink}`,
      borderRadius: 28,
      background: "rgba(255,255,255,0.58)",
      boxShadow: `10px 12px 0 ${COLORS.ink}`,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const EvidenceCard: FC<{
  readonly label: string;
  readonly note: string;
  readonly color: string;
  readonly left: number;
  readonly opacity: number;
  readonly translateY: number;
}> = ({label, note, color, left, opacity, translateY}) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 142,
      width: 258,
      height: 150,
      translate: `0 ${translateY}px`,
      opacity,
      boxSizing: "border-box",
      border: `5px solid ${COLORS.ink}`,
      borderRadius: 20,
      backgroundColor: color,
      padding: "18px 16px",
      color: COLORS.ink,
      boxShadow: `7px 8px 0 ${COLORS.ink}`,
    }}
  >
    <div style={{fontSize: 44, fontWeight: 900, lineHeight: 1}}>{label}</div>
    <div style={{fontSize: 36, fontWeight: 760, marginTop: 15}}>{note}</div>
  </div>
);

const Cursor: FC<{
  readonly name: string;
  readonly role: string;
  readonly color: string;
  readonly left: number;
  readonly top: number;
  readonly scale: number;
  readonly glow: number;
  readonly accessory: "coral-pencil-tab" | "blue-square-lens-checksum-card";
}> = ({name, role, color, left, top, scale, glow, accessory}) => (
  <div
    data-character={name.toLowerCase()}
    data-palette={color}
    data-accessory={accessory}
    style={{
      position: "absolute",
      left,
      top,
      width: 220,
      height: 160,
      scale,
      filter: `drop-shadow(0 0 ${glow}px ${color})`,
    }}
  >
    <div
      style={{
        width: 66,
        height: 88,
        backgroundColor: color,
        clipPath: "polygon(0 0, 100% 62%, 61% 67%, 48% 100%)",
        border: `4px solid ${COLORS.ink}`,
      }}
    />
    {name === "Producer" ? (
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 48,
          width: 20,
          height: 74,
          rotate: "-34deg",
          border: `4px solid ${COLORS.ink}`,
          borderRadius: 6,
          backgroundColor: COLORS.coral,
        }}
      />
    ) : (
      <>
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 34,
            width: 42,
            height: 42,
            boxSizing: "border-box",
            border: `6px solid ${COLORS.ink}`,
            backgroundColor: "#f7f1df",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 12,
            width: 78,
            height: 46,
            boxSizing: "border-box",
            border: `4px solid ${COLORS.ink}`,
            borderRadius: 8,
            backgroundColor: COLORS.blue,
            color: "white",
            fontSize: 36,
            fontWeight: 900,
            textAlign: "center",
            lineHeight: "38px",
          }}
        >
          #✓
        </div>
      </>
    )}
    <div
      style={{
        position: "absolute",
        left: 54,
        top: 60,
        minWidth: 170,
        boxSizing: "border-box",
        border: `4px solid ${COLORS.ink}`,
        borderRadius: 14,
        padding: "8px 12px",
        backgroundColor: color,
        color: "white",
        boxShadow: `4px 5px 0 ${COLORS.ink}`,
      }}
    >
      <div style={{fontSize: 36, fontWeight: 900, lineHeight: 1}}>{name}</div>
      <div style={{fontSize: 36, fontWeight: 750, lineHeight: 1.1}}>{role}</div>
    </div>
  </div>
);

export const ProofAndFitPanels: FC<{readonly sceneFrame: number}> = ({
  sceneFrame,
}) => {
  const repositoryOpacity = interpolate(sceneFrame, [8, 34], [0, 1], clamp);
  const evidenceProgress = [0, 1, 2].map((index) =>
    interpolate(sceneFrame, [100 + index * 32, 126 + index * 32], [0, 1], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    }),
  );
  const dialogueOpacity = interpolate(sceneFrame, [218, 246], [0, 1], clamp);
  const handoffOpacity = interpolate(sceneFrame, [366, 398], [0, 1], clamp);
  const ctaOpacity = interpolate(sceneFrame, [438, 466], [0, 1], clamp);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        backgroundColor: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "Arial, 'Noto Sans SC', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.2,
          backgroundImage:
            "radial-gradient(circle at 12px 14px, #171a22 1.4px, transparent 1.8px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div style={{position: "absolute", left: 66, top: 52, rotate: "-2deg"}}>
        <div style={{fontSize: 42, fontWeight: 900, color: COLORS.coral}}>
          VERIFIED ≠ FINAL DECISION
        </div>
        <div style={{fontSize: 78, fontWeight: 950, lineHeight: 1.02}}>
          适合怎样的团队？
        </div>
        <div
          style={{
            width: interpolate(sceneFrame, [18, 56], [0, 720], clamp),
            height: 18,
            marginTop: 12,
            borderRadius: 12,
            backgroundColor: COLORS.blue,
          }}
        />
      </div>

      <Panel top={208} height={410} rotate={-0.5}>
        <div
          style={{
            position: "absolute",
            left: 26,
            top: 20,
            fontSize: 48,
            fontWeight: 950,
            opacity: repositoryOpacity,
          }}
        >
          同一仓库 · ONE REPO
        </div>
        <div
          style={{
            position: "absolute",
            right: 30,
            top: 24,
            fontSize: 36,
            fontWeight: 850,
            color: COLORS.blue,
            opacity: repositoryOpacity,
          }}
        >
          evidence-bound
        </div>
        <EvidenceCard
          label="创作"
          note="AUTHOR"
          color="#b9d8ff"
          left={30}
          opacity={evidenceProgress[0] ?? 0}
          translateY={interpolate(evidenceProgress[0] ?? 0, [0, 1], [-60, 0])}
        />
        <EvidenceCard
          label="工程"
          note="BUILD"
          color="#c9ebd9"
          left={344}
          opacity={evidenceProgress[1] ?? 0}
          translateY={interpolate(evidenceProgress[1] ?? 0, [0, 1], [-60, 0])}
        />
        <EvidenceCard
          label="审查证据"
          note="CHECK"
          color="#ffd1c7"
          left={658}
          opacity={evidenceProgress[2] ?? 0}
          translateY={interpolate(evidenceProgress[2] ?? 0, [0, 1], [-60, 0])}
        />
      </Panel>

      <Panel top={672} height={500} rotate={0.4}>
        <div style={{position: "absolute", left: 30, top: 22, fontSize: 42, fontWeight: 900}}>
          Agent 分工清楚，Scene 逐段制作
        </div>
        <div
          style={{
            position: "absolute",
            left: 424,
            top: 125,
            width: 98,
            height: 98,
            borderRadius: "50%",
            border: `8px solid ${COLORS.ink}`,
            opacity: dialogueOpacity,
            scale: interpolate(
              sceneFrame % 30,
              [0, 15, 30],
              [0.82, 1.12, 0.82],
              clamp,
            ),
          }}
        />
        <Cursor
          name="Producer"
          role="负责创作"
          color={COLORS.coral}
          left={interpolate(sceneFrame, [220, 276, 330, 360], [-220, 150, 570, 620], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
          top={interpolate(sceneFrame, [220, 276, 330, 360], [250, 190, 92, 120], clamp)}
          scale={interpolate(sceneFrame, [220, 250], [0.78, 1], clamp)}
          glow={interpolate(sceneFrame, [300, 330, 360], [5, 24, 6], clamp)}
          accessory="coral-pencil-tab"
        />
        <Cursor
          name="Checker"
          role="负责校验"
          color={COLORS.blue}
          left={interpolate(sceneFrame, [220, 276, 330, 360], [980, 610, 190, 145], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
          top={interpolate(sceneFrame, [220, 276, 330, 360], [92, 142, 258, 225], clamp)}
          scale={interpolate(sceneFrame, [220, 250], [0.78, 1], clamp)}
          glow={interpolate(sceneFrame, [300, 330, 360], [5, 8, 26], clamp)}
          accessory="blue-square-lens-checksum-card"
        />
        <div
          style={{
            position: "absolute",
            left: 314,
            top: 365,
            fontSize: 38,
            fontWeight: 900,
            color: COLORS.quiet,
            opacity: dialogueOpacity,
          }}
        >
          创作 → 校验 → 证据交接
        </div>
      </Panel>

      <div
        style={{
          position: "absolute",
          left: 74,
          top: 1214,
          width: 932,
          height: 128,
          boxSizing: "border-box",
          border: `7px solid ${COLORS.amber}`,
          borderRadius: 26,
          backgroundColor: "#fff8df",
          boxShadow: `8px 9px 0 ${COLORS.ink}`,
          opacity: handoffOpacity,
          translate: `${interpolate(sceneFrame, [366, 400], [90, 0], clamp)}px 0`,
          padding: "16px 28px",
        }}
      >
        <div style={{fontSize: 38, fontWeight: 900, color: COLORS.coral}}>
          FINAL HANDOFF
        </div>
        <div style={{fontSize: 48, fontWeight: 950, lineHeight: 1}}>
          最终批准 · 只由用户作出
        </div>
        <div
          style={{
            position: "absolute",
            right: 30,
            top: 30,
            width: 72,
            height: 72,
            borderRadius: "50%",
            border: `7px solid ${COLORS.amber}`,
            backgroundColor: COLORS.paper,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 200,
          top: 1370,
          fontSize: 54,
          fontWeight: 950,
          color: COLORS.blue,
          opacity: ctaOpacity,
          translate: `0 ${interpolate(sceneFrame, [438, 466], [35, 0], clamp)}px`,
        }}
      >
        从主题资料开始 →
      </div>
    </div>
  );
};
