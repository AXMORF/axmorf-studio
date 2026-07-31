# 系统结构

## 节点责任

```text
【创作决策】决定表达什么，以及采用什么视觉、声音和审美方案
【制作编排】把已确定方案落实为资源引用、源码、组件和静态绑定
【确定性执行】脚本、组件或运行时根据确定输入生成可重复结果
```

Agent 贯穿创作与制作过程：参与创作决策、完成制作编排并调用确定性工具，但不作为
结构节点，也不进入正式渲染运行时。自动化只能检查和执行已确定输入，不能自行选择
StoryBeat、Scene 方案、Shot、资源、镜头、声音或转场。

## 总结构

```mermaid
flowchart TB
    Brief["VideoBrief<br/>内容 / 受众 / 时长 / 风格"] --> Story["Story<br/>【创作决策】"]
    Story -->|"1:N"| Beat["StoryBeat<br/>meaningId<br/>【创作决策】"]

    Beat --> Chunks["ttsChunks<br/>已拆分台词集合<br/>【创作决策】"]
    Chunks --> TTS["TTS + 实测<br/>【确定性执行】"]
    TTS --> Timing["绝对 SemanticTiming<br/>【确定性执行】"]
    TTS --> Narration["NarrationUnit<br/>完整音频 + CaptionCue<br/>【确定性执行】"]
    Story --> Core["NarrativeCore<br/>【确定性执行】"]
    Timing --> Core
    Narration --> Core
    Base["BaseCanvas<br/>【确定性执行】"] --> Core
    Core --> Baseline["Narrative Baseline<br/>【确定性执行】"]

    Beat --> Plan["SceneVisualPlan<br/>画面 / Shot / 镜头 / 资源<br/>【创作决策】"]
    Timing --> Plan
    Context["StoryContext<br/>风格 / 相邻关系 / 连续性<br/>【创作决策】"] --> Plan
    Catalog["ResourceCatalog<br/>统一只读查询<br/>【确定性执行】"] --> Plan
    Plan --> Package["ScenePackage<br/>资源 / Renderer / 静态绑定<br/>【制作编排】"]
    Package --> VisualUnit["SceneVisualTrack<br/>【确定性执行】"]

    Beat --> Transition["StoryBeatTransition<br/>语义关系 / 动机 / preset<br/>【创作决策】"]
    VisualUnit --> Visual["StoryVisualTrack<br/>【确定性执行】"]
    Transition --> Visual

    Story --> SoundPlan["SoundDesignPlan<br/>【创作决策】"]
    SoundPlan --> Sound["SoundDesignTrack<br/>【确定性执行】"]
    Story --> GlobalPlan["GlobalVisualPlan<br/>【创作决策】"]
    GlobalPlan --> Global["GlobalVisualLayers<br/>【确定性执行】"]

    Core --> Assembly["CompositionAssembly<br/>【确定性执行】"]
    Visual --> Assembly
    Sound --> Assembly
    Global --> Assembly
    Assembly --> Composition["Composition<br/>【确定性执行】"]

    classDef creative fill:#2b2142,stroke:#a78bfa,color:#f8fafc;
    classDef orchestration fill:#422b18,stroke:#f59e0b,color:#f8fafc;
    classDef deterministic fill:#12383d,stroke:#22d3ee,color:#f8fafc;
    class Story,Beat,Chunks,Plan,Context,Transition,SoundPlan,GlobalPlan creative;
    class Package orchestration;
    class TTS,Timing,Narration,Core,Base,Baseline,Catalog,VisualUnit,Visual,Sound,Global,Assembly,Composition deterministic;
```

## Scene 内部

```mermaid
flowchart TB
    Beat["StoryBeat<br/>语义权威<br/>【创作决策】"] --> Plan
    Timing["StoryBeatTiming<br/>总时长 / chunk ranges<br/>【确定性执行】"] --> Plan
    Context["相邻连续性 / 画幅 / 安全区<br/>【创作决策】"] --> Plan
    Catalog["ResourceCatalog<br/>候选资产与能力<br/>【确定性执行】"] --> Plan

    subgraph Design["Scene 画面方案"]
      Plan["SceneVisualPlan<br/>主体 / 动作 / 含义 / 主构图<br/>Shot / 镜头 / 调度 / 资源<br/>【创作决策】"]
      Plan -->|"1:N"| Shot["ShotPlan<br/>局部帧范围 / rendererId / 动机<br/>【创作决策】"]
      Plan --> Refs["SelectedResourceRef[]<br/>【创作决策】"]
    end

    subgraph Authoring["Scene 制作"]
      Refs --> Resolve["资源解析与校验<br/>【确定性执行】"]
      Catalog --> Resolve
      Shot --> Source["composition-local Renderer.tsx<br/>【制作编排】"]
      Refs --> Source
      Resolve --> Source
      Source --> Registry["静态 RendererRegistry<br/>rendererId → component<br/>【制作编排】"]
    end

    subgraph Runtime["确定性运行"]
      Timing --> Frame["sceneFrame / shotFrame<br/>【确定性执行】"]
      Registry --> Renderer["SceneRenderer<br/>只输出视觉<br/>【确定性执行】"]
      Frame --> Renderer
      Renderer --> Track["SceneVisualTrack<br/>【确定性执行】"]
    end

    subgraph Review["审核"]
      Track --> Evidence["代表帧 / 必要时 motion strip<br/>【确定性执行】"]
      Evidence --> Check["SceneVisualCheck<br/>语义 / 构图 / 运动 / 连续性<br/>【创作决策】"]
    end

    classDef creative fill:#2b2142,stroke:#a78bfa,color:#f8fafc;
    classDef orchestration fill:#422b18,stroke:#f59e0b,color:#f8fafc;
    classDef deterministic fill:#12383d,stroke:#22d3ee,color:#f8fafc;
    class Beat,Context,Plan,Shot,Refs,Check creative;
    class Source,Registry orchestration;
    class Timing,Catalog,Resolve,Frame,Renderer,Track,Evidence deterministic;
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
