import type {FC} from "react";

type DepthEnablesLearningRendererProps = Readonly<{
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
}>;

const LAYERS = ["输入", "边缘", "形状", "结构", "对象", "语境", "规律", "表示"] as const;
const APPS = [
  {label: "图像", kind: "image"},
  {label: "语音", kind: "voice"},
  {label: "文字", kind: "text"},
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const progress = (frame: number, start: number, duration: number) =>
  clamp((frame - start) / duration);
const smooth = (value: number) => value * value * (3 - 2 * value);

const DepthEnablesLearningRenderer: FC<DepthEnablesLearningRendererProps> = ({
  meaningId,
  sceneFrame,
}) => {
  if (meaningId !== "depth-enables-learning") {
    throw new Error("depth-enables-learning Renderer received another meaningId.");
  }

  const branchProgress = smooth(progress(sceneFrame, 145, 46));
  const applicationOpacity =
    smooth(progress(sceneFrame, 168, 34)) * (1 - smooth(progress(sceneFrame, 270, 38)));
  const confidenceOpacity = smooth(progress(sceneFrame, 274, 28));
  const stackOpacity = 1 - 0.28 * confidenceOpacity;

  return (
    <div
      data-scene="depth-enables-learning"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        color: "#f4f7ff",
        fontFamily: "Inter, Noto Sans SC, sans-serif",
        fontSize: 36,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 190,
          top: 316,
          width: 520,
          height: 895,
          opacity: stackOpacity,
          fontSize: 36,
        }}
      >
        <svg
          aria-hidden="true"
          width="520"
          height="895"
          viewBox="0 0 520 895"
          style={{position: "absolute", inset: 0, fontSize: 36}}
        >
          {LAYERS.slice(0, -1).map((_, index) => {
            const reveal = smooth(progress(sceneFrame, 12 + index * 14, 22));
            const y1 = 817 - index * 105;
            const y2 = y1 - 70;
            return (
              <path
                key={`link-${index}`}
                d={`M260 ${y1} L260 ${y2}`}
                fill="none"
                stroke={index < 2 ? "#55d9ff" : "#9b76ff"}
                strokeWidth="9"
                strokeLinecap="round"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - reveal}
                opacity={0.35 + reveal * 0.65}
              />
            );
          })}
        </svg>

        {LAYERS.map((label, index) => {
          const reveal = smooth(progress(sceneFrame, 4 + index * 14, 22));
          const top = 805 - index * 105;
          const isInput = index === 0;
          return (
            <div
              key={label}
              style={{
                position: "absolute",
                left: 70,
                top,
                width: 380,
                height: 70,
                borderRadius: 24,
                border: `3px solid ${isInput ? "#55d9ff" : "#9b76ff"}`,
                backgroundColor: isInput
                  ? `rgba(85, 217, 255, ${0.08 + reveal * 0.12})`
                  : `rgba(155, 118, 255, ${0.08 + reveal * 0.13})`,
                boxShadow: `0 0 ${12 + reveal * 24}px ${isInput ? "rgba(85, 217, 255, 0.28)" : "rgba(155, 118, 255, 0.3)"}`,
                opacity: 0.16 + reveal * 0.84,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 38,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              {index === 0 ? label : `中间层 ${index}`}
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          top: 54,
          width: 708,
          height: 255,
          opacity: applicationOpacity,
          fontSize: 36,
        }}
      >
        <svg
          aria-hidden="true"
          width="708"
          height="255"
          viewBox="0 0 708 255"
          style={{position: "absolute", inset: 0, fontSize: 36}}
        >
          {[118, 354, 590].map((x) => (
            <path
              key={x}
              d={`M354 255 C354 205 ${x} 206 ${x} 151`}
              fill="none"
              stroke="#9b76ff"
              strokeWidth="7"
              strokeLinecap="round"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - branchProgress}
              opacity={0.42 + branchProgress * 0.58}
            />
          ))}
        </svg>

        <div
          style={{
            position: "absolute",
            left: 292,
            top: 190,
            width: 124,
            height: 54,
            borderRadius: 27,
            backgroundColor: "rgba(155, 118, 255, 0.22)",
            border: "3px solid #9b76ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          复杂表示
        </div>

        {APPS.map((app, index) => (
          <div
            key={app.kind}
            style={{
              position: "absolute",
              left: index * 236 + 18,
              top: 0,
              width: 200,
              height: 142,
              borderRadius: 28,
              border: "3px solid rgba(155, 118, 255, 0.9)",
              backgroundColor: "rgba(19, 25, 58, 0.72)",
              boxShadow: "0 0 24px rgba(155, 118, 255, 0.24)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 38,
              fontWeight: 750,
            }}
          >
            {app.kind === "image" ? (
              <svg aria-hidden="true" width="70" height="50" viewBox="0 0 70 50">
                <rect x="2" y="2" width="66" height="46" rx="9" fill="none" stroke="#55d9ff" strokeWidth="4" />
                <circle cx="50" cy="15" r="6" fill="#55d9ff" />
                <path d="M8 41 L26 24 L39 35 L47 28 L63 42" fill="none" stroke="#9b76ff" strokeWidth="4" strokeLinejoin="round" />
              </svg>
            ) : null}
            {app.kind === "voice" ? (
              <svg aria-hidden="true" width="78" height="50" viewBox="0 0 78 50" style={{fontSize: 36}}>
                {[9, 21, 33, 45, 57, 69].map((x, waveIndex) => (
                  <line key={x} x1={x} y1={25 - (waveIndex % 3) * 8} x2={x} y2={25 + (waveIndex % 3) * 8} stroke="#55d9ff" strokeWidth="5" strokeLinecap="round" />
                ))}
              </svg>
            ) : null}
            {app.kind === "text" ? (
              <svg aria-hidden="true" width="72" height="50" viewBox="0 0 72 50">
                <line x1="5" y1="9" x2="67" y2="9" stroke="#55d9ff" strokeWidth="5" strokeLinecap="round" />
                <line x1="5" y1="25" x2="54" y2="25" stroke="#9b76ff" strokeWidth="5" strokeLinecap="round" />
                <line x1="5" y1="41" x2="62" y2="41" stroke="#55d9ff" strokeWidth="5" strokeLinecap="round" />
              </svg>
            ) : null}
            {app.label}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 180,
          top: 1020,
          width: 540,
          height: 132,
          borderRadius: 30,
          border: "3px solid #9b76ff",
          backgroundColor: "rgba(24, 22, 57, 0.78)",
          boxShadow: "0 0 30px rgba(155, 118, 255, 0.3)",
          opacity: confidenceOpacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 34px",
          boxSizing: "border-box",
          fontSize: 38,
          fontWeight: 750,
        }}
      >
        <span style={{fontSize: 38}}>预测置信</span>
        <span style={{fontSize: 48, color: "#b79cff"}}>92%</span>
        <span style={{fontSize: 38, color: "#ff8b7a"}}>≠ 保证正确</span>
      </div>
    </div>
  );
};

export default DepthEnablesLearningRenderer;
