import type {CSSProperties, FC, ReactNode} from "react";
import {Easing, interpolate, spring} from "remotion";

const COLORS = {
  ink: "#171717",
  paper: "#f7f1df",
  accent: "#f05b3d",
  support: "#3b78cc",
  muted: "#c9c0aa",
  white: "#fffdf6",
  paleBlue: "#dbe8fb",
  paleCoral: "#fbd8cf",
} as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const typeStyle: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontWeight: 850,
  letterSpacing: 0.5,
};

const stageProgress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const InkPerson: FC<{
  kind: "producer" | "checker";
  left: number;
  top: number;
  frame: number;
}> = ({kind, left, top, frame}) => {
  const producer = kind === "producer";
  const breathe = interpolate(Math.sin(frame / 13), [-1, 1], [-2, 2]);
  return (
    <div
      data-character={kind}
      style={{
        position: "absolute",
        left,
        top,
        width: 104,
        height: 136,
        transform: `translateY(${breathe}px)`,
      }}
    >
      <svg viewBox="0 0 104 136" width="104" height="136" aria-hidden="true">
        <path
          d={
            producer
              ? "M23 125 Q17 82 27 51 Q40 31 54 34 Q76 37 82 59 Q89 91 79 125 Z"
              : "M20 125 L24 58 L43 35 L78 42 L86 125 Z"
          }
          fill={COLORS.white}
          stroke={COLORS.ink}
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <circle
          cx={producer ? 50 : 56}
          cy="33"
          r="23"
          fill={COLORS.paper}
          stroke={COLORS.ink}
          strokeWidth="7"
        />
        {producer ? (
          <path
            d="M23 63 L9 39 L34 48 Z"
            fill={COLORS.accent}
            stroke={COLORS.ink}
            strokeWidth="5"
          />
        ) : (
          <>
            <rect
              x="48"
              y="25"
              width="20"
              height="20"
              rx="2"
              fill={COLORS.support}
              stroke={COLORS.ink}
              strokeWidth="4"
            />
            <rect
              x="61"
              y="76"
              width="32"
              height="43"
              rx="4"
              fill={COLORS.paper}
              stroke={COLORS.ink}
              strokeWidth="4"
            />
            <path
              d="M67 87 H87 M67 97 H85 M67 107 H82"
              stroke={COLORS.support}
              strokeWidth="4"
            />
          </>
        )}
      </svg>
    </div>
  );
};

const Milestone: FC<{
  number: string;
  y: number;
  progress: number;
  active: boolean;
}> = ({number, y, progress, active}) => {
  const scale = 0.72 + progress * 0.28 + (active ? 0.05 : 0);
  return (
    <div
      style={{
        ...typeStyle,
        position: "absolute",
        left: 91,
        top: y,
        width: 78,
        height: 78,
        borderRadius: 999,
        border: `7px solid ${COLORS.ink}`,
        background: progress > 0.6 ? COLORS.support : COLORS.paper,
        color: progress > 0.6 ? COLORS.white : COLORS.ink,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: 36,
        transform: `scale(${scale})`,
        boxShadow: active ? `0 0 0 10px ${COLORS.paleBlue}` : "none",
        zIndex: 5,
      }}
    >
      {number}
    </div>
  );
};

const Panel: FC<{
  top: number;
  height: number;
  progress: number;
  children: ReactNode;
  state: string;
}> = ({top, height, progress, children, state}) => (
  <section
    data-panel={state}
    style={{
      position: "absolute",
      left: 190,
      top,
      width: 818,
      height,
      border: `6px solid ${COLORS.ink}`,
      borderRadius: 20,
      background: COLORS.white,
      boxShadow: `-10px 13px 0 ${progress > 0.72 ? COLORS.support : COLORS.muted}`,
      opacity: progress,
      transform: `translateX(${70 * (1 - progress)}px) scale(${0.94 + progress * 0.06})`,
      overflow: "hidden",
      boxSizing: "border-box",
    }}
  >
    {children}
  </section>
);

const PanelTitle: FC<{eyebrow: string; title: string; active: boolean}> = ({
  eyebrow,
  title,
  active,
}) => (
  <div
    style={{
      position: "absolute",
      left: 28,
      right: 28,
      top: 20,
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 18,
    }}
  >
    <div style={{...typeStyle, fontSize: 36, color: COLORS.accent}}>
      {eyebrow}
    </div>
    <div
      style={{
        ...typeStyle,
        fontSize: 42,
        color: active ? COLORS.support : COLORS.ink,
        textAlign: "right",
      }}
    >
      {title}
    </div>
  </div>
);

const WaveRibbon: FC<{
  label: string;
  selected: boolean;
  progress: number;
  phase: number;
}> = ({label, selected, progress, phase}) => {
  const bars = [18, 34, 52, 27, 62, 42, 71, 38, 57, 31, 48, 25];
  return (
    <div
      data-pcm-state={selected ? "selected" : "candidate"}
      style={{
        position: "relative",
        height: 56,
        border: `5px solid ${selected ? COLORS.support : COLORS.ink}`,
        borderRadius: 12,
        background: selected ? COLORS.paleBlue : COLORS.paper,
        display: "flex",
        alignItems: "center",
        padding: "0 16px 0 68px",
        opacity: progress,
        transform: `translateX(${(1 - progress) * 42}px)`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          ...typeStyle,
          position: "absolute",
          left: 16,
          fontSize: 36,
          color: selected ? COLORS.support : COLORS.ink,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 44,
          flex: 1,
        }}
      >
        {bars.map((height, index) => {
          const pulse = 0.72 + 0.28 * Math.sin((phase + index) * 0.8);
          return (
            <div
              key={`${label}-${index}`}
              style={{
                width: 8,
                height: Math.max(10, height * pulse),
                borderRadius: 99,
                background: selected ? COLORS.support : COLORS.muted,
              }}
            />
          );
        })}
      </div>
      {selected ? (
        <div
          style={{
            ...typeStyle,
            position: "absolute",
            right: 14,
            fontSize: 36,
            color: COLORS.support,
          }}
        >
          ✓
        </div>
      ) : null}
    </div>
  );
};

const EvidenceChip: FC<{
  label: string;
  index: number;
  frame: number;
}> = ({label, index, frame}) => {
  const pop = spring({
    frame: frame - (306 + index * 34),
    fps: 30,
    config: {damping: 18, stiffness: 170, mass: 0.68},
  });
  return (
    <div
      data-reference-binding={label}
      style={{
        ...typeStyle,
        position: "relative",
        height: 91,
        border: `5px solid ${COLORS.ink}`,
        borderRadius: 14,
        background: pop > 0.8 ? COLORS.paleBlue : COLORS.paper,
        boxShadow: `6px 7px 0 ${pop > 0.8 ? COLORS.support : COLORS.muted}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: 36,
        opacity: pop,
        transform: `translateY(${32 * (1 - pop)}px) scale(${0.86 + 0.14 * pop})`,
      }}
    >
      {label}
      <div
        style={{
          position: "absolute",
          right: 10,
          top: 8,
          width: 21,
          height: 21,
          borderRadius: 999,
          background: pop > 0.8 ? COLORS.support : COLORS.muted,
        }}
      />
    </div>
  );
};

const BoundaryBadge: FC<{label: string; progress: number}> = ({
  label,
  progress,
}) => (
  <div
    style={{
      ...typeStyle,
      border: `4px solid ${COLORS.ink}`,
      borderRadius: 999,
      background: COLORS.paper,
      color: COLORS.ink,
      padding: "8px 14px",
      fontSize: 36,
      opacity: progress,
      transform: `translateY(${20 * (1 - progress)}px)`,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </div>
);

const RegistryLock: FC<{frame: number}> = ({frame}) => {
  const packageIn = stageProgress(frame, 476, 525);
  const registryIn = stageProgress(frame, 514, 564);
  const bind = stageProgress(frame, 548, 590);
  const sealed = stageProgress(frame, 590, 625);
  const lockBounce = spring({
    frame: frame - 590,
    fps: 30,
    config: {damping: 14, stiffness: 210, mass: 0.6},
  });
  return (
    <>
      <div
        data-system-object="scene-package-panel"
        style={{
          ...typeStyle,
          position: "absolute",
          left: 30,
          top: 94,
          width: 306,
          height: 116,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 16,
          background: COLORS.paper,
          boxShadow: `7px 8px 0 ${COLORS.accent}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 36,
          whiteSpace: "nowrap",
          opacity: packageIn,
          transform: `translateX(${-48 * (1 - packageIn)}px)`,
        }}
      >
        <div>SCENE PACKAGE</div>
        <div style={{fontSize: 36, color: COLORS.accent}}>VISUAL + SFX</div>
      </div>

      <svg
        viewBox="0 0 150 100"
        style={{
          position: "absolute",
          left: 336,
          top: 105,
          width: 116,
          height: 100,
          overflow: "visible",
          opacity: bind,
        }}
        aria-hidden="true"
      >
        <path
          d="M5 50 H96"
          stroke={COLORS.support}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="96"
          strokeDashoffset={96 * (1 - bind)}
        />
        <path
          d="M80 29 L110 50 L80 71"
          fill="none"
          stroke={COLORS.support}
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div
        data-binding="static-registry"
        style={{
          ...typeStyle,
          position: "absolute",
          right: 30,
          top: 94,
          width: 324,
          height: 116,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 16,
          background: COLORS.paleBlue,
          boxShadow: `7px 8px 0 ${COLORS.support}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 36,
          whiteSpace: "nowrap",
          opacity: registryIn,
          transform: `translateX(${48 * (1 - registryIn)}px)`,
        }}
      >
        <div>STATIC REGISTRY</div>
        <div style={{fontSize: 36, color: COLORS.support}}>Renderer→Scene</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 314,
          top: 190,
          width: 128,
          height: 128,
          opacity: sealed,
          transform: `scale(${0.62 + lockBounce * 0.38}) rotate(${(1 - sealed) * -8}deg)`,
          zIndex: 6,
        }}
      >
        <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
          <path
            d="M36 58 V41 Q36 16 64 16 Q92 16 92 41 V58"
            fill="none"
            stroke={COLORS.ink}
            strokeWidth="12"
            strokeLinecap="round"
          />
          <rect
            x="22"
            y="54"
            width="84"
            height="62"
            rx="14"
            fill={COLORS.support}
            stroke={COLORS.ink}
            strokeWidth="9"
          />
          <path d="M64 73 V96" stroke={COLORS.white} strokeWidth="10" strokeLinecap="round" />
        </svg>
      </div>

      <div
        style={{
          position: "absolute",
          left: 28,
          right: 28,
          top: 286,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <BoundaryBadge label="旁白不改" progress={sealed} />
        <BoundaryBadge label="字幕顶层" progress={sealed} />
        <BoundaryBadge label="帧不吞" progress={sealed} />
      </div>
    </>
  );
};

export const WorkflowCreationChain: FC<{
  sceneFrame: number;
  durationInFrames: number;
}> = ({sceneFrame, durationInFrames}) => {
  const inputIn = stageProgress(sceneFrame, 0, 62);
  const pcmIn = stageProgress(sceneFrame, 84, 142);
  const selection = stageProgress(sceneFrame, 170, 238);
  const referenceIn = stageProgress(sceneFrame, 270, 324);
  const bindingIn = stageProgress(sceneFrame, 448, 500);
  const finalIn = stageProgress(sceneFrame, 620, 680);
  const exitSettle = stageProgress(
    sceneFrame,
    durationInFrames - 78,
    durationInFrames - 20,
  );
  const travel = stageProgress(sceneFrame, 42, 628);
  const travelY = interpolate(travel, [0, 1], [302, 1280], clamp);
  const currentStage =
    sceneFrame < 270 ? "pcm-seal" : sceneFrame < 448 ? "reference-binding" : "scene-binding";
  const chainState =
    finalIn > 0.72
      ? "sealed-static-evidence-bound"
      : bindingIn > 0.6
        ? "static-binding"
        : referenceIn > 0.6
          ? "reference-closure"
          : pcmIn > 0.6
            ? "pcm-selection"
            : "verified-input";

  return (
    <div
      data-chain-state={chainState}
      data-active-stage={currentStage}
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
          <pattern id="workflow-create-tone" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="2.1" fill={COLORS.muted} opacity="0.32" />
          </pattern>
        </defs>
        <path d="M0 0 H1080 V1920 H0 Z" fill="url(#workflow-create-tone)" opacity="0.17" />
        <path d="M52 86 L1028 64" stroke={COLORS.ink} strokeWidth="7" />
        <path d="M54 1470 H1026" stroke={COLORS.muted} strokeWidth="3" strokeDasharray="14 18" />
        <path
          d="M130 272 V1360"
          stroke={COLORS.muted}
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M130 272 V1360"
          stroke={COLORS.support}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="1088"
          strokeDashoffset={1088 * (1 - travel)}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: 106,
          top: travelY,
          width: 48,
          height: 48,
          borderRadius: 999,
          border: `7px solid ${COLORS.ink}`,
          background: COLORS.accent,
          transform: `scale(${0.9 + Math.sin(sceneFrame / 7) * 0.08})`,
          zIndex: 8,
        }}
      />

      <header
        style={{
          position: "absolute",
          left: 72,
          top: 108,
          width: 936,
          height: 132,
          border: `7px solid ${COLORS.ink}`,
          borderRadius: 20,
          background: COLORS.white,
          boxShadow: `-10px 12px 0 ${COLORS.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          boxSizing: "border-box",
          opacity: inputIn,
          transform: `translateY(${36 * (1 - inputIn)}px)`,
        }}
      >
        <div>
          <div style={{...typeStyle, fontSize: 36, color: COLORS.accent}}>WORKFLOW / CREATE</div>
          <div style={{...typeStyle, fontSize: 58, lineHeight: 1}}>VERIFIED INPUT</div>
        </div>
        <div
          style={{
            ...typeStyle,
            border: `5px solid ${COLORS.support}`,
            borderRadius: 999,
            background: COLORS.paleBlue,
            padding: "12px 22px",
            fontSize: 36,
            color: COLORS.support,
          }}
        >
          PACKET ✓
        </div>
      </header>

      <Milestone number="01" y={368} progress={pcmIn} active={currentStage === "pcm-seal"} />
      <Panel top={270} height={330} progress={pcmIn} state="pcm-seal">
        <PanelTitle eyebrow="01 / VOXCPM" title="候选 → PCM 封存" active={selection > 0.5} />
        <div
          style={{
            position: "absolute",
            left: 30,
            top: 92,
            width: 430,
            display: "grid",
            gap: 11,
          }}
        >
          <WaveRibbon label="A" selected={false} progress={stageProgress(sceneFrame, 102, 148)} phase={sceneFrame / 7} />
          <WaveRibbon label="B" selected progress={stageProgress(sceneFrame, 130, 180)} phase={sceneFrame / 6} />
          <WaveRibbon label="C" selected={false} progress={stageProgress(sceneFrame, 154, 202)} phase={sceneFrame / 8} />
        </div>
        <div
          data-pcm-authority="sealed"
          style={{
            ...typeStyle,
            position: "absolute",
            right: 26,
            top: 105,
            width: 282,
            height: 174,
            border: `6px solid ${COLORS.ink}`,
            borderRadius: 18,
            background: selection > 0.72 ? COLORS.paleBlue : COLORS.paper,
            boxShadow: `8px 9px 0 ${selection > 0.72 ? COLORS.support : COLORS.muted}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            padding: "14px 8px",
            boxSizing: "border-box",
            lineHeight: 1,
            textAlign: "center",
            opacity: selection,
            transform: `scale(${0.82 + selection * 0.18}) rotate(${(1 - selection) * 4}deg)`,
          }}
        >
          <div style={{fontSize: 36, color: COLORS.support}}>SEALED PCM</div>
          <div style={{fontSize: 36}}>实测采样数</div>
          <div style={{fontSize: 36, color: COLORS.support}}>CHECKSUM ✓</div>
        </div>
        <InkPerson kind="producer" left={-2} top={188} frame={sceneFrame} />
      </Panel>

      <Milestone number="02" y={714} progress={referenceIn} active={currentStage === "reference-binding"} />
      <Panel top={620} height={330} progress={referenceIn} state="reference-binding">
        <PanelTitle eyebrow="02 / REFERENCE" title="来源与闭包绑定" active={sceneFrame > 390} />
        <div
          style={{
            position: "absolute",
            left: 30,
            right: 30,
            top: 106,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          {["冻结来源", "准确 DEMO", "依赖闭包", "LICENSE"].map((label, index) => (
            <EvidenceChip key={label} label={label} index={index} frame={sceneFrame} />
          ))}
        </div>
        <InkPerson kind="checker" left={684} top={195} frame={sceneFrame} />
      </Panel>

      <Milestone number="03" y={1102} progress={bindingIn} active={currentStage === "scene-binding"} />
      <Panel top={980} height={432} progress={bindingIn} state="scene-binding">
        <PanelTitle eyebrow="03 / RENDERER" title="Scene 静态绑定" active={sceneFrame >= 590} />
        <RegistryLock frame={sceneFrame} />
      </Panel>

      <div
        style={{
          ...typeStyle,
          position: "absolute",
          left: 195,
          top: 1354,
          width: 690,
          height: 82,
          border: `6px solid ${COLORS.ink}`,
          borderRadius: 999,
          background: finalIn > 0.7 ? COLORS.support : COLORS.paper,
          color: finalIn > 0.7 ? COLORS.white : COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          opacity: finalIn,
          transform: `translateY(${28 * (1 - finalIn) - exitSettle * 5}px) scale(${0.9 + finalIn * 0.1})`,
          boxShadow: `0 10px 0 ${COLORS.ink}`,
        }}
      >
        SEALED · STATIC · EVIDENCE-BOUND
      </div>
    </div>
  );
};
