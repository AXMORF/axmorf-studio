# 风格配方：纸面拼贴 / 手绘线稿

用户或 Workspace 指定这种风格时读，在 [画面手艺](../craft.md) 与 [导演手册](../direction.md) 上实施；不改旁白、字幕时序和交付规则。
示例配色不是默认值。storyboard 开头仍声明风格、配色、参考方向和内容理由；每镜头逐项写「图形元素 → 代表」。

每镜头主信息由画出来的物件、生图剪纸或图解承载；文字卡片只放数字、原话和短标签，不能单独撑一个镜头。
各物件标注 kind，含义与原生元素写法见 [storyboard 与图形类型](../direction.md#8-storyboardmd-写法)，回应 `text-card-only` 的连续采样帧段。

## 材质与主体

- 按内容选米白、牛皮纸、方格本或横线本中的一种底纸：账单用米白，档案用牛皮纸，计算记录用方格本，笔记用横线本。只保留真实纸面印刷线，不画装饰性的空间网格。
- 用确定性 SVG pattern 或 filter 做纸纹、撕边和接触阴影。`feTurbulence` 固定 seed，线稿抖动用 Remotion `random(seed)`；不依赖外部纹理、不在渲染时生图或联网。
  如果确需纹理图，只能调用宿主实际可用的生图工具；成功后用 `film:asset` 登记来源与许可，失败按 Skill 故障规则停下，不假称素材已生成。
- 主体是可认出的剪纸实物：白边、撕边、轻投影、略微歪斜。马克笔/铅笔线条用分段曲线和轻微粗细变化，轮廓可轻抖，正在阅读的文字不抖。
- 贴纸、胶带、图钉、印章、红笔圈画、便利贴都可以用，但要说得出它表示什么；例如胶带固定账单，印章表示核对完成，红笔圈出旁白正在解释的费用。无含义的道具不放。
- 实物主体同帧最多 3 个；关系和背景用正确角色标注，不把零件逐个算主体，也不把多件物体打包以躲数量/重叠提示。

## 色与字

纸色 + 1 个主色 + 1 个强调色（如红笔色），墨线用深灰，不用纯黑。禁止深蓝底、青色发光、科技网格、等距平台和 glow。

2026-11-10 在此 Workspace 与 Ubuntu 系统实际检查：Workspace 未发现自带中文字体文件；`fc-list :lang=zh family file`
列出了 **Noto Sans CJK SC**、**Noto Serif CJK SC**、**WenQuanYi Zen Hei / 文泉驿正黑** 与 Droid Sans Fallback，未发现中文手写字体。
示例选择已安装的 Noto Sans CJK SC（`/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`，粗体为同目录 Bold.ttc）；
Noto CJK 的许可为 SIL Open Font License 1.1，本机包的许可声明在 `/usr/share/doc/fonts-noto-cjk/copyright`。
这些是本机实测记录，不是所有 Workspace 的字体保证；换机先重新查实际字体和许可，不通过字体名称猜测可用性、不联网加载。

标题要有手写感；没有许可清楚且已安装的中文手写字体，就用 Noto 加轻微旋转贴在纸条上。正文标签写在纸条/便利贴上，
旋转不超过 3°，对比与手机可读性照常核对；阅读时固定，不让文字随线稿 boil。

## 片头片尾主题

纸面风格的片头、片尾默认选 **light**，与浅纸正片一致。storyboard 开头的风格声明必须写明 `bookends: light`；
用户明确指定其他主题时记录主题和内容理由，仍须核对片头、正片、来源页和品牌片尾的一致性。
当前 `film.json` 的 `bookends.theme` 只接受 `"dark"`、`"light"`，同时控制片头和片尾，不支持分开设置。
省略 theme 的合同默认值是 dark，`film:new` 脚手架也仍写 dark；建好纸面片后主动在本片改成 light，不改 Workspace 默认或脚手架。
保留既有 intro/outro 与 sources，下面是字段位置示例：

```json
{
  "bookends": {
    "intro": "axmorf-brand-reveal-v1",
    "outro": "axmorf-source-follow-v1",
    "theme": "light",
    "sources": []
  }
}
```

有来源时照实填入 sources；不要复制空数组抹掉已有来源。只有用户明确不要品牌片头片尾时才把相应 intro/outro 设为 null。
审片时同时检查片头、来源页和最终品牌帧，不能只看正片联系表。

## 桌面镜头与转场

像在桌面上俯拍一张大拼贴，用 `ProducerWorldCamera` 沿纸面证据的因果移动，先写纸片坐标再设计镜头。
转场用翻页、抽走纸片或新纸片拍下盖住：优先用现有场景内容的帧驱动 transform/clip-path 配合跨章切换；
例如旧纸沿手抽方向移出，新纸从同向进来；翻页在场景组件里以透视旋转完成，用现有 `wipe`/`slide` 连接两章；
拍纸覆盖用一张有含义的纸片在场景内盖满画面，再切换后续内容，覆盖过程记录起止帧。
`FilmSceneTrack` 不新增 kind 或改接口；其 `mask-wipe` 可作纸片边沿的揭示辅助，但不能用光带假装翻页，也不以 glow 代替纸面动作。

讲述段的桌面必须持续极小幅、连续、非匀速的手持微移（可用正片 frame 的多频正弦叠加，见 [三层动效](../direction.md#4-三层动效核心)）；
全程保留每 2–3 帧换描边的非文字线稿 boil，并在每拍安排一个轮换的物件反应。
“停住阅读”只针对正在被阅读的文字：文字放在独立稳定层，纸面、线稿和物件继续运动。不能把保护文字理解成整帧冻结。

## 物件反应与声音

每个章节至少 3 种物件反应，相邻小节主动作轮换；每拍一个物件反应，由不同物件轮流承接。只稳定正在阅读的文字。线稿 boil、纸片弹起、印章压扁回弹、
红笔圈画等从内容和拍点派生，不能只闪环境光或缩放背景。详见 [反应词库](../direction.md#4-三层动效核心)。
印章落定对应 `stamp`，胶带撕贴对应 `tape`，红笔圈画对应 `pen`；抽纸/翻页继续用 `paper`，碎纸可用轻 `paper` 加 `tick`。
stamp的低频压按基底跟score主音；tape/pen以噪声为主，不伪造跟调。三者都可调pitch/brightness/intensity/tail/stereo/seed。
只从可见动作生成音效计划，长度覆盖动作，anchor 对齐落点；参数与跟调见 [音效计划](../sound.md)。

## 一帧合格的纸面画面包含什么

本页的 `PaperCollageExample` 仅作材质与笔触参考（不是整镜主体构成样板），核对 f30、f100、f170，并缩到手机宽度（例如 360px）逐张看：

- [ ] **看得出纸纹**：牛皮纸桌面的纤维、颗粒可辨；纸内有轻纹理，字周围仍然干净。
- [ ] **纸片有投影和倾斜**：白边、细碎撕边清楚，接触暗影和偏移模糊影一致，纸片倾斜 1–3°。
- [ ] **线稿是手绘的**：账单边框、红圈、下划线由分段曲线组成，有轻微抖动和笔压粗细变化；两帧一拍的 boil 只换线稿，文字不抖。
- [ ] **道具留下痕迹**：印章留下有缺墨颗粒、边缘不匀且写着「已核对」的印记；红笔画出圈和下划线；胶带透出下面的纸并有撕口；便利贴有短标签和翘角。只画工具外形不算完成。
- [ ] **主体不超过 3 个**：示例是账单、核对顺序便利贴、核对章；不要把独立物体打包或误标为背景来绕过预算。
- [ ] **每个图形都有含义**：逐项用 `data-axmorf-object` 写出代表什么；胶带的固定关系、红圈的金额强调、印泥的核对完成都能静音解释。
- [ ] **字可读**：正文与金额在稳定阅读层，深墨/红墨和浅纸有足够对比，不跨前景遮挡；缩到手机仍能读清问题、算式、金额、核对标签和印文。

静态合格后还要看连续帧（只读文字停稳，周围画面继续动作）：纸片确实弹起且影子随动、印章压扁回弹后印泥保留、红圈逐段画出、便利贴在拍点翘角。
`graphic-overlap`、`too-many-subjects`、`unlabeled-graphic`、`beat-response-monotone`、`low-contrast-text`、`text-under-foreground` 应全部为 0；测量缺失或 unknown 不当作通过。

- [ ] **讲述段有没有连续超过 1 秒、整帧不动的地方**：写明帧段，分别核对持续手持微移、全程非文字线稿 boil、每拍轮换的物件反应；回应 `narration-static` 的实际像素证据。

## 可编译参考示例

1920×1080 / 30 fps / 180 帧（6 秒）；牛皮纸桌面、米白账单、鼠尾草便利贴、红笔强调，配色只是示例。
主张：先核对用电读数，再计算费用。主体仅账单、便利贴、实物印章；底纸/标题纸条是背景，胶带、圈画和印泥是具体关系。
用 `pickRhythmResponse` 的 seed=3 在四个示意小节上轮换物件动作；`useRhythmResponse` 上报四类主动作与线稿 boil。
`useBoilSeed({ stepFrames: 2 })` 只改变线稿，不改变纹理、纸片轮廓和文字；阅读层保持水平，纸片本身略微倾斜。
印章和它留下的印记分区展示，避免盖住正在读的金额；不靠光闪或背景缩放表达节拍。
本示例仅演示纸面材质和四类动作，不是完整镜头主体设计：账单、便利贴如实标为 card，f0–38 印章入画前只有文字卡片，会触发 `text-card-only`；真实片须用插画/图解承载主信息。
它也不是讲述段的完整运动计划；真实片必须补持续桌面微移与每拍的轮换反应。
代码与 `PaperCollageExample.tsx` 同步，Skill 示例编译与 film:check 覆盖；真实片补本片实测时序、声轨、字幕和场景轨，不把示意小节当实测配乐网格。

| 小节 | 帧      | 图形元素 → 代表                                  | 承载物件与反应                                              | 音效  |
| ---- | ------- | ------------------------------------------------ | ----------------------------------------------------------- | ----- |
| 1    | 0–44    | 胶带固定的账单 → 用电量与费用；便利贴 → 核对顺序 | f0–18 账单弹起、落定，接触影随高度变化；线稿每 2 帧换描边   | paper |
| 2    | 45–89   | 实物核对章与账单上的印泥 → 核对完成              | f39–58 章下压、f45 压扁、f52 回弹；f45 起保留「已核对」印泥 | stamp |
| 3    | 90–134  | 红圈 → 强调最终费用；下划线 → 用电量乘单价       | f90–114 逐段圈出 ¥64，f110–122 画下划线；读字不动           | pen   |
| 4    | 135–179 | 便利贴短标签 → 先核对读数、再计算费用            | f135–153 右下纸角翘起后回落，文字固定                       | paper |

```tsx
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
          data-axmorf-object-kind="card"
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
          data-axmorf-object-kind="card"
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
          data-axmorf-object-kind="prop"
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
```

## 审片追加项

逐镜头静音描述、手机尺寸读字并写帧号：认不出实物或说不出意义就改；`graphicWarnings` 包括 `text-card-only`，应为空或逐条说明。
核对纸纹不抢主体、白边/阴影一致、标签不超过 3°、每章物件反应不少于 3 类，光闪和背景缩放仅作补充。
看连续小图确认纸片、印章和笔划实际在动作；上报的节奏反应不是可见性证明。
