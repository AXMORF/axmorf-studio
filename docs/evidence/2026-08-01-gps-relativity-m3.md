# GPS Relativity M3 Narrative Baseline Evidence

> 验收日期：2026-08-02  
> 范围：M3 Narrative Baseline runtime、静态 Story 注册、透明 PNG 与完整 render 的机械验收。

## 1. 上游身份

- Story：`gps-relativity`
- Composition：`GpsRelativity`
- sealed narration fingerprint：
  `sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5`
- SemanticTiming fingerprint：
  `sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c`
- complete audio checksum：
  `sha256:9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98`
- complete audio：48 kHz mono s16le，`2721600` sample frames，`56.700000` 秒。

以上 M2 产物由 M3 只读消费；验收没有调用 provider、生成 chunk、重新封存或 supersede。

## 2. Registry 与 Baseline 身份

- generator ID：`project-registry-generator-v1`
- generated registry checksum：
  `sha256:6b2b697a8b1d56e8179b7dcf254ad62ea0e92385b7e39a9e660baaaf479b472c`
- generated entry checksum：
  `sha256:d39a9c87446efdc2796402b4154484371c080580cd8d9d79cd82f9e5e5bc46ec`
- ProjectRegistry entry fingerprint：
  `sha256:25f60e077179d5da6a13dda813a808095eb74c8e4afdfbb4e8f8bbe964ea6f59`
- Narrative Baseline fingerprint：
  `sha256:8e55b2c7d31f4b56ee777e9d806744327f90ba76f973e41146e4809fa09458c9`
- M3 evidence fingerprint：
  `sha256:d265ee5c39b2f1777eea589e9f6b42ea50173944ecaca75904f25207de65c9d9`

`npm run registry:check` 对 tracked generated source 做 byte-for-byte 校验。真实
Composition listing 为：

```text
CapabilityGallery    30 fps  1920x1080   150 frames
GpsRelativity        30 fps  1920x1080  1731 frames
```

Story entry 使用生成源码中的字面量 `import("./gps-relativity/Composition")` 和 Remotion
`lazyComponent`；Root 没有扫描目录、读取 Story JSON 或静态导入 Story Composition。

## 3. 透明 PNG 验收

| 产物                                            |  帧 | checksum                                                                  | alpha 事实                                                 |
| ----------------------------------------------- | --: | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `out/gps-relativity/m3-transparent-frame-0.png` |   0 | `sha256:ff4af1a46528ccee81838756b0141504186853f2d2122b930f2328b3ff6a63af` | 全帧 `alphaMin=0`、`alphaMax=0`                            |
| `out/gps-relativity/m3-caption-frame-15.png`    |  15 | `sha256:4e61d1652e27b869bed3666eeb777d273b17c4887f89ba63b80739c1002aba64` | 全帧 `alphaMin=0`、`alphaMax=255`；左上 64×64 `alphaMax=0` |

frame 15 的真实 still 可见第一条字幕“手机定位，表面上是在算位置，底层先是在比较时间。”；
字幕位于下方安全区内，没有裁切，字幕容器以外区域保持透明。该观察只证明机械布局和
像素边界，不是 M4 NarrativeCheck 或创意质量批准。

## 4. 完整 render 验收

- 本地产物：`out/gps-relativity/m3-narrative-baseline.mp4`（ignored，不进入 Git）
- checksum：
  `sha256:475f47e72864f889325d2cd1d451400eb237682fbef45ab09d634eab92a5195f`
- video：H.264，30 fps，1920×1080，`1731` decoded frames，`57.700000` 秒；
- audio：AAC，48 kHz，2 channels，单一 audio stream；
- stream count：1 video + 1 audio；
- 完整 `ffmpeg` video/audio decode smoke 退出 0；没有截断或第二条旁白轨；
- complete WAV 只由一个 `<Sequence from={15}>`、一个 `Html5Audio`、
  `playbackRate={1}` 挂载；十条字幕只消费既有绝对 CaptionCue。

H.264 不保存 alpha，播放器中的黑色显示是编码容器对透明区域的呈现，不是
NarrativeCore 绘制的背景。透明事实以上述 PNG alpha 检查为准。

## 5. 隐私、保护与范围

- 所有 listing、still、render、evidence 和 M2 checker 命令均显式 unset
  `RSP_VOXCPM_PRIVATE_CONFIG`；
- evidence receipt 和本文不包含 provider endpoint、token、reference audio、私有路径或
  candidate workspace；
- M2 active manifest、SemanticTiming、sealed narration directory 与 M2 evidence 保持
  byte-identical；
- M3 没有实现 `project:check`、AutoCheck 聚合、NarrativeCheck、Scene、BaseCanvas、
  ResourceCatalog、RendererRegistry、StoryVisualTrack、SoundDesignTrack、
  GlobalVisualLayers 或转场；这些仍属于 M4 或更后续阶段。
