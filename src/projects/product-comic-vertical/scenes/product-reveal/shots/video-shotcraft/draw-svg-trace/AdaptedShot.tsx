import {Easing, interpolate} from "remotion";

type AdaptedShotProps = Readonly<{
  shotFrame: number;
  durationInFrames: number;
}>;

const stageOpacity = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

export const AdaptedShot = ({shotFrame, durationInFrames}: AdaptedShotProps) => {
  const traceProgress = interpolate(shotFrame, [13, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const flash = interpolate(shotFrame, [80, 83, 93], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const traceOpacity = interpolate(shotFrame, [90, 106], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const contentOpacity = stageOpacity(shotFrame, 80, 93);
  const underlineProgress = interpolate(shotFrame, [113, 143], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const evidenceProgress = interpolate(shotFrame, [150, 183], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      data-exact-reference="draw-svg-trace"
      style={{
        position: "absolute",
        left: 84,
        top: 246,
        width: 912,
        height: 902,
        opacity: interpolate(shotFrame, [0, 8, durationInFrames - 18, durationInFrames - 1], [0.85, 1, 1, 0.94], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: "6px solid #171717",
          borderRadius: 30,
          backgroundColor: "#f7f1df",
          boxShadow: "20px 22px 0 #c9c0aa",
          opacity: contentOpacity,
        }}
      >
        <div
          style={{
            height: 128,
            backgroundColor: "#171717",
            borderRadius: "22px 22px 0 0",
            color: "#f7f1df",
            padding: "24px 38px",
            boxSizing: "border-box",
            fontSize: 42,
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          REMOTION STORY PRODUCER
        </div>
        <div
          style={{
            position: "absolute",
            left: 42,
            top: 164,
            fontSize: 40,
            fontWeight: 900,
          }}
        >
          证据绑定的代码生产链
        </div>
        <div
          style={{
            position: "absolute",
            left: 42,
            top: 244,
            width: 360,
            height: 510,
            border: "5px solid #f05b3d",
            borderRadius: 24,
            padding: 26,
            boxSizing: "border-box",
            fontSize: 36,
            fontWeight: 800,
            lineHeight: 1.55,
          }}
        >
          <div style={{color: "#f05b3d", fontSize: 40}}>AUTHORING</div>
          <div>StoryBeat</div>
          <div>ttsChunks</div>
          <div>ScenePackage</div>
          <div>FinalAssembly</div>
          <div style={{marginTop: 24, fontSize: 36}}>创作决定留在仓库</div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 42,
            top: 244,
            width: 360,
            height: 510,
            border: "5px solid #3b78cc",
            borderRadius: 24,
            padding: 26,
            boxSizing: "border-box",
            fontSize: 36,
            fontWeight: 800,
            lineHeight: 1.55,
          }}
        >
          <div style={{color: "#3b78cc", fontSize: 40}}>RUNTIME</div>
          <div>static registry</div>
          <div>sealed frames</div>
          <div>public assets</div>
          <div>visual projection</div>
          <div style={{marginTop: 24, fontSize: 36}}>只执行冻结投影</div>
        </div>
        <svg width="912" height="902" style={{position: "absolute", inset: 0}}>
          <path
            d="M420 480H492"
            stroke="#171717"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path d="M468 450L504 480L468 510" fill="none" stroke="#171717" strokeWidth="10" strokeLinejoin="round" />
          <path
            d="M92 816H820"
            fill="none"
            stroke="#3b78cc"
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - evidenceProgress}
          />
          <circle cx={92 + 728 * evidenceProgress} cy="816" r="14" fill="#3b78cc" />
        </svg>
      </div>

      <svg width="912" height="902" style={{position: "absolute", inset: 0, overflow: "visible"}}>
        <rect
          x="3"
          y="3"
          width="906"
          height="896"
          rx="30"
          fill="none"
          stroke={flash > 0.45 ? "#171717" : "#3b78cc"}
          strokeWidth={6 + flash * 7}
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - traceProgress}
          strokeLinecap="round"
          opacity={traceOpacity}
        />
        {traceProgress > 0.02 && traceProgress < 0.985 ? (
          <rect
            x="3"
            y="3"
            width="906"
            height="896"
            rx="30"
            fill="none"
            stroke="#171717"
            strokeWidth="12"
            pathLength={1}
            strokeDasharray="0.045 0.955"
            strokeDashoffset={0.045 - traceProgress}
            strokeLinecap="round"
            opacity={traceOpacity}
          />
        ) : null}
        <line
          x1="72"
          y1="350"
          x2="330"
          y2="350"
          stroke="#f05b3d"
          strokeWidth="14"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - underlineProgress}
          strokeLinecap="round"
          opacity={contentOpacity}
        />
      </svg>
    </div>
  );
};
