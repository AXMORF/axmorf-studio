# 最终产品目标

## 一句话目标

把“内容到完整视频”拆成稳定的叙事主线和可独立替换的 Scene 视觉任务：即使没有视觉
增强，旁白、字幕和基础画布也能完整讲完故事；视觉质量主要在 Scene 层持续提升。

## 最终结构

```mermaid
flowchart TB
    User["用户内容 / 主题 / 资料"] --> Story["Story"]
    Story -->|"1:N 有序"| Beat["StoryBeat<br/>单一语义 / meaningId"]

    Beat -->|"1:1"| Chunks["authored ttsChunks"]
    Chunks -->|"1:N"| Generate["VoxCPM 候选 TTSChunk 音频"]
    Generate --> Seal["实测 / checksum / fingerprint / 封存"]
    Seal --> Captions["CaptionCue<br/>与 TTSChunk 1:1"]
    Seal --> Audio["完整旁白音频"]
    Audio --> Core["NarrativeCore"]
    Captions --> Core
    Beat --> Core
    Base["BaseCanvas"] --> Core
    Registry["Generated Static ProjectRegistry<br/>lazyComponent loader"] --> Composition

    Beat -->|"1:1"| Scene["Scene<br/>独立视觉任务"]
    Scene -->|"1:N"| Shot["Shot"]
    Catalog["统一资源目录<br/>资产 / 组件 / 镜头 / 特效"] --> Scene
    Scene --> Package["ScenePackage<br/>1 个 Scene renderer 入口"]
    Package --> Visual["StoryVisualTrack"]
    Transition["相邻 StoryBeat 转场"] --> Visual

    Core --> Composition["Composition"]
    Visual --> Composition
    Sound["BGM / ambience / SFX"] --> Composition
    Global["全局视觉层"] --> Composition
```

```text
1 Story = 1 Composition
1 Story = N StoryBeat
1 StoryBeat = 1 meaningId = 1 NarrationUnit = 1 Scene
1 NarrationUnit = 1 ttsChunks collection = N TTSChunk = N CaptionCue
1 completed Scene = 1 ScenePackage
1 ScenePackage = 1 Scene-level rendererId
1 Scene renderer = N Shot
N StoryBeat = N-1 StoryBeatTransition

Composition = NarrativeCore + selected optional EnhancementTracks
EnhancementTracks = StoryVisualTrack / SoundDesignTrack / GlobalVisualLayers
```

## 两个权威

- `StoryBeat` 是语义权威：决定表达什么、为什么进入下一段。
- 实测旁白时间线是时间权威：决定什么时候开始、持续多久。

Scene 与转场同时服务 StoryBeat 语义和实测时间，不能只根据台词字面生成，也不能反向
修改旁白与字幕时间。

## 实施顺序与依赖方向

系统先完成不依赖 Scene 的必需主链：

```text
VideoBrief
→ StorySpec + NarrationSpec + RenderSpec
→ StoryBeat + 已创作 ttsChunks
→ 实测并封存的完整旁白
→ SemanticTiming + CaptionCue
→ NarrativeCore
→ Generated Static ProjectRegistry + lazy-loaded Composition
→ Narrative Baseline
```

StoryVisualTrack、SoundDesignTrack 和 GlobalVisualLayers 都是独立下游增强轨。它们可以
缺失，可以分别重做，只能消费已封存叙事主链，不能反向改写 Story、旁白、字幕或时间线。
Scene 的具体视觉表达最后设计。完整阶段、产物与失效边界见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。

其中 RenderSpec 由用户在每次制作时直接提供，Agent 只做结构化和机械校验，不重复请求
确认。旁白时间用封存 PCM 的整数 sample-frame 数累计后统一量化到帧，不用逐段浮点
秒数推算。

## 节点责任

系统节点分为 `创作决策`、`制作编排` 和 `确定性执行`。Agent 贯穿前两类工作并调用
确定性工具，但正式渲染运行时不调用 Agent 或 skill。具体标注见
[ARCHITECTURE.md](ARCHITECTURE.md)。

## 不可偷换的边界

- Scene、Shot、TTSChunk 与 Remotion `<Sequence>` 不是同一个概念。
- NarrationUnit 与 Scene 是同一 StoryBeat 的语言表达和视觉表达，不互相拥有。
- Narrative Baseline 不依赖 ScenePackage；Scene 完成视觉制作后才产生可装配的
  ScenePackage。
- NarrativeCore 是唯一必需轨；视觉、声音设计和全局效果缺失时，Narrative Baseline
  仍必须可检查、预览和渲染。
- ProjectRegistry 在 bundle 前自动发现固定目录并生成静态注册元数据；Story Composition
  通过 Remotion `lazyComponent` 按需加载。它不依赖后续 Scene 级 RendererRegistry。
- 每个 ScenePackage 只绑定一个 Scene 级 `rendererId`；ShotPlan 不绑定 `rendererId`、
  组件或模块路径。
- Scene renderer 是 runtime 的单一视觉入口，但内部可以拆分多个本地 Shot 组件并调用
  已批准共享能力；这些内部组件不成为独立 runtime registry 入口。
- CaptionLayer 顶层唯一；Scene renderer 不播放旁白、不渲染字幕。
- NarrativeCore 与 StoryVisualTrack 在同一个 Composition 中实时叠加，不预渲染成
  两条视频再合成。
- v1 转场只支持 hard cut 与不改变总时长的 visual-only overlay；双 Scene overlap
  等待明确的 input/output handles 模型。
- “确定性 TTS”指固定生成、实测和产物封存流程，不承诺模型生成的波形 bit-by-bit
  可重复；封存音频及其 checksum、fingerprint 才是后续时间权威。
- 运行时只消费静态源码、合同数据和本地资产，不调用 skill、Agent 或网络。
- 数据只保存声明和稳定 ID；不承载 JSX、代码或动态模块路径。
- 新 Scene 只能参考当前输入与已注册共享能力，不能参考旧 Scene 或旧 Composition。
- 新能力默认 composition-local；共享提取必须经过用户针对具体 proposal 的明确批准。
- 项目只使用宿主机 Node/npm，不使用 Docker。

## 完成定义

最终系统应能：

1. 从用户内容得到有序 StoryBeat 与已拆分 `ttsChunks`；
2. 生成并实测旁白，确定 CaptionCue 与完整绝对时间线；
3. 立即得到可独立预览的 Narrative Baseline；
4. 把每个 StoryBeat 作为独立 Scene 任务，通过一个 Scene 级 renderer 入口制作、替换
   和审核；
5. 从统一目录查询本地资产与共享制作能力；
6. 用 generated static ProjectRegistry 注册 Story Composition，通过 `lazyComponent`
   按需加载组件，并在视觉阶段用 composition-local RendererRegistry 绑定 Scene renderer；
7. 以少量机械检查、批量视觉审核和一次最终预览批准完成交付；
8. 在用户明确批准后，把被多个真实主题证明的能力提升到共享层。

确定性执行的具体实现边界见
[DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)。
