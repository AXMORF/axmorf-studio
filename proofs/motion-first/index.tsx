import {
  AbsoluteFill,
  Audio,
  Composition,
  registerRoot,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { CaptionLayer } from "../../packages/studio/src/remotion/runtime/narrative-core/CaptionLayer";
import type { SemanticTiming } from "../../packages/studio/src/contracts/semantic-timing";
import {
  MeaningIdSchema,
  TtsChunkIdSchema,
} from "../../packages/studio/src/contracts/primitives";
import rawCues from "./captions.json";
import { motionState, ramp } from "./state";

const cues: SemanticTiming["captionCues"] = rawCues.map((cue) => ({
  ...cue,
  // Presentation-only break keeps 上下文 intact; timing and spoken text stay exact.
  text:
    cue.chunkId === "learned-patterns-02"
      ? "生成回答时，它根据上下文，\n一步步组织后续内容。"
      : cue.text,
  meaningId: MeaningIdSchema.parse(cue.meaningId),
  chunkId: TtsChunkIdSchema.parse(cue.chunkId),
}));
const ink = "#303e40";
const accent = "#b26147";
const paper = "#fbf7ef";
const line = {
  stroke: ink,
  strokeWidth: 3.5,
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const draw = (amount: number) => ({
  pathLength: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1 - amount,
});

const MotionSample = () => {
  const frame = useCurrentFrame();
  const s = motionState(frame);
  const answerX = 130 + s.check * 25 + s.learning * 25;
  const answerY = 480 - s.check * 95 - s.learning * 40;
  const answerScale = 1 - s.check * 0.04 - s.learning * 0.1;
  const bookY = 930 - s.check * 55 + s.learning * 205;
  const bookScale = 0.96 - s.learning * 0.2;
  const penX = 65 + s.answer * 675;
  return (
    <AbsoluteFill
      style={{
        background: "#ede7da",
        color: ink,
        fontFamily: '"PingFang SC", "Noto Sans SC", sans-serif',
      }}
    >
      <svg viewBox="0 0 1080 1920" width="1080" height="1920">
        <defs>
          <pattern
            id="grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="#d5cfbf"
              strokeWidth="1"
              opacity=".28"
            />
          </pattern>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="14"
              stdDeviation="10"
              floodColor="#736858"
              floodOpacity=".13"
            />
          </filter>
          <clipPath id="answer-reveal">
            <rect x="40" y="130" width={s.answer * 730} height="190" />
          </clipPath>
        </defs>
        <rect width="1080" height="1920" fill="url(#grid)" />
        <path d="M72 147L1010 150" stroke="#a6ad9d" strokeWidth="2" />
        <text x="76" y="110" fontSize="31" letterSpacing="5" fill="#66776e">
          AI · 一张回答的来路
        </text>
        <g
          opacity={s.question}
          transform={`translate(0,${(1 - s.question) * 35})`}
        >
          <text x="94" y="265" fontSize="56" fontWeight="650">
            这句话，出自哪本书？
          </text>
          <path
            d="M98 290 Q410 283 694 291"
            stroke={accent}
            strokeWidth="4"
            fill="none"
            {...draw(s.question)}
          />
        </g>

        {/* One answer sheet stays mounted for the entire sample. */}
        <g
          transform={`translate(${answerX},${answerY + (1 - s.paper) * 170}) scale(${answerScale}) rotate(${(1 - s.paper) * -5},410,200)`}
          opacity={s.paper}
        >
          <path
            d="M1 5L815 0L824 398L0 405Z"
            fill={paper}
            filter="url(#shadow)"
            stroke="#a7ad9f"
            strokeWidth="2"
          />
          <path
            d="M28 94 Q380 98 790 94"
            {...line}
            strokeWidth="2"
            opacity=".3"
          />
          <text x="45" y="68" fontSize="32" fill="#67796f">
            模型回答 · 示意
          </text>
          <g clipPath="url(#answer-reveal)">
            <text x="45" y="187" fontSize="56" fontWeight="650">
              出自《某本书》
            </text>
            <text x="45" y="278" fontSize="54" fill={accent}>
              第 42 页
            </text>
            <path
              d="M46 298Q235 304 466 298"
              {...line}
              stroke={accent}
              {...draw(ramp(frame, 151, 195))}
            />
          </g>
          <g
            transform={`translate(${penX},${230 + Math.sin(s.answer * Math.PI) * -100}) rotate(-28)`}
            opacity={ramp(frame, 108, 119) * (1 - ramp(frame, 179, 199))}
          >
            <path d="M0 0L10 -65L25 -65L20 0L10 20Z" fill={ink} />
            <path d="M10 20L7 4L19 4Z" fill={accent} />
          </g>
          <g opacity={s.missing}>
            <path
              d="M540 196L736 196L736 296L540 296Z"
              fill="#f1e4d2"
              stroke={accent}
              strokeWidth="2"
            />
            <text
              x="638"
              y="256"
              textAnchor="middle"
              fontSize="42"
              fill={accent}
            >
              待查证
            </text>
          </g>
        </g>

        {/* The asserted citation reaches toward the source, then loses its connection. */}
        <g opacity={s.connection * (1 - s.learning)}>
          <path
            d={`M675 758 Q835 824 758 918`}
            {...line}
            stroke={accent}
            {...draw(s.connection * (1 - s.broken * 0.32))}
          />
          <path
            d={`M758 918 Q725 952 ${725 + s.broken * 24} ${966 + s.broken * 19}`}
            {...line}
            stroke={accent}
            opacity={1 - s.broken}
          />
          <path
            d="M797 847L819 826M806 875L834 873"
            {...line}
            stroke={accent}
            opacity={s.broken}
          />
        </g>

        {/* The original opens physically around its spine, with a scanning lens. */}
        <g
          transform={`translate(72,${bookY}) scale(${bookScale})`}
          opacity={s.check}
        >
          <g
            transform={`translate(${(1 - s.check) * 470},0) scale(${0.03 + s.check * 0.97},1)`}
          >
            <path
              d="M12 26 Q240 -7 478 22L478 451Q222 424 12 465Z"
              fill={paper}
              stroke="#839087"
              strokeWidth="3"
              filter="url(#shadow)"
            />
            <path
              d="M478 22 Q695 -4 940 26L940 465Q706 424 478 451Z"
              fill="#f8f3e9"
              stroke="#839087"
              strokeWidth="3"
            />
            <path d="M478 25L478 446" {...line} opacity=".35" />
            <text x="57" y="107" fontSize="44" fontWeight="650">
              打开原文
            </text>
            <text x="551" y="107" fontSize="40" fill="#68776d">
              逐行核对
            </text>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <path
                  d={`M59 ${163 + i * 58} Q226 ${160 + i * 58} 394 ${164 + i * 58}`}
                  {...line}
                  strokeWidth="2.5"
                  opacity=".32"
                  {...draw(ramp(frame, 244 + i * 6, 268 + i * 6))}
                />
                <path
                  d={`M551 ${163 + i * 58} Q719 ${161 + i * 58} 886 ${164 + i * 58}`}
                  {...line}
                  strokeWidth="2.5"
                  opacity=".32"
                  {...draw(ramp(frame, 254 + i * 6, 280 + i * 6))}
                />
              </g>
            ))}
          </g>
          <g
            transform={`translate(${170 + s.scan * 585},${190 + Math.sin(s.scan * Math.PI) * 96})`}
            opacity={ramp(frame, 264, 278) * (1 - s.learning)}
          >
            <circle
              r="74"
              fill="#ede7da"
              fillOpacity=".6"
              stroke={accent}
              strokeWidth="5"
            />
            <path
              d="M53 55L117 122"
              {...line}
              stroke={accent}
              strokeWidth="14"
            />
            <path d="M-46 -14L41 -14M-46 15L30 15" {...line} strokeWidth="4" />
          </g>
          <g opacity={s.missing * (1 - s.learning)}>
            <rect
              x="186"
              y="372"
              width="570"
              height="98"
              rx="10"
              fill="#ede4d4"
              stroke={accent}
              strokeWidth="2"
            />
            <text
              x="471"
              y="435"
              textAnchor="middle"
              fontSize="46"
              fill={accent}
            >
              找不到这句话
            </text>
          </g>
        </g>

        {/* Source pages become the text patterns that feed the still-present answer. */}
        {["知识", "表达", "上下文"].map((label, i) => {
          const p = ramp(frame, 468 + i * 12, 515 + i * 14);
          const x = 104 + i * 304;
          const y = 1050 - i * 20;
          return (
            <g
              key={label}
              transform={`translate(${x + (1 - p) * (350 - x)},${y + (1 - p) * 190}) rotate(${(1 - p) * (i - 1) * 12},135,125)`}
              opacity={p}
            >
              <path
                d="M6 11L265 1L276 218L0 230Z"
                fill={paper}
                stroke="#8a998f"
                strokeWidth="2.5"
                filter="url(#shadow)"
              />
              <text
                x="136"
                y="77"
                textAnchor="middle"
                fontSize="44"
                fontWeight="650"
              >
                {label}
              </text>
              {[0, 1, 2].map((n) => (
                <path
                  key={n}
                  d={`M40 ${113 + n * 30}L232 ${115 + n * 30}`}
                  {...line}
                  strokeWidth="2"
                  opacity=".4"
                  {...draw(
                    ramp(frame, 500 + i * 10 + n * 4, 524 + i * 10 + n * 4),
                  )}
                />
              ))}
            </g>
          );
        })}
        <g opacity={s.learning}>
          <path
            d="M237 1034Q183 875 307 790M540 1018Q534 888 561 791M846 996Q931 833 822 743"
            {...line}
            stroke="#758879"
            {...draw(ramp(frame, 548, 592))}
          />
          <text
            x="540"
            y="950"
            textAnchor="middle"
            fontSize="39"
            fill="#65776c"
            opacity={1 - s.context}
          >
            学到规律，仍需核对事实
          </text>
        </g>
        {/* Each word visibly travels from context into an ordered output strip. */}
        <g opacity={s.context}>
          <path
            d="M97 1380L977 1380L977 1505L97 1505Z"
            fill={paper}
            stroke="#8a998f"
            strokeWidth="2.5"
          />
          <text x="115" y="1343" fontSize="40">
            按上下文逐步组织
          </text>
          {["组织", "后续", "内容"].map((label, i) => {
            const p = s.tokens[i];
            const x = 798 + (193 + i * 268 - 798) * p;
            const y = 1090 + 355 * p - Math.sin(p * Math.PI) * 145;
            return (
              <g
                key={label}
                opacity={ramp(frame, 638 + i * 28, 645 + i * 28)}
                transform={`translate(${x},${y}) rotate(${(1 - p) * -7})`}
              >
                <rect
                  x="-85"
                  y="-48"
                  width="170"
                  height="85"
                  rx="5"
                  fill="#e1e8dc"
                  stroke="#677e6c"
                  strokeWidth="2"
                />
                <text textAnchor="middle" y="11" fontSize="45" fill={ink}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
        <text
          x="94"
          y="1575"
          fontSize="30"
          fill="#718075"
          opacity={ramp(frame, 731, 746)}
        >
          语言的形成过程 ≠ 事实已经核实
        </text>
      </svg>
      <CaptionLayer
        captionCues={cues}
        safeAreaPx={{ left: 90, right: 90, top: 120, bottom: 155 }}
      />
      <Audio src={staticFile("narration.wav")} />
    </AbsoluteFill>
  );
};

registerRoot(() => (
  <Composition
    id="MotionFirstPreview"
    component={MotionSample}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={758}
  />
));
