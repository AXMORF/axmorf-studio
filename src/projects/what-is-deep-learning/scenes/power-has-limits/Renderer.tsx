import type {FC} from "react";
import {interpolate} from "remotion";

type RendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Renderer: FC<RendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  if (
    storyId !== "what-is-deep-learning" ||
    meaningId !== "power-has-limits" ||
    durationInFrames !== 466 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920 ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error("power-has-limits Renderer received stale Scene identity.");
  }

  const intro = interpolate(sceneFrame, [0, 28], [0, 1], clamp);
  const familiar = interpolate(sceneFrame, [38, 78], [0, 1], clamp);
  const shift = interpolate(sceneFrame, [86, 132], [0, 1], clamp);
  const warning = interpolate(sceneFrame, [118, 172], [0, 1], clamp);
  const definition = interpolate(sceneFrame, [216, 274], [0, 1], clamp);
  const settle = interpolate(sceneFrame, [286, 354], [0, 1], clamp);
  const riskFade = interpolate(sceneFrame, [216, 286], [1, 0.28], clamp);
  const flow = (sceneFrame * 7) % 260;

  return (
    <div
      data-scene="power-has-limits"
      style={{position: "absolute", inset: 0, overflow: "hidden"}}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 900,
          opacity: intro,
          color: "#F4F7FF",
          fontFamily:
            '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div style={{fontSize: 38, color: "#65DDF0", fontWeight: 760}}>
          能力边界
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 58,
            lineHeight: 1.12,
            fontWeight: 850,
            letterSpacing: -1,
          }}
        >
          识别模式，不等于理解世界
        </div>
      </div>

      <svg
        aria-hidden="true"
        width="900"
        height="850"
        viewBox="0 0 900 850"
        style={{position: "absolute", left: 0, top: 180, fontSize: 36}}
      >
        <path
          d="M95 170L245 100L245 240L395 90L395 250"
          fill="none"
          stroke="#65DDF0"
          strokeWidth="5"
          opacity={0.22 + intro * 0.46}
        />
        <path
          d="M95 360L245 300L245 430L395 290L395 450"
          fill="none"
          stroke="#9E7BFF"
          strokeWidth="5"
          opacity={0.22 + intro * 0.56}
        />
        {[170, 360].map((y) => (
          <circle key={`input-${y}`} cx="95" cy={y} r="27" fill="#65DDF0" opacity={intro} />
        ))}
        {[100, 240, 300, 430].map((y) => (
          <circle key={`hidden-${y}`} cx="245" cy={y} r="24" fill="#9E7BFF" opacity={intro} />
        ))}
        {[90, 250, 290, 450].map((y) => (
          <circle key={`deep-${y}`} cx="395" cy={y} r="22" fill="#9E7BFF" opacity={intro} />
        ))}
        <rect x="58" y="520" width="374" height="104" rx="30" fill="#171A36" stroke="#9E7BFF" strokeWidth="3" opacity={intro} />
        <text x="245" y="586" textAnchor="middle" fill="#DDD4FF" fontSize="38" fontWeight="760" opacity={intro}>
          学到的是模式
        </text>

        <rect x="500" y="70" width="340" height="235" rx="34" fill="#102E39" stroke="#65DDF0" strokeWidth="4" opacity={familiar * (1 - definition)} />
        <text x="538" y="126" fill="#BFF6FF" fontSize="38" fontWeight="760" opacity={familiar * (1 - definition)}>
          熟悉的数据
        </text>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <circle
            key={`familiar-${index}`}
            cx={560 + (index % 3) * 92}
            cy={178 + Math.floor(index / 3) * 70}
            r="17"
            fill="#65DDF0"
            opacity={familiar * (1 - definition)}
          />
        ))}
        <path d="M435 188H498" stroke="#65DDF0" strokeWidth="6" opacity={familiar * (1 - definition)} />
        <circle cx={454 + flow * 0.16} cy="188" r="9" fill="#E9FCFF" opacity={familiar * (1 - definition)} />

        <rect x="500" y="350" width="340" height="260" rx="34" fill="#3A1924" stroke="#FF6F7D" strokeWidth="4" opacity={shift * riskFade} />
        <text x="538" y="408" fill="#FFC1C7" fontSize="38" fontWeight="760" opacity={shift * riskFade}>
          条件变了
        </text>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <circle
            key={`shift-${index}`}
            cx={555 + (index % 2) * 146 + (index % 3) * 12}
            cy={466 + Math.floor(index / 2) * 54}
            r="17"
            fill={index % 2 === 0 ? "#FF6F7D" : "#65DDF0"}
            opacity={shift * riskFade}
          />
        ))}
        <path d="M435 474H498" stroke="#FF6F7D" strokeWidth="6" opacity={shift * riskFade} />
        <path d="M752 648L790 714H714Z" fill="#FF6F7D" opacity={warning * riskFade} />
        <text x="752" y="700" textAnchor="middle" fill="#35101A" fontSize="40" fontWeight="900" opacity={warning * riskFade}>
          !
        </text>
        <text x="500" y="704" fill="#FFC1C7" fontSize="40" fontWeight="800" opacity={warning * riskFade}>
          自信地犯错
        </text>
      </svg>

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 1040,
          width: 900,
          height: 310,
          opacity: definition,
          color: "#F4F7FF",
          fontFamily:
            '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div style={{fontSize: 40, color: "#CFC3FF", fontWeight: 760}}>
          深度学习
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 18, marginTop: 30}}>
          <div style={{fontSize: 38, padding: "18px 22px", borderRadius: 22, border: "3px solid #65DDF0", color: "#BFF6FF", fontWeight: 780}}>
            数据
          </div>
          <div style={{fontSize: 42, color: "#7488A5", fontWeight: 800}}>→</div>
          <div style={{fontSize: 38, padding: "18px 22px", borderRadius: 22, border: "3px solid #9E7BFF", color: "#DDD4FF", fontWeight: 780}}>
            多层网络
          </div>
          <div style={{fontSize: 42, color: "#7488A5", fontWeight: 800}}>→</div>
          <div style={{fontSize: 38, padding: "18px 22px", borderRadius: 22, border: "3px solid #65DDF0", color: "#BFF6FF", fontWeight: 780}}>
            模式能力
          </div>
        </div>
        <div style={{fontSize: 38, marginTop: 34, color: "#AEBBD0", fontWeight: 680, opacity: settle}}>
          能力来自训练，也受数据与场景限制
        </div>
      </div>
    </div>
  );
};

export default Renderer;
