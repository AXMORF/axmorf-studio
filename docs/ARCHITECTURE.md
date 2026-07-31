# 系统结构

## 总结构

```mermaid
flowchart TB
    Brief["VideoBrief<br/>内容 / 受众 / 时长 / 风格"] --> Story["Story"]
    Story -->|"1:N"| Beat["StoryBeat<br/>meaningId"]

    Beat --> Chunks["ttsChunks"]
    Chunks --> TTS["TTS + 实测"]
    TTS --> Timing["绝对 SemanticTiming"]
    TTS --> Narration["NarrationUnit<br/>完整音频 + CaptionCue"]
    Story --> Core["NarrativeCore"]
    Timing --> Core
    Narration --> Core
    Base["BaseCanvas"] --> Core
    Core --> Baseline["Narrative Baseline"]

    Beat --> Plan["SceneVisualPlan"]
    Timing --> Plan
    Context["StoryContext<br/>风格 / 相邻关系 / 连续性"] --> Plan
    Catalog["ResourceCatalog<br/>统一只读查询"] --> Plan
    Plan --> Package["ScenePackage"]
    Package --> VisualUnit["SceneVisualTrack"]

    Beat --> Transition["StoryBeatTransition"]
    VisualUnit --> Visual["StoryVisualTrack"]
    Transition --> Visual

    Core --> Assembly["CompositionAssembly"]
    Visual --> Assembly
    Sound["SoundDesignTrack"] --> Assembly
    Global["GlobalVisualLayers"] --> Assembly
    Assembly --> Composition["Composition"]
```

## Scene 内部

```mermaid
flowchart TB
    Beat["StoryBeat<br/>语义"] --> Plan
    Timing["StoryBeatTiming<br/>总时长 / chunk ranges"] --> Plan
    Context["相邻连续性 / 画幅 / 安全区"] --> Plan
    Catalog["ResourceCatalog<br/>候选资产与能力"] --> Plan

    subgraph Design["Scene 画面方案"]
      Plan["SceneVisualPlan<br/>主体 / 动作 / 含义 / 主构图<br/>Shot / 镜头 / 调度 / 资源"]
      Plan -->|"1:N"| Shot["ShotPlan<br/>局部帧范围 / rendererId / 动机"]
      Plan --> Refs["SelectedResourceRef[]"]
    end

    subgraph Authoring["Scene 制作"]
      Shot --> Source["composition-local Renderer.tsx"]
      Refs --> Source
      Source --> Registry["静态 RendererRegistry<br/>rendererId → component"]
    end

    subgraph Runtime["确定性运行"]
      Timing --> Frame["sceneFrame / shotFrame"]
      Registry --> Renderer["SceneRenderer<br/>只输出视觉"]
      Frame --> Renderer
      Renderer --> Track["SceneVisualTrack"]
    end

    subgraph Review["审核"]
      Track --> Evidence["代表帧 / 必要时 motion strip"]
      Evidence --> Check["SceneVisualCheck"]
    end
```

## 图层与音轨

```text
视觉层（上 → 下）
CaptionLayer
GlobalVisualLayers / StoryBeatTransition overlay
SceneVisualTrack
BaseCanvas

非视觉音轨
NarrationAudioTrack
SoundDesignTrack：BGM / ambience / SFX
```

## 时间坐标

```text
compositionFrame：完整视频绝对帧
sceneFrame = compositionFrame - sceneStartFrame
shotFrame = sceneFrame - shotStartFrame
```

所有持久化范围统一为左闭右开的 `[startFrame, endFrame)`，并明确使用绝对帧还是局部帧。

## Remotion 对应

```text
Story                 -> Composition
StoryBeat             -> 语义数据 + Scene 外层 Sequence
Scene                 -> 独立视觉任务
Shot                  -> Scene 内局部 Sequence
NarrationAudioTrack   -> Composition 绝对音轨
CaptionLayer          -> Composition 顶层透明视觉层
StoryBeatTransition   -> Scene 边界上的等时长视觉实现
```

`<Sequence>` 只提供局部时间和挂载范围。图层叠加由 JSX 同时存在、节点顺序、定位与
z-index 决定；Sequence 数量不等于 Scene 或 Shot 的业务数量。

## 确定性装配边界

Assembly 可以校验、定位、查 registry、装配图层和执行已声明 preset；不能选择或重排
StoryBeat，不能改台词和 timing，也不能自动选择资源、Shot、镜头、renderer 或转场。
