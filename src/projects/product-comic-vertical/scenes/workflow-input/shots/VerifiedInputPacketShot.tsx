import type {FC, ReactNode} from "react";
import {Easing, interpolate} from "remotion";

type VerifiedInputPacketShotProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
}>;

const INK = "#171717";
const PAPER = "#f7f1df";
const BLUE = "#3b78cc";
const CORAL = "#f05b3d";
const SAND = "#c9c0aa";

const reveal = (frame: number, start: number, duration = 24) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const Check = ({progress}: {readonly progress: number}) => (
  <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
    <circle
      cx="21"
      cy="21"
      r="17"
      fill={BLUE}
      opacity={interpolate(progress, [0, 1], [0.12, 1])}
    />
    <path
      d="M12 21.5l6 6L31 14"
      fill="none"
      stroke={PAPER}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={1 - progress}
    />
  </svg>
);

const RoleBadge = ({
  align,
  label,
  color,
  progress,
}: {
  readonly align: "left" | "right";
  readonly label: string;
  readonly color: string;
  readonly progress: number;
}) => (
  <div
    style={{
      position: "absolute",
      top: 112,
      [align]: 42,
      display: "flex",
      alignItems: "center",
      gap: 14,
      opacity: progress,
      transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        border: `5px solid ${INK}`,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `6px 6px 0 ${INK}`,
      }}
    />
    <div
      style={{
        border: `4px solid ${INK}`,
        backgroundColor: PAPER,
        padding: "8px 15px",
        fontSize: 28,
        fontWeight: 950,
        letterSpacing: 1.5,
      }}
    >
      {label}
    </div>
  </div>
);

const DocumentRow = ({
  label,
  value,
  progress,
}: {
  readonly label: string;
  readonly value: string;
  readonly progress: number;
}) => (
  <div
    style={{
      height: 62,
      display: "grid",
      gridTemplateColumns: "190px 1fr 50px",
      alignItems: "center",
      borderBottom: `3px solid ${INK}`,
      opacity: interpolate(progress, [0, 0.2, 1], [0, 1, 1]),
    }}
  >
    <div style={{fontSize: 32, fontWeight: 900}}>{label}</div>
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontSize: 34,
        fontWeight: 750,
        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
      }}
    >
      {value}
    </div>
    <Check progress={progress} />
  </div>
);

const AuthoringCard = ({
  title,
  note,
  progress,
  verified,
}: {
  readonly title: string;
  readonly note: string;
  readonly progress: number;
  readonly verified: boolean;
}) => (
  <div
    style={{
      position: "relative",
      height: 112,
      border: `4px solid ${INK}`,
      borderRadius: 16,
      backgroundColor: PAPER,
      padding: "16px 20px",
      boxSizing: "border-box",
      opacity: progress,
      transform: `translateY(${interpolate(progress, [0, 1], [24, 0])}px)`,
      boxShadow: `${interpolate(progress, [0, 1], [0, 8])}px 8px 0 ${
        verified ? BLUE : CORAL
      }`,
    }}
  >
    <div style={{fontSize: 34, fontWeight: 950, color: verified ? BLUE : CORAL}}>
      {title}
    </div>
    <div style={{fontSize: 27, fontWeight: 750, marginTop: 5}}>{note}</div>
  </div>
);

const InkLabel = ({children}: {readonly children: ReactNode}) => (
  <div
    style={{
      display: "inline-block",
      padding: "8px 17px",
      backgroundColor: INK,
      color: PAPER,
      fontSize: 28,
      fontWeight: 950,
      letterSpacing: 2,
    }}
  >
    {children}
  </div>
);

export const VerifiedInputPacketShot: FC<VerifiedInputPacketShotProps> = ({
  shotFrame,
  durationInFrames,
}) => {
  const panelIn = reveal(shotFrame, 8, 34);
  const rowStarts = [54, 79, 104, 129, 154] as const;
  const rowProgress = rowStarts.map((start) => reveal(shotFrame, start, 25));
  const authoringProgress = [
    reveal(shotFrame, 222, 32),
    reveal(shotFrame, 262, 32),
    reveal(shotFrame, 318, 32),
    reveal(shotFrame, 390, 34),
  ] as const;
  const packetProgress = reveal(shotFrame, 438, 54);
  const packetSeal = reveal(shotFrame, 494, 28);
  const exitSettle = interpolate(
    shotFrame,
    [durationInFrames - 28, durationInFrames - 1],
    [1, 0.985],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  return (
    <div
      data-shot="verified-input-packet"
      data-reading-order="source-checks,authored-units,verified-packet"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: PAPER,
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
        opacity: exitSettle,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.11,
          backgroundImage:
            "radial-gradient(circle at 20% 18%, #171717 0 1.4px, transparent 1.7px)",
          backgroundSize: "23px 23px",
        }}
      />

      <div style={{position: "absolute", left: 76, top: 74}}>
        <InkLabel>WORKFLOW / INPUT</InkLabel>
        <div style={{fontSize: 64, lineHeight: 1.04, fontWeight: 950, marginTop: 18}}>
          先核对，再创作
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 72,
          top: 244,
          width: 936,
          height: 1018,
          border: `7px solid ${INK}`,
          borderRadius: 28,
          backgroundColor: PAPER,
          boxShadow: `18px 20px 0 ${SAND}`,
          transform: `translateY(${interpolate(panelIn, [0, 1], [44, 0])}px) scale(${interpolate(
            panelIn,
            [0, 1],
            [0.97, 1],
          )})`,
          opacity: panelIn,
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
            backgroundColor: BLUE,
            transformOrigin: "top",
            transform: `scaleY(${interpolate(shotFrame, [20, 510], [0.05, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.inOut(Easing.cubic),
            })})`,
          }}
        />
        <RoleBadge align="left" label="PRODUCER" color={CORAL} progress={panelIn} />
        <RoleBadge align="right" label="CHECKER" color={BLUE} progress={reveal(shotFrame, 24, 30)} />

        <div style={{position: "absolute", left: 52, right: 52, top: 205}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <div style={{fontSize: 36, fontWeight: 950}}>01 主题资料</div>
            <div style={{fontSize: 28, fontWeight: 850, color: BLUE}}>SOURCE CHECK</div>
          </div>
          <div style={{height: 5, backgroundColor: INK, marginTop: 10, marginBottom: 5}} />
          <DocumentRow label="来源" value="repo source packet" progress={rowProgress[0]} />
          <DocumentRow label="可用事实" value="current implementation" progress={rowProgress[1]} />
          <DocumentRow label="观众" value="code-first video maker" progress={rowProgress[2]} />
          <DocumentRow label="时长" value="2–3 min" progress={rowProgress[3]} />
          <DocumentRow label="画幅" value="1080 × 1920" progress={rowProgress[4]} />
        </div>

        <div
          style={{
            position: "absolute",
            left: 52,
            right: 52,
            top: 590,
            borderTop: `5px solid ${INK}`,
            paddingTop: 20,
          }}
        >
          <div style={{fontSize: 36, fontWeight: 950, marginBottom: 16}}>02 创作输入单元</div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
            <AuthoringCard
              title="StoryBeat"
              note="语义与叙事职责"
              progress={authoringProgress[0]}
              verified={false}
            />
            <AuthoringCard
              title="ttsChunks"
              note="语气与朗读节奏"
              progress={authoringProgress[1]}
              verified={false}
            />
            <AuthoringCard
              title="声音选择"
              note="voice profile"
              progress={authoringProgress[2]}
              verified={false}
            />
            <AuthoringCard
              title="StoryCheck ✓"
              note="输入机械核对完成"
              progress={authoringProgress[3]}
              verified
            />
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 114,
          top: 1310,
          width: 852,
          height: 142,
          border: `6px solid ${INK}`,
          borderRadius: 20,
          backgroundColor: BLUE,
          color: PAPER,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
          boxSizing: "border-box",
          opacity: packetProgress,
          transform: `translateY(${interpolate(packetProgress, [0, 1], [36, 0])}px)`,
          boxShadow: `${interpolate(packetSeal, [0, 1], [0, 12])}px 12px 0 ${INK}`,
        }}
      >
        <div>
          <div style={{fontSize: 29, fontWeight: 850, letterSpacing: 2}}>READY FOR PRODUCTION</div>
          <div style={{fontSize: 43, fontWeight: 950, marginTop: 8}}>VERIFIED INPUT PACKET</div>
        </div>
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: "50%",
            border: `6px solid ${PAPER}`,
            transform: `rotate(${interpolate(packetSeal, [0, 1], [-18, 0])}deg) scale(${packetSeal})`,
            display: "grid",
            placeItems: "center",
            fontSize: 44,
            fontWeight: 950,
          }}
        >
          ✓
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 330,
          top: 1454,
          width: 420,
          height: 10,
          backgroundColor: BLUE,
          transformOrigin: "left",
          transform: `scaleX(${packetSeal})`,
        }}
      />
    </div>
  );
};
