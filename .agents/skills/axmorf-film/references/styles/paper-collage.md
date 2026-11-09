# 风格配方：纸面拼贴 / 手绘线稿

用户或 Workspace 指定这种风格时读，在 [画面手艺](../craft.md) 与 [导演手册](../direction.md) 上实施；不改旁白、字幕时序和交付规则。
示例配色不是默认值。storyboard 开头仍声明风格、配色、参考方向和内容理由；每镜头逐项写「图形元素 → 代表」。

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

## 桌面镜头与转场

像在桌面上俯拍一张大拼贴，用 `ProducerWorldCamera` 沿纸面证据的因果移动，先写纸片坐标再设计镜头。
转场用翻页、抽走纸片或新纸片拍下盖住：优先用现有场景内容的帧驱动 transform/clip-path 配合跨章切换；
例如旧纸沿手抽方向移出，新纸从同向进来；翻页在场景组件里以透视旋转完成，用现有 `wipe`/`slide` 连接两章；
拍纸覆盖用一张有含义的纸片在场景内盖满画面，再切换后续内容，覆盖过程记录起止帧。
`FilmSceneTrack` 不新增 kind 或改接口；其 `mask-wipe` 可作纸片边沿的揭示辅助，但不能用光带假装翻页，也不以 glow 代替纸面动作。

## 物件反应与声音

每个章节至少 3 种物件反应，相邻小节轮换；读字不抖，同一件物体不必每拍都动。线稿 boil、纸片弹起、印章压扁回弹、
红笔圈画等从内容和拍点派生，不能只闪环境光或缩放背景。详见 [反应词库](../direction.md#4-三层动效核心)。
印章落定对应 `stamp`，胶带撕贴对应 `tape`，红笔圈画对应 `pen`；抽纸/翻页继续用 `paper`，碎纸可用轻 `paper` 加 `tick`。
stamp的低频压按基底跟score主音；tape/pen以噪声为主，不伪造跟调。三者都可调pitch/brightness/intensity/tail/stereo/seed。
只从可见动作生成音效计划，长度覆盖动作，anchor 对齐落点；参数与跟调见 [音效计划](../sound.md)。

## 可编译最小示例

960×540 / 30 fps / 180 帧；米白纤维纸、鼠尾草主色、红笔强调，配色只是示例。
主张：核对用电读数，算出费用。主体仅账单、红笔、实物印章；纸纹和标题纸条是背景，圈画是金额强调关系。
用pickRhythmResponse的seed=3排出账单轻抬 → 印章 → 红圈；useBoilSeed只在第一小节换描边，useRhythmResponse上报四类物件动作（含线稿）。
代码与 `PaperCollageExample.tsx` 同步，Skill 示例编译与 film:check 覆盖；真实片补本片时序、声轨、字幕和场景轨，不把示意帧当实测旁白。

| 小节 | 帧 | 图形元素 → 代表 | 承载物件与反应 | 音效 |
| --- | --- | --- | --- | --- |
| 1 | 0–60 | 胶带固定的账单 → 用电与费用；红笔 → 核对工具；底纸/标题纸条 → 纸面载体 | f0 账单轻抬，影子随动；线稿每3帧换描边 | paper |
| 2 | 60–120 | 账单/红笔同上；实物印章 → 核对完成 | f54–70 印章盖下，f60落定 | stamp |
| 3 | 120–180 | 同上；红圈 → 强调旁白解释的费用（关系） | f120–136 红笔圈出金额；阅读文字固定 | pen |

```tsx
import {
  pickRhythmResponse,
  useBoilSeed,
  useRhythmResponse,
} from "@axmorf/studio/remotion";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const INK = "#45403a";
const RESPONSES = ["paper-lift", "stamp", "pen-circle"] as const;
const PLAN = [0, 60, 120].map((frame, bar) => ({
  frame,
  kind: pickRhythmResponse(bar, RESPONSES, { seed: 3 }),
}));
const at = (kind: (typeof RESPONSES)[number]) =>
  PLAN.find((event) => event.kind === kind)!.frame;

/** Paper desk: receipt, pen and approval stamp; labels stay on a stable plane. */
export const PaperCollageExample = () => {
  const frame = useCurrentFrame();
  const drawing = useBoilSeed({ frame: Math.min(frame, 57), stepFrames: 3 });
  useRhythmResponse({
    object: "胶带固定的用电纸账单",
    kind: "paper-lift",
    frames: [at("paper-lift")],
  });
  useRhythmResponse({
    object: "账单手绘边线",
    kind: "line-boil",
    frames: Array.from({ length: 20 }, (_, i) => i * 3),
  });
  useRhythmResponse({
    object: "表示已核对的实物印章",
    kind: "stamp",
    frames: [at("stamp")],
  });
  useRhythmResponse({
    object: "红笔圈出换算后的金额",
    kind: "pen-circle",
    frames: [at("pen-circle")],
  });
  const wobble = (random(`receipt-outline-${drawing}`) - 0.5) * 2;
  const liftFrame = frame - at("paper-lift");
  const lift =
    liftFrame >= 0 && liftFrame < 16
      ? Math.sin((liftFrame / 16) * Math.PI) * 5
      : 0;
  const stamp = interpolate(
    frame,
    [at("stamp") - 6, at("stamp"), at("stamp") + 4, at("stamp") + 10],
    [-55, 4, -3, 0],
    clamp,
  );
  const circle = interpolate(
    frame,
    [at("pen-circle"), at("pen-circle") + 16],
    [0, 1],
    clamp,
  );
  return (
    <AbsoluteFill style={{ background: "#f5edda" }}>
      <svg width="100%" height="100%" viewBox="0 0 960 540">
        <defs>
          <filter id="paper-fibers" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".6"
              numOctaves={2}
              seed={29}
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".065" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          <filter
            id="paper-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="150%"
          >
            <feDropShadow
              dx={2}
              dy={4 + lift}
              stdDeviation={3 + lift / 3}
              floodColor="#45403a"
              floodOpacity=".18"
            />
          </filter>
        </defs>
        <g
          data-axmorf-object="米白纤维纸桌面"
          data-axmorf-object-role="background"
        >
          <rect
            width={960}
            height={540}
            fill="#f5edda"
            filter="url(#paper-fibers)"
          />
        </g>
        <g data-axmorf-object="标题纸条" data-axmorf-object-role="background">
          <path d="M55 42L850 37L847 117L58 122Z" fill="#fffaf0" />
        </g>
        <text
          x={82}
          y={94}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fontSize={39}
          fontWeight={700}
          fill={INK}
          transform="rotate(-1 82 94)"
        >
          用电读数，怎样变成账单？
        </text>
        <g data-axmorf-object="胶带固定的用电纸账单">
          <g transform={`translate(0 ${-lift})`}>
            <path
              d="M85 172L418 164L430 458L408 449L390 466L370 454L349 470L326 459L302 475L280 462L257 477L235 464L211 479L188 464L165 480L142 468L98 477Z"
              fill="#fffaf0"
              stroke="#fffaf0"
              strokeWidth={12}
              filter="url(#paper-shadow)"
            />
            <path
              d={`M${87 + wobble} 174L417 167L428 456M100 475L${86 - wobble} 174`}
              fill="none"
              stroke={INK}
              strokeWidth={2.5 + Math.abs(wobble)}
              strokeLinecap="round"
            />
            <path
              d="M183 154L307 151L310 184L185 188Z"
              fill="#80926d"
              opacity={0.7}
            />
          </g>
        </g>
        <text
          x={137}
          y={248}
          fontSize={31}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          用电账单
        </text>
        <text
          x={131}
          y={315}
          fontSize={29}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          128 kWh × ¥0.50
        </text>
        <text
          x={173}
          y={409}
          fontSize={54}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          ¥64
        </text>
        <g
          data-axmorf-object="红笔圈出换算后的金额"
          data-axmorf-object-role="relation"
          opacity={circle}
        >
          <path
            d="M133 391C128 335 355 329 363 389C373 444 139 458 133 391C130 380 133 366 148 358"
            fill="none"
            stroke="#b34d3c"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={650}
            strokeDashoffset={650 * (1 - circle)}
          />
        </g>
        <g data-axmorf-object="核对金额的红笔" transform="rotate(-12 695 180)">
          <path
            d="M550 166H790L819 180L790 194H550Z"
            fill="#b34d3c"
            stroke="#fffaf0"
            strokeWidth={6}
            filter="url(#paper-shadow)"
          />
          <path
            d="M557 169H788L809 180L788 191H557ZM789 170L791 190"
            fill="none"
            stroke={INK}
            strokeWidth={2}
          />
        </g>
        <g
          data-axmorf-object="表示已核对的实物印章"
          opacity={frame >= at("stamp") - 6 ? 1 : 0}
          transform={`translate(0 ${stamp}) translate(697 391) scale(${frame >= at("stamp") && frame < at("stamp") + 4 ? "1.04 .9" : "1 1"}) translate(-697 -391)`}
        >
          <path
            d="M663 343V318Q663 289 697 289Q731 289 731 318V343ZM632 348H761V391H632Z"
            fill="#80926d"
            stroke="#fffaf0"
            strokeWidth={7}
            filter="url(#paper-shadow)"
          />
          <path
            d="M663 343H731M632 350H761V391H632Z"
            fill="none"
            stroke={INK}
            strokeWidth={2.5}
          />
        </g>
        <text
          x={584}
          y={454}
          fontSize={28}
          fontFamily="Noto Sans CJK SC, sans-serif"
          fill={INK}
        >
          先核对读数，再圈出费用
        </text>
      </svg>
    </AbsoluteFill>
  );
};
```

## 审片追加项

逐镜头静音描述、手机尺寸读字并写帧号：认不出实物或说不出意义就改；`graphicWarnings` 三条应为空或逐条说明。
核对纸纹不抢主体、白边/阴影一致、标签不超过 3°、每章物件反应不少于 3 类，光闪和背景缩放仅作补充。
看连续小图确认纸片、印章和笔划实际在动作；上报的节奏反应不是可见性证明。
