# 运行时 API

全部从 `@axmorf/studio/remotion` 导入；Remotion 本身的 API（`AbsoluteFill`、`Sequence`、`interpolate`、`spring`、
`Img`、`Audio`、`staticFile`、`random`、`useCurrentFrame`、`useVideoConfig`）从 `remotion` 导入，`@remotion/*`
扩展包（`transitions`、`paths`、`shapes`、`three`、`lottie`、`google-fonts` 等）也都可用。

## 本片时序

```tsx
const { spec, timing, music } = useFilm();          // film.json 与生成文件的原始数据
const t = useFilmTiming();
t.fps; t.durationInFrames;
t.narrationStartFrame; t.narrationEndFrame;
t.sentences;                 // [{ id, text, startFrame, endFrame }]，全片绝对帧
t.sentence("s03").startFrame;
t.music?.barFrames;          // 另有 beatFrames、sectionFrames、accentFrames、bpm、beatsPerBar、framesPerBeat
```

`<Sequence from={t.sentence("s03").startFrame - 10}>` 里的子组件拿到的 `useCurrentFrame()` 从 0 开始；
在 Sequence 内对齐全片帧时记得减去 `from`。

## 必须挂载

```tsx
<AbsoluteFill>
  {/* 画面 */}
  <FilmSoundtrack />   {/* 旁白 + 配乐 + 旁白下自动压低 + 结尾淡出 */}
  <FilmCaptions />     {/* 当前句字幕；放在最上层 */}
</AbsoluteFill>
```

- `FilmCaptions` 可调 `bottom`（离底边的画面高度比例）、`maxWidth`、`style`，或用
  `render={(sentence, progress) => ...}` 自定义字幕外观（例如逐字高亮）。
- `FilmSoundtrack narration={false}` 或 `music={false}` 可去掉其中一轨。
- 音效用 Remotion 的 `<Sequence from={落点帧}><Audio src={staticFile("assets/axmorf-shared/audio/sound-effects/axmorf-whoosh-short-v1.wav")} volume={0.6} /></Sequence>`。
  共享音效：`ui-click`、`soft-pop`、`snap-lock`、`whoosh-short`、`whoosh-sweep`、`soft-impact`、`confirm-chime`、`sparkle-accent`、
  `mouse-click`、`keyboard-tap`、`typing-burst`、`toggle-switch`、`drag-pickup`、`drop-settle`、`swish-reverse`、`card-flip`、
  `notification-ping`、`warning-blip`、`success-arpeggio` 等，文件名为 `axmorf-<名称>-v1.wav`。

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
  background={<Environment />}   // 铺满的环境层，深度默认 0.35
  subject={<Subject />}          // 主体层
  foreground={<Leaves />}        // 前景遮挡，深度默认 1.4
  overlay={<Label />}            // 不随镜头运动的稳定文字层
  drift={{ amplitudePx: 6, periodFrames: 180 }}
/>
```

`focus` 是画面内的相对坐标（0–1），`zoom` 1–8，可选 `rotation` ±8 度。`frame` 默认取当前帧。
其他镜头工具：`ProducerCamera2D`、`ProducerCamera3D`、`ProducerLayeredStage`、`ProducerFocusPull`。

## 运动

- `snapProducerFrameToBeat(frame, grid, { maxShiftFrames, minFrame, maxFrame })`：把落点吸附到最近的拍，超出窗口时保留原帧。
- `resolveProducerSettle`、`resolveProducerFollow2D`、`resolveProducerGather2D`、`resolveProducerPointMorph2D`：
  无状态的惯性、跟随、聚拢和形变计算，任意帧都能直接求值。
- `@remotion/transitions` 的 `TransitionSeries` 适合段落之间的硬切、擦除、滑入。

## 界面组件

软件、开发、开源题材用真实界面，而不是几个矩形：

- `InterfaceWindow`：浏览器或应用窗口外壳（`width`、`height`、`minFontSizePx`、`variant: "browser" | "app"`、`title`、`url`、`theme`）。
- `TerminalPanel`：逐字打出的终端（`lines: [{ kind: "command" | "output" | "success" | "error" | "comment", text }]`、
  `minFontSizePx`、`startFrame`、`charsPerFrame`、`lineDelayFrames`）。
- `CodePanel`：逐行出现、可高亮的代码（`code`、`minFontSizePx`、`fileName`、`framesPerLine`、`startFrame`、`highlights`）。
- `RepositoryCard`：仓库卡片（`owner`、`name`、`description`、`language`、`stars`、`topics`、`width`、`minFontSizePx`）。
- `interfaceThemes.dark` / `interfaceThemes.light` 作为 `theme`。

## 其他

- 媒体：`ProducerLocalVideo`、`ProducerAnimatedImage`、`ProducerLottie`。
- 数据：`BarChart`；文字：`fitProducerText` 按宽度求字号。
- 背景与特效：`GradientShiftBackground`、`MetaBallsPrimitive`、`@remotion/light-leaks`、`@remotion/motion-blur`。
- 3D：`@remotion/three` 与 `@react-three/fiber`。

这些都是可选工具；只在它们表达当前画面时使用，没有使用数量要求。
