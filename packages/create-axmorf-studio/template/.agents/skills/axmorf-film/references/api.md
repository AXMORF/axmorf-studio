# 运行时 API

全部从 `@axmorf/studio/remotion` 导入；Remotion 本身的 API（`AbsoluteFill`、`Sequence`、`interpolate`、`spring`、
`Img`、`Audio`、`staticFile`、`random`、`useCurrentFrame`、`useVideoConfig`）从 `remotion` 导入，`@remotion/*`
扩展包（`transitions`、`paths`、`shapes`、`three`、`lottie`、`google-fonts` 等）也都可用。

## 本片时序

```tsx
const { spec, timing, music } = useFilm(); // film.json 与生成文件的原始数据
const t = useFilmTiming();
t.fps;
t.durationInFrames;
t.narrationStartFrame;
t.narrationEndFrame;
t.sentences; // [{ id, text, startFrame, endFrame }]，正片绝对帧
t.sentence("s03").startFrame;
t.music?.barFrames; // 另有 beatFrames、sectionFrames、accentFrames、bpm、beatsPerBar、framesPerBeat
```

`<Sequence from={t.sentence("s03").startFrame - 10}>` 里的子组件拿到的 `useCurrentFrame()` 从 0 开始；
在 Sequence 内对齐正片帧时记得减去 `from`。

## 必须挂载

```tsx
<AbsoluteFill>
  {/* 画面 */}
  <FilmSoundtrack /> {/* 旁白 + 配乐 + 旁白下自动压低 + 结尾淡出 */}
  <FilmCaptions /> {/* 当前句字幕；放在最上层 */}
</AbsoluteFill>
```

- `FilmCaptions` 可调 `bottom`（离底边的画面高度比例）、`maxWidth`、`style`，或用
  `render={(sentence, progress) => ...}` 自定义字幕外观（例如逐字高亮）。默认字号竖屏约为宽度的 4.6%（1080 宽约 50px），
  长句折成两行；自定义时保持字号不低于宽度的 4%（约 43px），宁可折行也不要缩小或强制单行。
- `FilmSoundtrack narration={false}` 或 `music={false}` 可去掉其中一轨。
- 音效推荐用 `<FilmSoundEffects cues={cues} />`；cue、素材角色、吸附、留白和收音见 [音效轨](sound.md)。

## 场景轨

`FilmSceneTrack` 只组织正片画面，放在 Film 根层。`FilmSoundtrack`、`FilmSoundEffects` 和字幕在它之外，
不受转场影响。同章通常不写 `enter`，跨章才按因果关系选转场，见 [画面手艺](craft.md)。

```tsx
const film = useFilm();
const scenes: readonly FilmScene[] = [
  {
    id: "old",
    from: "s01",
    chapter: "question",
    render: (f) => <OldWorld frame={f} />,
  },
  {
    id: "proof",
    from: "s03",
    chapter: "evidence",
    enter: { kind: "mask-wipe", frames: 12 },
    render: (f) => <ProofWorld frame={f} />,
  },
];
const track = resolveFilmSceneTrack(film, scenes);
// In the returned JSX:
<>
  <FilmSceneTrack scenes={scenes} />
  <FilmSoundEffects cues={track.sfxCues} />
  <FilmSoundtrack />
  <FilmCaptions />
</>;
```

`OldWorld` / `ProofWorld` 是本片自己实现的画面组件。`FilmScene` 字段：

- `id` 唯一且非空；`from` 为句子 id 或正片绝对整数帧，对应名义边界 B；边界必须递增且位于正片内。
  第一场的有效边界总是 0（即使 from 为首句起点），画面填满旁白前导；最后一场延续到正片终点。
- `chapter?` 用于标注因果章节；`render(localFrame)` 的值为 `max(0, 正片帧 − 名义边界)`。
  提前重叠出现时保持 0，到名义边界后才开始计时。必须把这个参数传给需要场景本地帧的组件；
  内部 `useCurrentFrame()` 读到的是 TransitionSeries Sequence 的时钟，提前重叠时不等于上述本地帧。
- `enter?: { kind, frames, sfx? }` 挂在进入的场景上；第一场不能写。`frames` 为正整数，窗口是
  `[B − floor(frames/2), B + ceil(frames/2))`，不能重叠、越出正片，且 frames 不得超过任一相邻场景名义时长的一半。
- 覆盖式 kind：`light-leak`、`flash`、`whip-blur`、`mask-wipe`（`FILM_OVERLAY_TRANSITIONS`）。
  不改变场景绝对边界，优先用于有动机的跨章换景。
- 重叠式 kind：`fade`、`slide`、`wipe`、`iris`、`zoom-blur`、`linear-blur`、`cross-zoom`、`match-scale`
  （`FILM_OVERLAP_TRANSITIONS`）。resolver 反推 Sequence 时长以抵消重叠扣减，名义边界和正片总长不漂移。
- `sfx` 可覆盖默认角色，`false` 禁止建议。声音不会自动播放：显式把 `sfxCues` 交给音效轨。

`resolveFilmSceneTrack(film, scenes)` 是纯函数，film 至少提供 `durationInFrames/timing`；返回
`{ scenes, durationInFrames, sfxCues }`。每场含 `scene/boundaryFrame/startFrame/endFrame/durationInFrames/enter`；
`enter` 为 null 或 `{kind, mode, boundaryFrame, startFrame, endFrame, frames}`。建议 cue 位于名义边界。

## 音效轨与配乐段落

`FilmSoundEffectCue` 必有非空 `for` 与 `sfx`，并且只选 `frame` 或 `endFrame` 之一；
可选 `snap: none | beat | bar | accent | section`、`maxShiftFrames`、`minFrame/maxFrame`、`volume`。
`sfx: FilmSoundEffectSource` 是共享短名/资源 descriptor，或 `{asset: FilmAsset, durationInSeconds: number}`。
字符串不能当任意素材路径。`resolveFilmSoundEffects(film, cues)` 要求 film 的 `spec/timing/music/durationInFrames`，
返回 `ResolvedFilmSoundEffect[]`：音频贡献加 `sfxId/for`。`FilmSoundEffects` 在 FilmProvider 内读取 film 并播放贡献。
完整参数语义与可运行片段见 [音效计划](sound.md)。

`FilmSoundtrack` 新 props：

- `musicDips?: readonly {from: number; to: number; volume: number}[]`：正片 `[from, to)` 内的绝对配乐音量，
  与旁白压低取较小值并平滑边沿，不改音乐网格。
- `ending?: {landFrame?: number; sfx?: FilmSoundEffectSource}`：配乐淡出到 landFrame，省略时选正片内最后有效重音、
  没有则选正片终点。可选音效也以该帧为结束锚点；不传 ending 保持原结尾行为。
- `resolveFilmSoundtrack(film, {musicDips, ending})` 返回贡献供检查；`narration/music` 开关由组件过滤播放，
  `music={false}` 同时去掉 ending 音效。

## 镜头配方

组件与纯函数一一对应，具体参数、可编译片段和 gallery id 见 [配方目录](recipes.md)：

| 组件             | Resolver                                | 特有参数与返回                                                            |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `AxiomMorph`     | `resolveAxiomMorph(frame, options)`     | mode、text/nextText 布局、seed/spread/fragments；返回 glyphs/matches      |
| `NumberRoll`     | `resolveNumberRoll(frame, options)`     | value/decimals/grouping/prefix/suffix/turns；返回 columns/formatted       |
| `BarGrow`        | `resolveBarGrow(frame, options)`        | values/maxValue/staggerInFrames/ticks；返回 bars/ticks，land 为最后柱到达 |
| `CameraMove`     | `resolveCameraMove(frame, options)`     | preset、画布与世界尺寸、from/to/path/zoom；返回 state/shots/fast          |
| `ParticleField`  | `resolveParticleField(frame, options)`  | mode/path/width/height/count/seed；返回 particles                         |
| `ParallaxLayers` | `resolveParallaxLayers(frame, options)` | 世界尺寸、from/to/depths；返回 planes 和镜头状态，组件用 layers           |

各 resolver 都返回 `anticipate/move/land/settle/phase` 与绝对帧 `sfxCues`。共享
`resolveProducerRecipeTiming(frame, {startFrame, durationInFrames})` 计算阶段；动画最短 12 帧。
`PRODUCER_RECIPE_CATALOG` 按六个组件名索引元数据：`id/title/useWhen/avoidWhen/recommendedDurationSeconds/keyframes/sfxCues`。
目录中的 cue 只有 `{at, role}`，不能直接当音效轨 cue；要经过 resolver 变成具体帧。

组件默认读取自身 `useCurrentFrame()`。推荐在 Film 根层捕获正片帧，给配方显式传 `frame`，并让 options.startFrame
也使用正片绝对帧。在场景 render 内若决定用本地时钟，必须将配方和 cue 的时钟一起转换；不要给已经是绝对帧的 cue 再加偏移。
`AxiomMorph` 组件接收字符串，resolver 接收 `measureAxiomText(text, {fontFamily, fontSize, fontWeight?})` 的布局；
测量只在浏览器、已安装本地字体就绪后进行，不能在 Node 顶层调用。`splitAxiomGlyphs` 按 grapheme 拆字，`matchAxiomGlyphs`
按出现次序匹配共有字。不要用网络字体或随手估宽替代实测。

## 片头片尾

`film.json` 的 `bookends` 由 `film:new` 按 Workspace 配置写入，交付时系统自动在正片前后接上：

```json
"bookends": {
  "intro": "axmorf-brand-reveal-v1",
  "outro": "axmorf-source-follow-v1",
  "theme": "dark",
  "sources": [{ "title": "Cloudflare：DNS 服务器类型", "url": "https://www.cloudflare.com/learning/dns/dns-server-types/" }]
}
```

- 片头 2 秒、片尾 8 秒（按 30 fps 计，其他帧率按秒换算），各自带原来的音效与音乐；配乐只覆盖正片。
- `theme` 取 `dark` 或 `light`；`sources` 最多 6 条，显示在片尾前半段。
- `Film.tsx`、`useFilmTiming()` 与审片联系表都只计正片的帧；Remotion Studio 里的同名组合播放完整成片。

## 镜头

`ProducerShotStage`：全幅分层舞台，按关键帧推拉摇，背景和前景按深度做视差。

```tsx
const { width, height } = useVideoConfig();
<ProducerShotStage
  width={width}
  height={height}
  shots={[
    { frame: 0, focus: [0.5, 0.5], zoom: 1 },
    { frame: 90, focus: [0.62, 0.4], zoom: 1.8, easing: "ease-in-out" },
  ]}
  background={<Environment />} // 铺满的环境层，深度默认 0.35
  subject={<Subject />} // 主体层
  foreground={<Leaves />} // 前景遮挡，深度默认 1.4
  overlay={<Label />} // 不随镜头运动的稳定文字层
  drift={{ amplitudePx: 6, periodFrames: 180 }}
/>;
```

`focus` 是画面内的相对坐标（0–1），`zoom` 1–8，可选 `rotation` ±8 度。`frame` 默认取当前帧。
`ProducerWorldCamera`：镜头在比屏幕大的世界里移动（平移、跟拍、推拉），各层按深度视差。

```tsx
<ProducerWorldCamera
  width={width}
  height={height}
  worldWidth={width * 3} // 竖屏三屏宽的世界
  worldHeight={height}
  shots={[
    { frame: 0, center: [600, 900] }, // 世界像素坐标
    { frame: 120, center: [1620, 980], zoom: 1.4, easing: "ease-in-out" },
  ]}
  layers={[
    { depth: 0.35, content: <FarSky /> }, // 远景，移动最少
    { depth: 1, content: <Process /> }, // 主体，按世界坐标绘制
    { depth: 1.4, content: <NearHaze /> }, // 前景，掠过更快
  ]}
  overlay={<Title />}
/>
```

`center` 是世界像素，`zoom` 1–6，中心会被限制在世界范围内不露边。每层都按 `worldWidth × worldHeight` 绘制；
`depth` 大于 1 的前景层移动得比世界更远，内容要画到世界右边（或下边）之外，否则会露出硬边。
`resolveProducerPathPoint(points, progress)` 按长度求折线上的点，可以让镜头或光点沿路径匀速前进；
完整示范见 [示例段落](examples.md#竖屏讲解主题镜头在大场景里跟着过程走)。

其他镜头工具：`ProducerCamera2D`、`ProducerCamera3D`、`ProducerLayeredStage`、`ProducerFocusPull`。

## 运动

- `snapProducerFrameToBeat(frame, grid, { maxShiftFrames, minFrame, maxFrame })`：把落点吸附到最近的拍，超出窗口时保留原帧。
- `resolveProducerSettle`、`resolveProducerFollow2D`、`resolveProducerGather2D`、`resolveProducerPointMorph2D`：
  无状态的惯性、跟随、聚拢和形变计算，任意帧都能直接求值。
- 段落编排与转场优先用 [FilmSceneTrack](#场景轨)，保留旁白的绝对时序与正片总长。

## 界面组件

软件、开发、开源题材用真实界面，而不是几个矩形：

- `InterfaceWindow`：浏览器或应用窗口外壳（`width`、`height`、`minFontSizePx`、`variant: "browser" | "app"`、`title`、`url`、`theme`）。
- `TerminalPanel`：逐字打出的终端（`lines: [{ kind: "command" | "output" | "success" | "error" | "comment", text }]`、
  `minFontSizePx`、`startFrame`、`charsPerFrame`、`lineDelayFrames`）。
- `CodePanel`：逐行出现、可高亮的代码（`code`、`minFontSizePx`、`fileName`、`framesPerLine`、`startFrame`、`highlights`）。
- `RepositoryCard`：仓库卡片（`owner`、`name`、`description`、`language`、`stars`、`topics`、`width`、`minFontSizePx`）。
- `interfaceThemes.dark` / `interfaceThemes.light` 作为 `theme`。

## 图形处理与节拍剪辑

用于 MV、动漫 OP 一类段落（配方见 [动漫 OP](styles/anime-op.md)）。全部是 SVG filter 与帧驱动计算，
任何 DOM 子树都能套用，不依赖 WebGL。它们只处理画面，不提供画面：主体仍然来自插画、照片或原创 SVG。

```tsx
const { music } = useFilmTiming();
// Cut on phrases (bars) rather than every beat; effects land only on accents.
const cuts = selectProducerCutFrames({ grid: music!.barFrames, fromFrame: 0, toFrame: 240 });

<ProducerGlitchSlices seed="hook" bursts={music!.accentFrames} burstFrames={3}>
  <ProducerBeatCutSeries cutFrames={cuts} endFrame={240} shots={[<CloseUp key="a" />, <Wide key="b" />]} />
</ProducerGlitchSlices>
<ProducerFlashCut frames={music!.accentFrames} decayFrames={5} />
```

- `selectProducerCutFrames({ grid, fromFrame, toFrame, every })`：从 `barFrames`/`beatFrames` 里每隔 `every` 个取切点。
  普通切点优先用小节（乐句），逐拍硬切会显得机械。
- `ProducerBeatCutSeries`：`cutFrames`（父时间线帧，在 Sequence 里要减去 `from`）、`endFrame`、`shots`（按顺序循环）；
  每个镜头在自己的 Sequence 里，`useCurrentFrame()` 从切点开始为 0；短于 `minShotFrames`（默认 3）的镜头直接报错。
- `ProducerGradientMap`：`stops` 从暗到亮 2–8 个十六进制颜色，`amount` 0–1；两色是双色调，多色是伪彩。
- `ProducerChromaticSplit`：`amountPx` 0–120 的 RGB 通道错位，`angle` 为方向。
- `ProducerGlitchSlices`：横向撕裂，`seed`、`intensity` 0–1、`bursts`（从这些帧开始撕裂并在 `burstFrames` 内衰减；
  不传则持续）、`slices`、`maxOffsetPx`、`holdFrames`。撕裂条是子树的装饰副本，只在 burst 内存在；
  子树里有视频时副本会多次解码，尽量包在图片和 SVG 上。
- `ProducerHalftoneOverlay`：铺满父容器的网点叠层，`spacingPx`、`radiusPx`、`color`、`opacity`、`angle`、`blendMode`、
  `fade: "none" | "edges" | "center"`、`driftPxPerFrame`。
- `ProducerFlashCut`：`frames` 处闪白（`color` 可改黑），`decayFrames` 内衰减。全屏闪烁每秒不超过 3 次。
- `ProducerSpriteSheet`：显示网格图的某一格（`src`、`columns`、`rows`、`cell`、`sheetWidth`、`sheetHeight`、`style`
  定位与宽度）。配合 `resolveProducerDrawing(frame, count, { holdFrames })` 或 `{ onFrames: music.beatFrames }`
  播放动作表；做法见 [素材](artwork.md#作画序列动作表)。
- `ProducerBeatCamera`：包住一个镜头，`punches` 帧上推镜、`shakes` 帧上轻震（`punch`、`shakePx`、`decayFrames`），
  只用在节拍段；纯函数 `resolveProducerBeatCamera`。
- `ProducerWhipIn`：甩镜入场，`direction`、`frames`（4–6）、`distance`、`blurPx`。
- `ProducerSpeedLines`：围绕焦点的放射速度线，每 `holdFrames` 帧重画一次（`seed`、`center`、`opacity`、`count`）。
- `ProducerCreditTitle`：职员表式文字，`role`、`names`、`sizePx`、`fill`（`"gold"` 或颜色）、`orientation`、`align`、
  `entrance`（`"slam"` 缩放砸入，用于片名；`"fade"` 带短暂模糊淡入，用于克制的职员名）、`weight`（默认 900）、
  `startFrame`、`staggerFrames`、`echo`（镜像倒影）、`style`（定位）。默认字体 `producerDisplaySerifFamily`。

## 其他

- 媒体：`ProducerLocalVideo`、`ProducerAnimatedImage`、`ProducerLottie`。
- 数据：`BarChart`；文字：`fitProducerText` 按宽度求字号。
- 背景与特效：`GradientShiftBackground`、`MetaBallsPrimitive`、`@remotion/light-leaks`、`@remotion/motion-blur`。
- 3D：`@remotion/three` 与 `@react-three/fiber`。

这些都是可选工具；只在它们表达当前画面时使用，没有使用数量要求。
