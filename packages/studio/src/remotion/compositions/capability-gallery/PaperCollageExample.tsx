import {
  pickRhythmResponse,
  useBoilSeed,
  useRhythmResponse,
} from "@axmorf/studio/remotion";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const INK = "#403d32";
const RED = "#9f382e";
const RESPONSES = ["paper-lift", "stamp", "pen-circle", "note-curl"] as const;
// Four illustrative bars, not a substitute for a real film's measured score.
const PLAN = [0, 45, 90, 135].map((frame, bar) => ({
  frame,
  kind: pickRhythmResponse(bar, RESPONSES, { seed: 3 }),
}));
const at = (kind: (typeof RESPONSES)[number]) =>
  PLAN.find((event) => event.kind === kind)!.frame;
type Point = readonly [number, number];

/** Shared endpoints, curved segments and varying pressure, held for two frames.
 * Only the ink changes drawing; paper silhouettes, fibers and text never boil. */
const SketchLine = ({
  points,
  seed,
  color = INK,
  width = 4,
  progress = 1,
}: {
  points: readonly Point[];
  seed: string;
  color?: string;
  width?: number;
  progress?: number;
}) => {
  const drawn = points.map(([x, y], i) => [
    x + (random(`${seed}:x:${i}`) - 0.5) * 2.8,
    y + (random(`${seed}:y:${i}`) - 0.5) * 2.8,
  ]);
  return drawn.slice(1).map((end, i) => {
    const start = drawn[i];
    const before = drawn[Math.max(0, i - 1)];
    const after = drawn[Math.min(drawn.length - 1, i + 2)];
    const reveal = Math.max(0, Math.min(1, progress * (drawn.length - 1) - i));
    return (
      <path
        key={i}
        d={`M${start} C${start[0] + (end[0] - before[0]) / 6},${start[1] + (end[1] - before[1]) / 6} ${end[0] - (after[0] - start[0]) / 6},${end[1] - (after[1] - start[1]) / 6} ${end}`}
        fill="none"
        stroke={color}
        strokeWidth={width * (0.75 + random(`${seed}:pressure:${i}`) * 0.5)}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - reveal}
        opacity={reveal > 0 ? 1 : 0}
      />
    );
  });
};

// Fine, irregular deckle rather than a repeated sawtooth silhouette.
const tornPaper = (
  x: number,
  y: number,
  w: number,
  h: number,
  seed: string,
) => {
  const edges: Point[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return (
    edges
      .map(([ax, ay], edge) => {
        const [bx, by] = edges[(edge + 1) % edges.length];
        const count = Math.ceil(Math.hypot(bx - ax, by - ay) / 12);
        return Array.from({ length: count }, (_, i) => {
          const t = i / count;
          const rough = (random(`${seed}:${edge}:${i}`) - 0.5) * 5;
          return `${edge === 0 && i === 0 ? "M" : "L"}${ax + (bx - ax) * t + (ay === by ? 0 : rough)},${ay + (by - ay) * t + (ax === bx ? 0 : rough)}`;
        }).join(" ");
      })
      .join(" ") + " Z"
  );
};
const BILL = tornPaper(185, 325, 900, 635, "receipt");
const TITLE = tornPaper(140, 85, 1550, 150, "title");
const NOTE = tornPaper(1220, 350, 460, 370, "note");
const BORDER: Point[] = [
  [240, 390],
  [250, 375],
  [510, 377],
  [785, 373],
  [1027, 378],
  [1034, 395],
  [1031, 620],
  [1035, 897],
  [1015, 910],
  [750, 907],
  [495, 912],
  [244, 908],
  [238, 890],
  [242, 640],
  [240, 390],
];
const CIRCLE: Point[] = Array.from({ length: 19 }, (_, i) => {
  const angle = -Math.PI * 0.74 + (i / 18) * Math.PI * 2.12;
  return [485 + Math.cos(angle) * 205, 777 + Math.sin(angle) * 103];
});

/** A tactile desk study: a receipt, a checking note and the stamp that marks it. */
export const PaperCollageExample = () => {
  const frame = useCurrentFrame();
  const drawing = useBoilSeed({ stepFrames: 2 });
  useRhythmResponse({
    object: "胶带固定的用电纸账单",
    kind: "paper-lift",
    frames: [at("paper-lift")],
  });
  useRhythmResponse({
    object: "账单、红圈与下划线的手绘线稿",
    kind: "line-boil",
    frames: Array.from({ length: 90 }, (_, i) => i * 2),
  });
  useRhythmResponse({
    object: "核对章压扁回弹并留下印泥",
    kind: "stamp",
    frames: [at("stamp")],
  });
  useRhythmResponse({
    object: "红笔圈出换算后的金额并划线",
    kind: "pen-circle",
    frames: [at("pen-circle")],
  });
  useRhythmResponse({
    object: "核对顺序便利贴的翘角",
    kind: "note-curl",
    frames: [at("note-curl")],
  });
  const lift = interpolate(
    frame - at("paper-lift"),
    [0, 5, 10, 18],
    [0, 20, -3, 0],
    clamp,
  );
  const pressFrame = frame - at("stamp");
  const press = interpolate(
    pressFrame,
    [-6, 0, 3, 7, 13],
    [-38, 6, 6, -12, 0],
    clamp,
  );
  const squash = interpolate(
    pressFrame,
    [-1, 0, 3, 7, 13],
    [1, 0.8, 0.8, 1.08, 1],
    clamp,
  );
  const circle = interpolate(
    frame,
    [at("pen-circle"), at("pen-circle") + 24],
    [0, 1],
    clamp,
  );
  const underline = interpolate(
    frame,
    [at("pen-circle") + 20, at("pen-circle") + 32],
    [0, 1],
    clamp,
  );
  const curl = interpolate(
    frame - at("note-curl"),
    [0, 5, 10, 18],
    [0, 34, 9, 0],
    clamp,
  );
  return (
    <AbsoluteFill style={{ background: "#d6c3a0" }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        fontFamily="Noto Sans CJK SC, sans-serif"
        fill={INK}
      >
        <defs>
          <linearGradient id="pc-desk-light" x2="1" y2="1">
            <stop stopColor="#e6d8ba" />
            <stop offset="1" stopColor="#c9b38d" />
          </linearGradient>
          <linearGradient id="pc-sheet-light" x2=".3" y2="1">
            <stop stopColor="#fffdf6" />
            <stop offset=".7" stopColor="#f6f0de" />
            <stop offset="1" stopColor="#e9e0c9" />
          </linearGradient>
          <linearGradient id="pc-note-light" x2=".2" y2="1">
            <stop stopColor="#e6e9c5" />
            <stop offset=".8" stopColor="#d6dcb1" />
            <stop offset="1" stopColor="#bac593" />
          </linearGradient>
          <linearGradient id="pc-fold-light" x2="1" y2=".6">
            <stop stopColor="#a8b380" />
            <stop offset=".4" stopColor="#f5f1d4" />
            <stop offset="1" stopColor="#e4e7bf" />
          </linearGradient>
          <linearGradient id="pc-stamp-wood" x2="1" y2=".2">
            <stop stopColor="#57614c" />
            <stop offset=".25" stopColor="#8c9974" />
            <stop offset=".55" stopColor="#a8b18d" />
            <stop offset="1" stopColor="#58664e" />
          </linearGradient>
          <filter id="pc-paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".18 .32"
              numOctaves={3}
              seed={29}
              result="grain"
            />
            <feColorMatrix in="grain" type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="linear" slope=".6" intercept=".4" />
              <feFuncG type="linear" slope=".6" intercept=".4" />
              <feFuncB type="linear" slope=".6" intercept=".4" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="pc-long-fibers" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".035 .32"
              numOctaves={2}
              seed={17}
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".24" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="soft-light" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="pc-contact" x="-15%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx={2}
              dy={3}
              stdDeviation={1.8}
              floodColor="#453722"
              floodOpacity=".4"
            />
            <feDropShadow
              dx={9}
              dy={14}
              stdDeviation={9}
              floodColor="#574127"
              floodOpacity=".28"
            />
          </filter>
          <filter
            id="pc-lift-shadow"
            x="-20%"
            y="-20%"
            width="150%"
            height="160%"
          >
            <feDropShadow
              dx={3 + lift / 4}
              dy={5 + lift}
              stdDeviation={3 + Math.max(0, lift) / 3}
              floodColor="#4a3826"
              floodOpacity=".38"
            />
            <feDropShadow
              dx={12}
              dy={18 + lift}
              stdDeviation={12 + Math.max(0, lift) / 2}
              floodColor="#685139"
              floodOpacity=".26"
            />
          </filter>
          <filter id="pc-ink-grit" x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".11 .19"
              numOctaves={3}
              seed={53}
              result="ink"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="ink"
              scale={2.2}
              xChannelSelector="R"
              yChannelSelector="G"
              result="ragged"
            />
            <feColorMatrix in="ink" type="luminanceToAlpha" />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 .3 .8 1 1" />
            </feComponentTransfer>
            <feComposite in="ragged" operator="in" />
          </filter>
        </defs>
        <g
          data-axmorf-object="有纤维与颗粒的牛皮纸桌面"
          data-axmorf-object-role="background"
        >
          <rect
            width={1920}
            height={1080}
            fill="url(#pc-desk-light)"
            filter="url(#pc-paper-grain)"
          />
          <rect
            width={1920}
            height={1080}
            fill="url(#pc-desk-light)"
            opacity={0.18}
            filter="url(#pc-long-fibers)"
          />
          {Array.from({ length: 650 }, (_, i) => {
            const x = random(`fiber-x:${i}`) * 1920;
            const y = random(`fiber-y:${i}`) * 1080;
            return (
              <path
                key={i}
                d={`M${x},${y} q${3 + random(`fiber-length:${i}`) * 13},-3 19,-1`}
                fill="none"
                stroke={i % 3 ? "#76674f" : "#fff5dc"}
                strokeWidth={0.8 + random(`fiber-weight:${i}`)}
                opacity={0.14 + random(`fiber-alpha:${i}`) * 0.16}
              />
            );
          })}
        </g>
        <g
          data-axmorf-object="承载问题的撕边标题纸条"
          data-axmorf-object-role="background"
          transform="rotate(-1.2 915 160)"
        >
          <path
            d={TITLE}
            fill="url(#pc-sheet-light)"
            stroke="#fffdf5"
            strokeWidth={10}
            filter="url(#pc-contact)"
          />
          <path
            d={TITLE}
            fill="#fff9ea"
            opacity={0.4}
            filter="url(#pc-paper-grain)"
          />
          <text
            x={205}
            y={189}
            fontSize={76}
            fontWeight={700}
            transform="rotate(1.2 915 160)"
          >
            用电读数，怎样变成账单？
          </text>
        </g>
        <g
          data-axmorf-object="用电读数换算费用的撕边账单"
          transform="rotate(-2 635 640)"
        >
          <g transform={`translate(0 ${-lift})`}>
            <path
              d={BILL}
              fill="url(#pc-sheet-light)"
              stroke="#fffcf2"
              strokeWidth={12}
              filter="url(#pc-lift-shadow)"
            />
            <path
              d={BILL}
              fill="#fff9e9"
              opacity={0.25}
              filter="url(#pc-paper-grain)"
            />
            <SketchLine
              points={BORDER}
              seed={`border:${drawing}`}
              width={3.8}
            />
            <g
              data-axmorf-object="半透明撕口胶带把账单固定到桌面"
              data-axmorf-object-role="relation"
              transform="rotate(3 620 335)"
            >
              <path
                d="M463 288L479 293L488 286L503 291L515 285L775 289L766 301L773 312L765 323L774 335L766 347L775 359L499 362L482 357L470 362L478 350L468 340L477 328L469 316L477 304Z"
                fill="#879467"
                fillOpacity={0.49}
                stroke="#d1d5ac"
                strokeWidth={2}
              />
              <path
                d="M490 302Q617 298 755 303M489 347Q622 352 756 346"
                fill="none"
                stroke="#fff7d9"
                strokeOpacity={0.4}
                strokeWidth={2}
              />
            </g>
          </g>
          {/* Keep the reading plane level; only paper and ink carry the motion. */}
          <g transform="rotate(2 635 640)">
            <text x={280} y={478} fontSize={62} fontWeight={700}>
              用电账单
            </text>
            <text x={280} y={590} fontSize={61}>
              128 kWh × ¥0.50
            </text>
            <g
              data-axmorf-object="红笔划线强调用电量与单价相乘"
              data-axmorf-object-role="relation"
            >
              <SketchLine
                points={[
                  [280, 620],
                  [440, 624],
                  [660, 620],
                  [911, 625],
                ]}
                seed={`underline:${drawing}`}
                color={RED}
                width={5.5}
                progress={underline}
              />
            </g>
            <g
              data-axmorf-object="红笔圈出最终应付金额"
              data-axmorf-object-role="relation"
            >
              <SketchLine
                points={CIRCLE}
                seed={`circle:${drawing}`}
                color={RED}
                width={6}
                progress={circle}
              />
            </g>
            <text x={315} y={824} fontSize={146} fontWeight={700}>
              ¥64
            </text>
            <g
              data-axmorf-object="核对章留下的颗粒印泥表示读数已核对"
              data-axmorf-object-role="relation"
              opacity={frame >= at("stamp") ? 1 : 0}
            >
              <g fill="none" stroke={RED} filter="url(#pc-ink-grit)">
                <path
                  d="M739 748Q865 741 997 748L995 863Q861 869 738 863Z"
                  strokeWidth={8}
                />
                <path
                  d="M752 760Q870 756 984 760L982 852Q865 855 752 850Z"
                  strokeWidth={2.6}
                />
              </g>
              <text
                x={781}
                y={826}
                fontSize={55}
                fontWeight={700}
                fill={RED}
                filter="url(#pc-ink-grit)"
              >
                已核对
              </text>
            </g>
          </g>
        </g>
        <g
          data-axmorf-object="提醒先核对读数再算费用的便利贴"
          transform="rotate(2.5 1450 535)"
        >
          <path
            d={NOTE}
            fill="url(#pc-note-light)"
            stroke="#f0edcf"
            strokeWidth={5}
            filter="url(#pc-contact)"
          />
          <path
            d={NOTE}
            fill="#dde2b9"
            opacity={0.22}
            filter="url(#pc-paper-grain)"
          />
          <path
            d="M1220 350H1680V391Q1452 397 1220 389Z"
            fill="#a1af7f"
            opacity={0.22}
          />
          <g
            data-axmorf-object="便利贴翘角显示拍点上的纸张弹性"
            data-axmorf-object-role="relation"
          >
            <path
              d={`M${1600 - curl} 720Q1641 ${699 - curl} 1680 ${638 - curl}L1680 720Z`}
              fill="#75865a"
              opacity={0.25}
            />
            <path
              d={`M${1600 - curl} 720Q${1634 - curl} ${680 - curl} 1680 ${638 - curl}Q1675 ${699 - curl / 2} ${1600 - curl} 720Z`}
              fill="url(#pc-fold-light)"
              stroke="#b0bc8c"
              strokeWidth={2}
            />
          </g>
          <text
            x={1270}
            y={480}
            fontSize={58}
            fontWeight={700}
            transform="rotate(-2.5 1450 535)"
          >
            先核对读数
          </text>
          <text
            x={1270}
            y={585}
            fontSize={58}
            fontWeight={700}
            transform="rotate(-2.5 1450 535)"
          >
            再计算费用
          </text>
        </g>
        <g
          data-axmorf-object="压按回弹的核对章是左侧印泥的来源"
          opacity={frame >= at("stamp") - 6 ? 1 : 0}
          transform={`translate(0 ${press}) translate(1450 981) scale(${2 - squash} ${squash}) translate(-1450 -981) rotate(-2 1450 900)`}
        >
          <g filter="url(#pc-contact)">
            <path
              d="M1322 904Q1448 893 1582 904L1591 956Q1455 970 1313 958Z"
              fill="#44483b"
              stroke="#f8f2e0"
              strokeWidth={8}
            />
            <path
              d="M1313 945Q1455 959 1591 944L1591 974Q1458 988 1313 976Z"
              fill="#88372c"
            />
            <path
              d="M1402 900L1408 852Q1384 837 1389 810Q1396 779 1450 778Q1506 777 1513 809Q1520 834 1490 851L1498 900Q1455 919 1402 900Z"
              fill="url(#pc-stamp-wood)"
              stroke="#f7f0de"
              strokeWidth={7}
            />
            <path
              d="M1419 852Q1450 861 1475 852M1419 889Q1450 902 1480 888M1335 922Q1452 933 1570 921"
              fill="none"
              stroke="#48543e"
              strokeWidth={3}
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
