# 系统结构

> Status：M1 合同内核、M2 真实旁白生成/封存和 M3 NarrativeCore、ProjectRegistry、
> lazy Story Composition、Narrative Baseline evidence 已实现；M4 检查闭环和全部 Scene
> 能力仍未实现。

## 节点责任

```text
【创作决策】决定表达什么，以及采用什么视觉、声音和审美方案
【制作编排】把已确定方案落实为资源引用、源码、组件和静态绑定
【确定性执行】脚本、组件或运行时根据确定输入生成可重复结果
【外部生成边界】允许调用结果非 bit-by-bit 可重复的服务，输出先作为候选产物
```

Agent 贯穿创作与制作过程：参与创作决策、完成制作编排并调用确定性工具，但不作为
结构节点，也不进入正式渲染运行时。自动化只能检查和执行已确定输入，不能自行选择
StoryBeat、Scene 方案、Shot、资源、镜头、声音或转场。

## 当前设计顺序

Scene 外部叙事生产主链按以下顺序推进：

```text
VideoBrief → StorySpec + NarrationSpec → StoryBeat + authored ttsChunks → StoryCheck
用户本次制作参数 → RenderSpec（结构化与机械校验，不二次确认）
StoryCheck → VoxCPM generation boundary → sealed narration
sealed narration + RenderSpec → SemanticTiming + CaptionCue
→ NarrativeCore
→ Generated Static ProjectRegistry + lazy-loaded Composition
→ Narrative Baseline
→ AutoCheck / NarrativeCheck（M4）
```

当前 M3 已实现到 Narrative Baseline：透明 NarrativeCore、tracked generated registry、
`GpsRelativity` lazy Composition、透明 still、全长 render 和 evidence receipt 均已落地。
箭头后续的 AutoCheck 聚合与 NarrativeCheck 仍是 M4 目标。

这条主链必须在不存在 ScenePackage、renderer registry、视觉资源目录、SoundDesignTrack
和 GlobalVisualLayers 时独立工作。Scene、声音和全局效果是只读消费叙事主链的下游增强
轨；当前只保留未来接口，不继续设计视觉表达。详细流程见
[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。

已实现的 Narrative Baseline 通过 generated static ProjectRegistry 注册为 Story Composition。
ProjectRegistry 的注册元数据静态可枚举，具体 Composition 代码通过 Remotion
`lazyComponent` 按需加载。它不读取 ScenePackage，也不导入 Scene renderer；它与后续
composition-local RendererRegistry 是两个独立装配边界。

### Composition 注册边界

```text
src/projects/<story>/Composition.tsx（default export）
+ 已校验 Story ID / RenderSpec / SemanticTiming
        ↓ bundle 前固定生成步骤
src/projects/project-registry.generated.ts
（静态元数据 + 字面量 () => import("./<story>/Composition")）
        ↓
Root 映射为 <Composition lazyComponent={entry.load} ... />
        ↓ 选中 / preview / render 时
Webpack 按需加载该 Story Composition
```

这里的“动态”只指 Composition 模块按需加载，不指运行时发现项目：

- 生成器只扫描固定一级目录 `src/projects/*/Composition.tsx`，稳定排序并拒绝非法 slug、
  重复 Composition ID、缺失合同或缺失 timing；
- ID、fps、width、height、durationInFrames 和小型 JSON-serializable defaultProps 在 registry
  中预先确定，Remotion 无需加载 Composition 就能列出它；
- 每个 registry import 都是生成后的字面量路径，模块路径不得来自 JSON、网络或字符串
  拼接；
- `Composition.tsx` 必须 default export，以满足 Remotion `lazyComponent` 的 Suspense
  加载约束；
- 所有 Story Composition 使用共同的 `StoryCompositionProps`；registry 的 defaultProps
  只传 `projectId` 等小型稳定标识，完整 Story、timing 和 manifest 留在项目模块内；
- `registerRoot()` 仍只在独立入口调用一次；Root 只读取 generated registry 并映射
  `<Composition>`；
- 正式 render runtime 不扫描文件系统，不生成 registry，也不动态改变 Composition 列表。

### Composition 组合模型

Composition 在语义上由一个必需主干和三个可选增强轨组成：

```text
Composition
├── NarrativeCore                  必需
└── EnhancementTracks              可选集合
    ├── StoryVisualTrack
    ├── SoundDesignTrack
    └── GlobalVisualLayers
```

在 CompositionAssembly 代码边界中，四者是并列的装配输入；它们不互相包含，但也不
应被抹平成一个充满可选字段的万能 `Track` 类型。实现采用三层组合边界：

1. 抽取小而稳定的底层能力，例如时间线贡献、视觉贡献、音频贡献和 fingerprint
   依赖；
2. 用这些能力组合出 `NarrativeCore`、`StoryVisualTrack`、`SoundDesignTrack` 和
   `GlobalVisualLayers` 四个强语义聚合，由各自类型保证必需字段和领域约束；
3. `CompositionAssembly` 通过显式插槽接收四个聚合，再在内部展开为固定顺序的
   视觉层和音轨。

后续完整装配的目标类型形状为：

```ts
type CompositionAssemblyProps = {
  readonly narrativeCore: NarrativeCore;
  readonly storyVisualTrack?: StoryVisualTrack;
  readonly soundDesignTrack?: SoundDesignTrack;
  readonly globalVisualLayers?: GlobalVisualLayers;
};
```

这是源码组装边界，不是允许 JSON 保存 React 组件或任意执行表达式的数据合同。M3 当前
只实现：

```ts
type CompositionAssemblyProps = {
  readonly narrativeCore: ReactNode;
};
```

三个可选增强轨没有空壳、`undefined` 字段或通用 track 数组；它们只能在后续获批阶段把
明确插槽加入上述边界。

### 已实现的 M2 模块

```text
src/contracts/story-check.ts                     StoryCheck 严格合同与 current-input 校验
scripts/narration/domain/provider-input.ts       redaction-safe provider/request fingerprints
scripts/narration/domain/candidate-progress.ts   candidate / measured 状态与续跑规划
scripts/narration/domain/pcm-wav.ts              canonical PCM、checksum、BigInt 拼接
scripts/narration/domain/seal.ts                 完整 measured batch → seal 纯领域装配
scripts/narration/adapters/private-config.ts     仓库外严格私有配置与 profile 解析
scripts/narration/adapters/voxcpm-client.ts      每 authored chunk 一个直接 VoxCPM 请求
scripts/narration/adapters/ffmpeg-normalizer.ts  host FFmpeg 规范化
scripts/narration/adapters/candidate-workspace.ts checksum-verified resume 与原子 progress
scripts/narration/adapters/atomic-files.ts       lock、immutable promotion 与 atomic receipt
scripts/narration/{generate-runner,seal-runner,check,cli}.ts
                                                  生成、封存、只读检查和固定命令
```

这些模块不 import Remotion，不注册 Composition，也不读取或实现 Scene。候选与 measured
artifact 只存在于 ignored work tree；content-addressed WAV、active manifest 和
SemanticTiming 才是 M2 持久产物。

### 已实现的 M3 模块

```text
src/contracts/narrative-baseline.ts
                                              registry/Baseline/evidence schemas 与 fingerprints
src/remotion/runtime/narrative-core/          single audio、顶层字幕、透明 NarrativeCore
src/remotion/runtime/composition-assembly/    required narrativeCore slot only
src/projects/gps-relativity/Composition.tsx   static local data validation + default export
scripts/registry/                             fixed discovery、AST check、stable atomic generation
src/projects/project-registry.generated.ts    tracked metadata + literal lazy import
src/Root.tsx                                  System component + Stories lazyComponent 映射
scripts/baseline/evidence.ts                  PNG alpha、MP4 streams/frames 与 receipt
```

M3 runtime 只读取本地静态源码、项目 JSON 和 M2 sealed artifacts；Root 不读取 Story 内容，
runtime 不扫描目录。`CompositionAssembly` 不包含 Scene、sound 或 global 插槽。

## 总结构

```mermaid
flowchart TB
    Brief["VideoBrief<br/>内容 / 受众 / 时长 / 风格"] --> Story["StorySpec<br/>【创作决策】"]
    Brief --> NarrationSpec["NarrationSpec<br/>voice profile / 生成参数<br/>【创作决策】"]
    RenderInput["用户本次制作参数<br/>无需二次确认"] --> RenderSpec["RenderSpec<br/>fps / 画幅 / 字幕与输出约束<br/>【用户输入】"]
    Story -->|"1:N"| Beat["StoryBeat<br/>meaningId<br/>【创作决策】"]

    Beat --> Chunks["ttsChunks<br/>已拆分台词集合<br/>【创作决策】"]
    Chunks --> StoryCheck["StoryCheck<br/>【创作决策】"]
    NarrationSpec --> StoryCheck
    StoryCheck --> Generate["VoxCPM 候选 chunk 音频<br/>【外部生成边界】"]
    Generate --> Seal["实测 / checksum / fingerprint / 封存<br/>【确定性执行】"]
    Seal --> Timing["绝对 SemanticTiming<br/>【确定性执行】"]
    RenderSpec --> Timing
    Seal --> Narration["NarrationUnit<br/>完整音频 + CaptionCue<br/>【确定性执行】"]
    Story --> Core["NarrativeCore<br/>【确定性执行】"]
    RenderSpec --> Core
    Timing --> Core
    Narration --> Core
    Core --> StoryComposition["Story Composition<br/>default export<br/>【确定性执行】"]
    StoryComposition --> ProjectRegistry["Generated Static ProjectRegistry<br/>literal lazy import<br/>【制作编排】"]
    ProjectRegistry --> Baseline["Narrative Baseline<br/>lazy-loaded<br/>【确定性执行】"]

    Beat --> Plan["SceneVisualPlan<br/>画面 / Shot / 镜头 / 资源<br/>【创作决策】"]
    Timing --> Plan
    Context["StoryContext<br/>风格 / 相邻关系 / 连续性<br/>【创作决策】"] --> Plan
    Catalog["ResourceCatalog<br/>统一只读查询<br/>【确定性执行】"] --> Plan
    Plan --> Package["ScenePackage<br/>资源 / 1 个 Scene renderer / 静态绑定<br/>【制作编排】"]
    Package --> VisualUnit["SceneVisualTrack<br/>【确定性执行】"]

    Beat --> Transition["StoryBeatTransition<br/>语义关系 / 动机 / preset<br/>【创作决策】"]
    VisualUnit --> Visual["StoryVisualTrack<br/>【确定性执行】"]
    Transition --> Visual

    Story --> SoundPlan["SoundDesignPlan<br/>【创作决策】"]
    SoundPlan --> Sound["SoundDesignTrack<br/>【确定性执行】"]
    Story --> GlobalPlan["GlobalVisualPlan<br/>【创作决策】"]
    GlobalPlan --> Global["GlobalVisualLayers<br/>【确定性执行】"]

    Core --> Assembly["CompositionAssembly<br/>【确定性执行】"]
    Visual -.->|"可选增强"| Assembly
    Sound -.->|"可选增强"| Assembly
    Global -.->|"可选增强"| Assembly
    Assembly --> Composition["Composition<br/>【确定性执行】"]

    classDef input fill:#243247,stroke:#60a5fa,color:#f8fafc;
    classDef creative fill:#2b2142,stroke:#a78bfa,color:#f8fafc;
    classDef orchestration fill:#422b18,stroke:#f59e0b,color:#f8fafc;
    classDef deterministic fill:#12383d,stroke:#22d3ee,color:#f8fafc;
    classDef external fill:#3f2730,stroke:#fb7185,color:#f8fafc;
    class RenderInput,RenderSpec input;
    class Story,NarrationSpec,Beat,Chunks,StoryCheck,Plan,Context,Transition,SoundPlan,GlobalPlan creative;
    class Package,ProjectRegistry orchestration;
    class Generate external;
    class Seal,Timing,Narration,Core,StoryComposition,Baseline,Catalog,VisualUnit,Visual,Sound,Global,Assembly,Composition deterministic;
```

## 后续视觉阶段：Scene 内部

> 当前里程碑不实现本节。本节只保留未来视觉轨接入边界，不能成为 Narrative Baseline
> 的依赖。

```mermaid
flowchart TB
    Beat["StoryBeat<br/>语义权威<br/>【创作决策】"] --> Plan
    Timing["StoryBeatTiming<br/>总时长 / chunk ranges<br/>【确定性执行】"] --> Plan
    Context["相邻连续性 / 画幅 / 安全区<br/>【创作决策】"] --> Plan
    Catalog["ResourceCatalog<br/>候选资产与能力<br/>【确定性执行】"] --> Plan

    subgraph Design["Scene 画面方案"]
      Plan["SceneVisualPlan<br/>主体 / 动作 / 含义 / 主构图<br/>Shot / 镜头 / 调度 / 资源<br/>【创作决策】"]
      Plan -->|"1:N"| Shot["ShotPlan<br/>局部帧范围 / 动机 / 镜头 / 调度<br/>【创作决策】"]
      Plan --> Refs["SelectedResourceRef[]<br/>【创作决策】"]
    end

    subgraph Authoring["Scene 制作"]
      Refs --> Resolve["资源解析与校验<br/>【确定性执行】"]
      Catalog --> Resolve
      Shot --> Source["composition-local Scene Renderer 入口<br/>Renderer.tsx<br/>【制作编排】"]
      Refs --> Source
      Resolve --> Source
      Source --> Registry["静态 RendererRegistry<br/>ScenePackage.rendererId → SceneRenderer<br/>【制作编排】"]
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

## Scene 级 Renderer 边界

```text
1 StoryBeat = 1 Scene visual responsibility
1 completed Scene = 1 ScenePackage
1 ScenePackage = 1 Scene-level rendererId = 1 runtime renderer entry
1 Scene renderer = N Shot
```

- `rendererId` 只存在于 ScenePackage，并绑定 Scene 级 renderer 入口；ShotPlan 不保存
  `rendererId`、组件或模块路径。
- Narrative Baseline 可以在任何 ScenePackage 产生前独立预览；上面的 ScenePackage
  一一关系描述完成视觉制作后的可装配结果，不是 Baseline 的前置条件。
- ShotPlan 只描述 Scene 内部的 `shotId`、局部帧范围、视觉动机、镜头、调度和资源引用。
- Scene renderer 可以在自己的目录内拆分任意数量的 Shot 组件和辅助文件，也可以调用
  已批准共享能力；这些内部组件不单独注册到 runtime registry。
- Scene runtime 每个 Scene 只解析一次 `rendererId`，向该入口提供 Scene timing、局部帧
  和已校验资源；Shot 的具体 JSX 与连续运动由 Scene renderer 负责。
- TTSChunk 与 CaptionCue 不决定 Shot 数量或边界。Shot 服务同一个 meaningId，可跨越
  多个 TTSChunk，也可在一个 TTSChunk 内切换。

## 图层与音轨

```text
视觉层（上 → 下）
CaptionLayer
GlobalVisualLayers / StoryBeatTransition overlay
SceneVisualTrack
透明（无必需背景层）

非视觉音轨
NarrationAudioTrack
SoundDesignTrack：BGM / ambience / SFX
```

NarrativeCore 不渲染背景或其他全帧视觉，其唯一视觉输出是 CaptionLayer。StoryVisualTrack
和 GlobalVisualLayers 都缺失时，Composition 的其余视觉区域保持透明；具体容器、预览器
或输出编码如何呈现透明区域，不是 NarrativeCore 的责任。

## 时间坐标

```text
compositionFrame：完整视频绝对帧
sceneFrame = compositionFrame - sceneStartFrame
shotFrame = sceneFrame - shotStartFrame
```

所有持久化范围统一为左闭右开的 `[startFrame, endFrame)`，并明确使用绝对帧还是局部帧。
音频边界先在 canonical PCM 的累计整数样本坐标中建立，再统一向上量化到帧；不得逐
chunk 把浮点秒数转帧后相加。唯一公式见
[确定性执行：音频样本到帧](DETERMINISTIC_EXECUTION.md#8-音频样本到帧的唯一算法)。

## Remotion 对应

```text
Story                 -> Composition
StoryBeat             -> 语义数据 + Scene 外层 Sequence
Scene                 -> 独立视觉任务 + 一个 Scene renderer 入口
Shot                  -> Scene renderer 内部的局部 Sequence 或组件；无 registry 绑定
NarrationAudioTrack   -> Composition 绝对音轨
CaptionLayer          -> Composition 顶层透明视觉层
StoryBeatTransition   -> Scene 边界上的等时长视觉实现
```

`<Sequence>` 只提供局部时间和挂载范围。图层叠加由 JSX 同时存在、节点顺序、定位与
z-index 决定；Sequence 数量不等于 Scene 或 Shot 的业务数量。

## 确定性装配边界

Assembly 可以校验、定位、查 registry、装配图层和执行已声明 preset；不能选择或重排
StoryBeat，不能改台词和 timing，也不能自动选择资源、Shot、镜头、renderer 或转场。

确定性执行由合同校验、固定 CLI、静态 registry、通用 Remotion runtime 和 fingerprint
失效机制共同实现，不由一个万能执行器承担。VoxCPM 结果在生成后通过实测、checksum
和 fingerprint 封存，再成为后续时间权威。完整设计见
[DETERMINISTIC_EXECUTION.md](DETERMINISTIC_EXECUTION.md)。
