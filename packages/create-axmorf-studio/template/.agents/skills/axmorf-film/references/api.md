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
t.sentences; // [{ id, text, caption?, startFrame, endFrame }]，正片绝对帧
t.sentence("s03").startFrame;
t.music?.barFrames; // 另有 beatFrames、sectionFrames、accentFrames、bpm、beatsPerBar、framesPerBeat
```

`<Sequence from={t.sentence("s03").startFrame - 10}>` 里的子组件拿到的 `useCurrentFrame()` 从 0 开始；
旧组件使用本地时钟时，把事件帧减去 Sequence 的 `from`。新 rhythm hooks 则在根调用，或传 `{ frame: 正片根帧 }`；
此时事件数组保留正片绝对帧，不要再减 `from`。

## 必须挂载

```tsx
<AbsoluteFill>
  {/* 画面 */}
  <FilmSoundtrack /> {/* 旁白 + 配乐 + 旁白下自动压低 + 结尾淡出 */}
  <FilmCaptions /> {/* 当前句字幕；放在最上层 */}
</AbsoluteFill>
```

- `FilmCaptions` 可调 `variant="box" | "paper"`（默认 box）、`bottom`（离底边的画面高度比例）、`maxWidth`、`style`，或用
  `render={(sentence, progress) => ...}` 自定义字幕外观（例如逐字高亮）。默认字号竖屏约为宽度的 4.6%（1080 宽约 50px），
  长句折成两行；自定义时保持字号不低于宽度的 4%（约 43px），宁可折行也不要缩小或强制单行。
- narration 每句的 `text` 是 TTS 念法，`caption?` 是屏幕文本，显示 `caption ?? text`；两者各自最多 72 个半角单位。
  例：`text: "这是八千四百一十五个H一百小时，乘每小时二点五美元。"`，
  `caption: "这是 8,415 个 H100 小时，乘每小时 $2.5。"`。
  timing.sentences 可保存 caption；`useFilmTiming()` 以当前 film.json 为准（包括修改或删除 caption），不改音频/帧边界。
  caption 不进入 timing 输入指纹或 voice 缓存键，只改字幕不运行 film:voice。
- 开启 KTV 双色字幕：`<FilmCaptions variant="paper" highlight="karaoke" />`（纸面片推荐）。
  `highlight` 默认为 `"none"`，不改变旧输出；`sungColor` / `unsungColor` 可覆盖已念 / 未念颜色。
  paper 默认强调红 `#9c3426` / 墨灰 `#50545b`，box 默认浅金 `#ffe08a` / 浅灰 `#cbd5e1`，
  karaoke box 使用不透明深底 `#0a0e18`，四个默认文字颜色对各自底板均 ≥4.5:1；自定义颜色或背景后重新审片。
  voice 后运行 `npm run film:captions -- --film <filmId>`，从已有 canonical narration.wav 确定性检测停顿，
  写入 timing.sentences 的可选 `clauses: [{text,startFrame,endFrame,source:"pause"|"proportional"}]`，
  帧号是正片绝对帧。检测使用 10ms RMS 窗、句峰 RMS 的 6% 阈值、最短 120ms 内部停顿；首尾静音不计入停顿。
  以念法半角单位累计比例位置与停顿中心的距离为代价，用 DP 做最大匹配数、最小总代价的顺序匹配；同代价保留较早候选。
  多余停顿忽略；缺失边界在相邻已匹配停顿之间按比例补齐，不跨越已匹配静音。各分句只要任一内部端点为补齐，
  就写 source:"proportional"，否则为 pause（句首尾来自能量实测）；存在比例分句时句子标 `estimated:"proportional"`。
  CLI 另报告 matchedBoundaries、ignoredPauses、各边界来源及 pause / mixed / proportional 总体方法；只估计，不声称词级精度。
  此步骤不初始化 TTS、不改音频、句级边界、timing 指纹或缓存键；重新 voice 后重新运行。渲染与审片不分析音频或改 timing。
  caption 与 text 保持相同分句标点（，。、；：？！）和分句数，才能逐分句对应；8,415 / $2.5 不会误拆。
  精度是分句级、分句内线性估计，不是逐字对齐；每个分句内连续填充部分字形，两行先第一行再第二行，停顿保持不动。
  分句数不符、旧 timing 没有 clauses 时按整句时间线性扫过；`karaoke-clause-mismatch` 在分句数不符时只提示、不拦交付。
  正在读的文字不抖、不缩放；自定义 `render` 完全接管字幕。双色渐变处的自动文字填充测量可能为 unknown，需看图核对两种颜色。
- paper 是偏白纸条、深灰字、轻投影与两端半透明胶带；底纸固定倾斜 0.65°，字保持水平、不 boil。
  默认纸/墨对比大于 4.5:1；style 可覆盖，覆盖后重新核对对比。纸面片使用 `<FilmCaptions variant="paper" />`。
- `resolveCaptionLines(text, maxHalfUnitsPerLine)` 返回最多两行，优先选择宽度内靠中间的标点，其次空格，再在中文字间折行；
  不拆数字、单词和 `Apache 2.0` 等版本名称，不留 ≤3 半角单位的孤行或行首标点。单个不可拆词长于行宽时保留整体，需改写文案或增加可用宽度。
  caption/paper 默认按画幅、字号、maxWidth 与 padding 计算行宽并插入换行；未写 caption 的旧 box 保留浏览器原排版，保证像素不变。
- 字幕框用 `data-axmorf-caption-box` 标记，审片在 `graphics.frames[].captionRects` 输出实际位置；自定义 render 复用可测的字幕文本框。
  手和道具不能伸进字幕框外扩 24px 的保护带。`graphic-in-caption-band` 检查非 background 标注物件的可见包围盒，
  转场窗口也报告并标记，无字幕帧跳过。`captionWarnings` 的 `caption-spoken-numerals` 在 text 连续含至少 3 个中文数字字符且没写 caption 时提示。
  两条都是审片提示，不拦检查与交付。
- `FilmSoundtrack narration={false}` 或 `music={false}` 可去掉其中一轨。
- 音效默认用 `<FilmSoundEffects />` 播放本片合成计划；显式播放用 `<FilmSoundEffects cues={cues} />`；cue、素材角色、吸附、留白和收音见 [音效轨](sound.md)。

## 内容状态标识

内容状态标识统一用 `FilmStatusTag`，不手写，放在场景轨之外；默认 `position="top-left"`，全片固定同一位置，
与主体冲突时才换另一个固定角（`top-right`/`bottom-left`/`bottom-right`）并在 storyboard.md 注明：

```tsx
<FilmStatusTag status="self-reported" detail="机制示意" />
```

- `status`：`observed` →「已发生」、`signal` →「迹象」、`speculation` →「推测」、`candidate` →「候选·待验证」、
  `opinion` →「社区观点」、`self-reported` →「作者自报」；也可直接传自定义中文文本。
- `detail?`：副词，与主词同字号、同文字颜色；默认暖白字、深色不透明底板。
- `position?`：`top-left`（默认）、`top-right`、`bottom-left`、`bottom-right`；下方位置避开默认字幕区。
- `style?`：合并到根元素，可调字体与位置。默认字号由当前画布的 `minimumReadableFontSize` 和默认字幕字号推导，
  与默认字幕同大，不写死像素。更大的自定义字幕仍需核对状态标识大小。
- 根元素带 `data-axmorf-status-tag`；`film:review` 的 `small-status-tag` 按实际渲染（含缩放）的字号，
  提示主词或副词低于实测字幕字号的 70%。句间无字幕时用当前画布的默认字幕字号；只提示，不拦检查或交付。
  同时看图确认对比与手机可读性，不把没有提示当作人工审片通过。

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
- `enter?: { kind, frames, sfx?, tint? }` 挂在进入的场景上；第一场不能写。`frames` 为正整数，窗口是
  `[B − floor(frames/2), B + ceil(frames/2))`，不能重叠、越出正片，且 frames 不得超过任一相邻场景名义时长的一半。
- 覆盖式 kind：`light-leak`、`flash`、`whip-blur`、`mask-wipe`（`FILM_OVERLAY_TRANSITIONS`）。
  不改变场景绝对边界，优先用于有动机的跨章换景。
- 重叠式 kind：`fade`、`slide`、`wipe`、`iris`、`zoom-blur`、`linear-blur`、`cross-zoom`、`match-scale`
  （`FILM_OVERLAP_TRANSITIONS`）。resolver 反推 Sequence 时长以抵消重叠扣减，名义边界和正片总长不漂移。
- `tint` 仅用于 `mask-wipe`，例如 `enter: { kind: "mask-wipe", frames: 12, tint: "#f5dfb9" }`；
  默认半透明暖白，羽化渐变带有亮边、中心透明，可透出底下的下一场景；不改变场景切换边界。
- `sfx` 可覆盖默认角色，`false` 禁止建议。声音不会自动播放：显式把 `sfxCues` 交给音效轨。

`resolveFilmSceneTrack(film, scenes)` 是纯函数，film 至少提供 `durationInFrames/timing`；返回
`{ scenes, durationInFrames, sfxCues }`。每场含 `scene/boundaryFrame/startFrame/endFrame/durationInFrames/enter`；
`enter` 为 null 或 `{kind, mode, boundaryFrame, startFrame, endFrame, frames, tint?}`。建议 cue 位于名义边界。

## 音效轨与配乐段落

`FilmSoundEffectCue` 必有非空 `for` 与 `sfx`，并且只选 `frame` 或 `endFrame` 之一；
可选 `snap: none | beat | bar | accent | section`、`maxShiftFrames`、`minFrame/maxFrame`、`volume`。
`sfx: FilmSoundEffectSource` 是 `"plan:<id>"` 本片计划引用、共享短名/资源 descriptor，或 `{asset: FilmAsset, durationInSeconds: number}`。
字符串不能当任意素材路径。`resolveFilmSoundEffects(film, cues?)` 要求 film 的 `spec/timing/music/durationInFrames`（计划引用还需要 `sfx`），
返回 `ResolvedFilmSoundEffect[]`：音频贡献加 `sfxId/for`。`FilmSoundEffects` 在 FilmProvider 内读取 film 并播放贡献。
完整参数语义与可运行片段见 [音效计划](sound.md)。

`FilmSoundEffects` 不传 cues 时播放 `sound.effects` 生成计划；传 cues 时只播放显式项，空数组静音。
`film:sfx` 输出本片 WAV 与 `generated/sfx.json`（指纹、PCM 样本、实际起止/对齐帧）；`film:check` 验证一致性。
`params` 范围：pitch −36–36 半音；brightness/intensity/tail 0–1；stereo −1–1（符号决定扫动方向，0 双声道同相）；seed 0–4294967295。
省略时 pitch=0、brightness=0.5、intensity=0.7、tail=0.5、stereo=0.35，seed 使用固定种子；时长始终由动作决定。
计划 schema：`{id, kind, frame, durationFrames, anchor: "start"|"end"|"center", params?, for}`，详细语义见 [音效计划](sound.md)。

### 音乐事件与能量

`useFilmTiming().music?.onsets` 可选：`{kick, snare, clap, hat, bass, hits, sections}`，基础项为正片绝对帧数组。v3 另有可选 fills/breaks `{from,to}` 区间及 accents `{frame,strength}`；accentFrames 与 accents 的 frame 一致。
它来自合成事件，已经处理 startFrame 和循环；旧 track 可无此字段。主要动作使用这些事件帧或 `accentFrames`。
`music.alignment` 记录搜索得到的 bpm 与段落 `{sectionIndex, requestedFrame, actualFrame, residualFrames}`；残差有符号。

`useFilmMusicEnergy({ bands?: 3, windowInSeconds?: number } = {})` 返回 `{low, mid, high} | null`。
bands 固定为 3；windowInSeconds 默认 5，最小 0.5，同一次挂载不可改变。
先运行 `film:music`；无生成配乐时调用会报错，加载中返回 null。只通过 `staticFile` 读取本片 WAV，
内部 `useWindowedAudioData` + `visualizeAudio` 对数分频、幅度压缩及无状态平滑，按当前帧计算，乱序渲染结果相同。
它只用于辉光/呼吸等次级运动，主要落点必须用事件帧；在正片根时钟中调用，然后把结果传给场景子组件。

```tsx
const frame = useCurrentFrame();
const { music } = useFilmTiming();
const energy = useFilmMusicEnergy();
const lastKick = music?.onsets?.kick.filter((at) => at <= frame).at(-1);
const flash =
  lastKick === undefined ? 0 : Math.max(0, 1 - (frame - lastKick) / 6);
// 灯在 kick 的同一帧亮起；辉光连续强度读取 energy?.low ?? 0。
```

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
世界镜头接线见 [导演手册](direction.md#41-用运行时接好三层动效)；可辨认物体的美术示例见 [示例段落](examples.md)。

其他镜头工具：`ProducerCamera2D`、`ProducerCamera3D`、`ProducerLayeredStage`、`ProducerFocusPull`。

## 节奏反应

`pickRhythmResponse(barIndex, responses, {seed?})` 返回确定性轮换的kind或空词库的null；去重后不足2种无法轮换时抛错。
`resolveBoilSeed(frame, {fps?, stepFrames?, beats?})` 返回描边索引；默认fps30、步长round(fps/12)，beats传入时仅按其拍点切换，空网格不动。
`useBoilSeed({stepFrames?, beats?, frame?})` 取composition fps，支持正片frame覆盖。
`useRhythmResponse({object, kind, frames, scope?})` 上报物件动作；scope默认object，全局效果用global；预留global-light/global-scale/breath-scale不会被当作物件动作。
`useBreathScale(options?)` 返回与resolveBreathScale一致的补充全局缩放并上报global-scale，旧纯函数行为/像素不变。
都从 rhythm 公共入口导出，按 [导演手册](direction.md#42-l1-反应词库与轮换) 组织章节轮换。审片只提示，不拦交付。

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

## 节奏驱动动效

导演规则与可编译接线见 [direction.md 第 4 节](direction.md#4-三层动效核心)。均从 `@axmorf/studio/remotion` 导出。
事件数组升序、全部计正片；hook 在 Film 根调用，Sequence 内传正片根 frame。

| API                      | 签名与结果                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lastAtOrBefore`         | `(frame, events: readonly number[]) => number`；二分，无过去事件为 -Infinity。                                                                         |
| `resolveBeatPulse`       | `(frame, events, { decayFrames = 8 }?) => number`，0..1 指数衰减。                                                                                     |
| `resolveBeatPulseEvents` | `(music, events = "kick") => readonly number[]`；kick 仅在旧 track 缺 onsets 时回退 beatFrames；fill/break 返回区间起点，accent 优先读带强度事件的帧。 |
| `useBeatPulse`           | `({ events?, decayFrames?, frame? }?) => number`；events 为 kick/beat/bar/accent/fill/break 或升序帧数组，无配乐为 0。                                 |
| `resolveNarrationActive` | `(frame, sentences: readonly {startFrame, endFrame}[]) => boolean`，半开区间。                                                                         |
| `useNarrationActive`     | `({ frame? }?) => boolean`；逐句判断，句间停顿为 false。                                                                                               |
| `resolveBreathScale`     | `(pulse, narrating?) => number`；背景/非阅读主体均为 3.5%，第二参数只保留兼容。                                                                                             |
| `resolveBarCamera`       | `(frame, { bars, shots, fps, config? }) => { center: readonly [number, number], zoom: number }`。                                                      |
| `useBarCamera`           | `(shots: readonly BarCameraShot[], { frame?, config? }?)`；shots 每项 `{center, zoom}`，首小节从 shots[0] 走向 shots[1]，耗尽后停住。                  |
| `barCameraShots`         | `(state, anchor) => readonly ProducerWorldShot[]`；传 ProducerWorldCamera 的 shots 和 frame=1，anchor 固定用初始机位。                                 |
| `barCameraChangeFrames`  | `(bars, shots) => number[]`；仅实际不同机位的起点，持平/耗尽不算 L2。                                                                                  |
| `resolveImpact`          | `(frame, at: ImpactEvents, fps, { preFrames = 6 }?) => {strength, pre, hit, scale, shake}`。                                                           |
| `useImpact`              | `(at, { frame?, preFrames? }?)`；事件数组中下一次蓄力优先于上一回弹；空事件保持不动。                                                                  |

`resolveImpactLevel(strength)` 返回三档建议 `{cameraImpulse, subjectScale, shakePixels, flashOpacity, particleCount}`；边界为 0.5 / 0.9。主体缩放为峰值倍率，强档 1.12、镜头增量 .12、shake 16px、可选闪光 .5（最多 4 帧），详见导演手册。

`ImpactEvents` 为帧、升序帧数组或升序 `{frame,strength}` 数组；加权重音按 strength 缩放动作，不改变落点。

bar camera 默认 spring damping=18 / stiffness=120；impact damping=11 / stiffness=260 / mass=.6。
pre 在落点前 6 帧由 0 蓄至 1，落点 hit 从 0 开始；shake 仅落点后 6 帧，确定性 random。
新 hook 复用 review-only 遥测，上报完整事件计划；无 review provider 不产生额外画面或声音。
`motion.summary.rhythmSync` 的 accents/landings/sounds/bars 含 total/matched，测量不足为 null。
四条同步 warning 与 unknown 的人工回应见 [导演手册第 9 节](direction.md#9-自检看-animatic-时逐条回答写帧号)。

`motion.summary.motionEnergy.p99` 是强重音冲击阈值（p95 仅保留对照）；像素预备条件不能判断配方过程是否被隐藏。
`motion["strong-accent-strip"]` 返回每个 strength ≥.9 重音的 `{frame, strength, frames, image, message}`，
逐帧范围为正片 [f-8,f+4]。每张必须人工查看并在 `review-notes.md` 按帧号记录主体/数字/文字过程可见性；无提示也必须看。
