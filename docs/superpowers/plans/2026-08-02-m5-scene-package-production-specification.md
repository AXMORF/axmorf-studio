# M5 ScenePackage 视听制作规格

> **状态：** 已于 2026-08-02 获用户正式批准。本文档是 M5 的规格交付，不是 M6 实现
> 结果。已批准版本把 `video-shotcraft` 等上游镜头配方纳入可追溯、可本地化、可审核的
> 制作期来源链；批准本身不新增合同源码、runtime、Scene、测试或生成产物。M6 仍须按
> 单独的详细实施计划执行。

**一句话目标：** 把每个 StoryBeat 固化成一个边界清楚、时间固定、画面与局部声音内聚、
可交给独立 Agent 并行制作的 ScenePackage；允许 Agent 从冻结的上游镜头配方与动态样片中
选择制作参考，但必须本地化实现并封存来源/适配证据，主 Agent 最后只做共享输入冻结、
registry 生成、跨 Scene 检查和确定性装配。

## 1. 当前 repo truth

本文档编写时重新核对的当前事实：

- Repository：`/data/projects/repos/remotion-story-producer`；分支 `codex/foundation`；本文档
  开始前 HEAD 为 `6f94be0780e8fd25916f011123b8ec7dfd6b7b64`。
- M1–M4 已完成并通过 Gate A；当前 Narrative Baseline 仍只有 sealed complete WAV、顶层
  CaptionLayer 和透明 NarrativeCore。
- 当前代码没有 VisualStyleSpec、SceneVisualPlan、ShotPlan、SceneSoundPlan、ScenePackage、
  RendererRegistry、ResourceCatalog、StoryVisualTrack 或 SoundDesignTrack 实现。
- 当前代码也没有 ExternalReferenceSnapshot、ShotRecipeSelection、上游 demo 本地化器或
  reference fidelity checker；`video-shotcraft` 目前不是依赖、submodule、运行时来源或已导入
  Catalog 的事实。
- `src/remotion/capabilities/styles/` 已有共享 style profiles，但当前 `VideoBriefSchema`、
  `StorySpecSchema` 和 `RenderSpecSchema` 都没有项目级画风选择；`gps-relativity` 也没有画风
  source artifact。
- 当前 CompositionAssembly 只有必需 `narrativeCore` 插槽；M5 不修改该代码。
- `gps-relativity` 当前有 5 个 StoryBeat，可在未来形成 5 个独立 Scene 任务：

| meaningId                  | 绝对帧范围     | 固定 Scene 帧数 |
| -------------------------- | -------------- | --------------- |
| `position-is-time`         | `[15, 361)`    | 346             |
| `two-relativistic-effects` | `[361, 696)`   | 335             |
| `net-drift`                | `[696, 1018)`  | 322             |
| `error-accumulation`       | `[1018, 1433)` | 415             |
| `practical-conclusion`     | `[1433, 1716)` | 283             |

以上范围来自当前 sealed PCM 派生的 SemanticTiming。M5 不改写任何范围，也不把示例 Scene
内容当作已经制作的事实。

## 2. 已确定的产品边界

### 2.1 一个 Beat 是一个可并行 Scene 任务

```text
1 StoryBeat
= 1 meaningId
= 1 固定 StoryBeatTiming 窗口
= 1 独占 Scene 目录
= 1 Agent 制作任务
= 1 ScenePackage 或 1 显式 fallback
```

ScenePackage 是制作与替换单位。它不是单纯的视觉 manifest，而是该 Beat 的完整局部视听
增强结果；旁白、字幕和全局声音仍在它之外。

### 2.2 ScenePackage 内聚画面与局部声音

```text
ScenePackage
├── Scene visual contribution
│   ├── SceneVisualPlan
│   ├── ShotPlan
│   ├── SceneSyncAnchor[]
│   ├── selected visual resources
│   └── one rendererId → one SceneRenderer
└── Scene-local sound contribution
    ├── optional Scene ambience
    ├── SFX cues
    ├── selected audio resources
    └── references to SceneSyncAnchor
```

这里的“内聚”是创作权威和文件所有权内聚。SceneRenderer 仍只输出视觉；固定 Scene audio
runtime 播放 SceneSoundPlan。禁止把旁白、字幕或任意音频偷偷挂进 Renderer.tsx。

### 2.3 运行时分轨不是创作数据分离

CompositionAssembly 继续保留四个强语义运行时聚合：

```text
NarrativeCore                  required
StoryVisualTrack               optional
SoundDesignTrack               optional
GlobalVisualLayers             optional
```

但 StoryVisualTrack 和 SoundDesignTrack 不是两份人工维护的 Scene 计划：

```text
ordered ScenePackage[].visual
→ StoryVisualTrack

ordered ScenePackage[].localSound
→ SoundDesignTrack scene contributions

GlobalSoundPlan
→ SoundDesignTrack global contribution（M8）
```

M6 首次加入 `storyVisualTrack` 和 `soundDesignTrack` 显式插槽时，两者必须消费真实
ScenePackage 投影，不能先加入空壳。M8 再增加 GlobalSoundPlan 和 GlobalVisualLayers。

### 2.4 Scene 永远不能修改时间权威

每个 Scene 的外层范围完全来自 SemanticTiming：

```text
beatDurationInFrames = beat.endFrame - beat.startFrame
sceneFrame = absoluteFrame - beat.startFrame
absoluteFrame = beat.startFrame + sceneFrame
```

SceneVisualPlan、ShotPlan、SceneSyncAnchor、ambience 和 SFX 都使用 Scene-local frame，范围
必须落在 `[0, beatDurationInFrames)`。修改 Scene 不允许延长 Beat，也不允许移动后续 Scene。

只有 Story、ttsText、显式叙事停顿、sealed narration 或 RenderSpec timing 变化并生成新的
SemanticTiming 后，后续绝对时间才可以变化；这会通过 fingerprint 使受影响 ScenePackage
fail closed。

### 2.5 全片画风是项目级权威

全片画风不能由各 Scene Agent 自行决定，也不能塞进 RenderSpec。M5 引入独立项目级
VisualStyleSpec：用户画风意图由主 Agent 结构化为已选 style profile 和项目化 art direction，
所有 Scene Agent 只读消费同一 fingerprint。

VisualStyleSpec 只影响后续 Scene 与 GlobalVisualLayers，不进入旁白生成、sealed narration、
SemanticTiming 或当前 Narrative Baseline。当前 CaptionLayer 仍属于受保护 NarrativeCore，
M5 不借画风合同反向改造字幕 runtime。

### 2.6 video-shotcraft 是制作期镜头参考源

`video-shotcraft` 可以向 Scene Agent 提供镜头配方、Gallery `cardId/style-key`、动态样片、
准确 demo TSX、最小依赖源码和候选 SFX，但它不成为本项目的视觉总权威、runtime package
或自动导演：

```text
VisualStyleSpec                 决定全片如何看起来
StoryBeat + SceneVisualPlan     决定当前 Scene 为什么需要这个镜头
ShotRecipeSelection            决定参考哪个上游镜头语法、以何种模式适配
ShotPlan                        决定它在固定 Beat 内何时发生
composition-local shots/*.tsx  承载本地化后的真实实现
ScenePackage                    封存实现、资源、来源、适配和审核 fingerprint
```

每次制作先把上游仓库固定到不可变 commit，再解析 Gallery record、完整配方卡、准确 demo
源码和最小依赖闭包。Scene Agent 不得只凭卡名、概念说明、参数表或 preview MP4 重新猜写
一个近似镜头，也不得从 GitHub、全局 skill 目录、node_modules 中的上游 package 或远程 URL
直接 import。真正进入 render 的代码与资产必须在当前 Scene 目录和 `public/` 中本地化。

允许三种显式选择状态：

```text
exact-demo-localized  → 声明复现上游镜头语法，必须通过严格来源与视觉保真检查
inspiration-only      → 只承认灵感来源，不宣称复现；仍记录 provenance 并通过普通 Scene 检查
none                  → 当前 Shot 未使用任何外部镜头配方
```

“精确”指保留与当前内容相关的运动结构、关键状态、时值比例、缓动、遮罩/景深/相机语言和
正常速度下可辨识的节奏，不要求复制上游品牌、文案、配色、字体、产品 UI 或原始时长。
这些表面与内容必须按 VisualStyleSpec、当前 StoryBeat 和固定 Beat 窗口重新适配。无法在固定
窗口内保住关键运动语法时，降级为 `inspiration-only`、改用自定义 Shot 或显式 fallback；
不得延长 StoryBeatTiming。

## 3. 固定依赖方向

```text
StoryBeat + SemanticTiming + RenderSpec
                 +
          VisualStyleSpec
                 +
       ResourceCatalog snapshot
                 +
 ExternalReferenceSnapshot[]
                 +
       adjacent continuity brief
                 ↓
          SceneTaskInput
                 ↓ one meaningId / one Agent
 SceneVisualPlan + ShotPlan + SceneSyncAnchor
                 +
         SceneSoundPlan
                 +
 selected resources + ShotRecipeSelection[]
                 +
 localized shots/*.tsx + Renderer.tsx
                 ↓ mechanical validation
 source/adaptation evidence + fidelity receipt
                 ↓
             ScenePackage
          ↙                ↘
StoryVisualTrack      SoundDesignTrack
          ↘                ↙
          CompositionAssembly
```

禁止的依赖方向：

```text
Scene Agent       -X-> Story / narration / captions / SemanticTiming mutation
Scene Agent       -X-> another meaningId directory
Scene Agent       -X-> ResourceCatalog or shared capability mutation
Scene Agent       -X-> floating upstream branch/tag or another Scene's localized source
Scene Agent       -X-> RendererRegistry generation
SceneRenderer     -X-> narration / captions / Audio mounting
SceneSoundPlan    -X-> global BGM / cross-Scene sound / independent duration
Scene renderer    -X-> video-shotcraft repo/package/global skill/remote preview runtime import
render runtime    -X-> Agent / skill / MCP / network / directory scan
JSON              -X-> JSX / code / function / executable dynamic module path
```

## 4. 目标文件结构

M6 实现必须以测试确认最终名称；M5 锁定以下职责和所有权：

```text
src/projects/<story>/
├── visual-style.json                         authored VisualStyleSpec
├── external-references.generated.json        frozen upstream snapshots/indexes
├── scenes/
│   └── <meaningId>/                          one Agent exclusive ownership
│       ├── task-input.generated.json         frozen read-only task receipt
│       ├── visual-plan.json                  authored SceneVisualPlan
│       ├── shot-plan.json                    authored ShotPlan + sync anchors
│       ├── sound-plan.json                   authored SceneSoundPlan
│       ├── selected-resources.json           authored stable catalog refs
│       ├── shot-recipe-selection.json        authored upstream reference choices
│       ├── Renderer.tsx                      visual-only default export
│       ├── shots/                            localized/custom local Shot components
│       └── generated/
│           ├── reference-fidelity.generated.json  source/adaptation receipt
│           └── scene-package.generated.json  validated package + fingerprints
├── scene-coverage.generated.json             ordered meaningId coverage/fallback
└── renderer-registry.generated.ts            literal static Scene imports

public/projects/<story>/
└── scenes/<meaningId>/
    ├── assets/                                localized visual/audio assets
    └── evidence/                              source/adaptation stills or motion strips
```

规则：

- 子 Agent 只能写自己的 `scenes/<meaningId>/` 和该 Scene 对应的 public asset 子目录；
- `visual-style.json`、Catalog snapshot、coverage、registry 和 Composition 由主 Agent 或固定
  generator 拥有；
- `external-references.generated.json` 只由显式 authoring sync/generator 写入；它固定上游
  repository、不可变 commit、索引与 license metadata，不能保存浮动 branch/tag 作为有效来源；
- ScenePackage 是 generated receipt，不能由 Agent 手写 checksum/fingerprint 冒充完成；
- `shot-recipe-selection.json` 只声明来源和适配意图，不充当 loader；真正的本地 Shot 文件仍
  按固定 Scene 目录约定由源码检查发现并验证真实 binding；
- RendererRegistry generator 只按固定一级 `scenes/<meaningId>/Renderer.tsx` 约定发现，
  生成字面量静态 import；不从 JSON 读取模块路径；
- 所有选中资产必须位于当前仓库 public 目录、有 manifest/Catalog 元数据并通过 checksum
  与类型校验；第三方代码、图像、音频和字体还必须保存各自的 license/attribution 状态，
  未确认或禁止当前用途的条目不得进入 ScenePackage。

## 5. 合同规格

下列结构描述锁定语义，不是允许 M5 提前创建 TypeScript 源码。

### 5.1 VisualStyleSpec

建议 v1 形状：

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "styleProfileId": "cinematic-3d",
  "resourceCatalogFingerprint": "sha256:...",
  "artDirection": {
    "medium": "cinematic scientific visualization",
    "palette": "deep-space blue with warm satellite highlights",
    "lighting": "high-contrast orbital lighting",
    "texture": "clean technical surfaces",
    "compositionGrammar": "depth-stage",
    "motionLanguage": "slow spatial reveal",
    "typography": "minimal technical editorial"
  },
  "continuityRules": [
    "Earth scale and orbital direction remain consistent across Scenes"
  ],
  "forbiddenTreatments": ["unmotivated neon HUD overlays"]
}
```

锁定规则：

- `styleProfileId` 必须解析到冻结 Catalog 中唯一、已批准的 style profile；
- artDirection 是当前 Story 的具体化方向，不复制 profile 的完整实现数据；
- 所有文本非空、数组有固定上限、对象 strict、unknown field 拒绝；
- fingerprint 覆盖 profile descriptor fingerprint、完整 artDirection、连续性规则、禁止项和
  schema/fingerprint algorithm version；
- 修改 VisualStyleSpec 不使 sealed narration、SemanticTiming 或 Narrative Baseline 失效。

### 5.2 ResourceCatalog 与 SelectedResourceRef

ResourceCatalog v1 必须统一查询：

- visual assets：image、video、SVG、Lottie、GLTF、texture、font 等；
- audio assets：ambience、SFX，以及未来 global BGM；
- style profiles；
- code capabilities：camera、effects、motion、layout、chart、media、sound helpers 等；
- authoring-only references：shot recipe、demo source、preview reference 和 sequence pattern。

每个 descriptor 必须声明允许用途，至少区分：

```text
runtime-approved   可被当前仓库源码/asset runtime 消费
localize-code      只允许在制作期把经过许可的最小源码闭包复制到 Scene
localize-asset     只允许把经过许可和 checksum 校验的资产复制到 public
reference-only     只用于选型、对照与审核，不能进入最终 Composition
blocked            license、来源或完整性未确认，任何 production 选择都失败
```

SelectedResourceRef 只保存稳定声明：

```json
{
  "resourceId": "sfx.clock.digital-pulse",
  "kind": "audio",
  "role": "scene-sfx",
  "descriptorFingerprint": "sha256:...",
  "catalogFingerprint": "sha256:..."
}
```

它不保存动态模块路径、export 函数或 JSX。代码能力由 Renderer.tsx 静态 import；机械检查
确认源码所用已批准能力与声明匹配。资产由 Catalog 解析到 public 路径并校验 checksum。

Shot recipe、demo source 和 preview 不使用 SelectedResourceRef 冒充 runtime 资产；它们进入
独立 ShotRecipeSelection。Gallery preview 默认是 `reference-only` 审核证据，不得作为最终
Scene 视频素材播放。

### 5.3 ExternalReferenceSnapshot 与 ShotRecipeSelection

ExternalReferenceSnapshot 是 authoring-time 生成的严格只读来源快照。以 `video-shotcraft`
为例，至少绑定：

```json
{
  "sourceId": "video-shotcraft",
  "repository": "https://github.com/Vincentwei1021/video-shotcraft",
  "revision": "40-char immutable git commit",
  "indexFingerprint": "sha256:...",
  "sourceLicense": {
    "id": "Apache-2.0",
    "verificationStatus": "verified"
  },
  "snapshotFingerprint": "sha256:..."
}
```

规则：

- `revision` 只能是完整不可变 commit；branch、tag、`latest`、下载时间或远程页面当前内容都
  不能成为生产身份；
- authoring sync 可以在 render 之外显式访问网络，但生成 snapshot 后，Scene 分发、检查、
  preview 和 render 全部只读消费本地、content-addressed 事实；
- snapshot 是 append-only、content-addressed 记录；上游刷新产生新 snapshot，不原地改写旧
  snapshot。已有 SceneTaskInput/ScenePackage 继续绑定旧记录，只有主 Agent 显式重发任务或
  旧记录缺失/损坏时才改变其有效性；
- source code license 与每个媒体资产 license 分开记录。上游仓库的顶层许可证不能替代
  bundled audio/image/font 的逐项授权；`unknown`、`unverified` 或明确限制当前用途的资产
  一律映射为 `blocked`；
- 保存上游 repository-relative card/demo/evidence path 仅用于 provenance；任何 runtime
  loader 都不得解释这些字符串。

ShotRecipeSelection 是当前 Scene/Shot 的创作选择，可为空；它不强迫每个 Scene 使用
Shotcraft：

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "meaningId": "two-relativistic-effects",
  "selections": [
    {
      "shotId": "satellite-clock-reveal",
      "sourceId": "video-shotcraft",
      "sourceSnapshotFingerprint": "sha256:...",
      "cardId": "spotlight-hero-card",
      "styleKey": "default",
      "cardFingerprint": "sha256:...",
      "demoSourceFingerprint": "sha256:...",
      "previewFingerprint": "sha256:...",
      "adaptationMode": "exact-demo-localized",
      "selectionReason": "Use a restrained hero reveal for the satellite clock",
      "requiredTraits": ["single-subject reveal", "camera push", "settled hold"]
    }
  ]
}
```

锁定规则：

- `cardId + styleKey` 必须在冻结 index 中唯一解析，并与完整 card、准确 demo 和 preview
  identities 相互匹配；
- `exact-demo-localized` 必须声明 card/demo/preview fingerprint、最小依赖闭包、本地源码
  binding 和匹配状态证据；缺一项即 fail closed；
- `inspiration-only` 仍记录来源和选择原因，但不能生成 exact fidelity pass，也不能在交付
  文案中宣称复现该 recipe；
- `none` 通过空 `selections` 表达，不用伪造占位卡；
- ShotRecipeSelection 不保存本地可执行模块路径。checker 从固定 `shots/` 目录、Renderer
  静态 import/JSX 和 frame-state binding 证明实际使用关系。

### 5.4 SceneTaskInput

SceneTaskInput 是主 Agent 在并行分发前生成的只读 receipt，至少绑定：

```text
storyId / meaningId
StoryBeat exact value + story fingerprint
StoryBeatTiming exact [startFrame, endFrame)
SemanticTiming fingerprint
RenderSpec fingerprint
VisualStyleSpec fingerprint
ResourceCatalog snapshot fingerprint
ExternalReferenceSnapshot fingerprints + allowed reference IDs
previous/next meaningId continuity brief
allowed output directories
task-input fingerprint
```

相邻连续性只提供当前 Story 的语义、方向和必须保持的对象状态，不允许子 Agent 打开或模仿
旧生产 Scene、旧 Composition、历史 still/contact sheet。并行任务不依赖另一个子 Agent 的
未完成源码。

### 5.5 SceneVisualPlan、ShotPlan 与 SceneSyncAnchor

SceneVisualPlan 必须描述：

- 当前 meaningId 要让观众理解什么；
- 主体、动作、视觉因果和主构图；
- 如何落实 VisualStyleSpec；
- 需要维持到相邻 Scene 的连续性；
- ordered Shot IDs；
- selected visual resource IDs；
- 每个 Shot 是否使用 ShotRecipeSelection，以及选择/拒绝外部 recipe 的语义理由；
- fallback 意图。

ShotPlan 只描述 Scene 内部的局部镜头：

```json
{
  "shotId": "satellite-clock-reveal",
  "frameRange": { "startFrame": 72, "endFrame": 190 },
  "purpose": "reveal the satellite clock drift",
  "visualAction": "camera pushes from orbit to the clock face",
  "resourceIds": ["model.gps-satellite", "graphic.atomic-clock"]
}
```

ShotPlan 不保存 rendererId、组件、模块路径、字幕 cue 或 TTSChunk 边界。Shot 服务 meaningId，
可以跨多个 TTSChunk，也可以在一个 TTSChunk 内切换。

SceneSyncAnchor 是 Scene 内稳定的视听事件：

```json
{
  "eventId": "satellite-clock-pulse",
  "sceneLocalFrame": 116,
  "purpose": "clock face emits the first visible timing pulse"
}
```

`eventId` 在当前 Scene 内唯一并保持语义稳定。视觉动作移动时可更新 local frame；动作删除
时必须删除 anchor，使引用它的旧 SFX fail closed，不能悄悄沿用旧绝对帧。

### 5.6 SceneSoundPlan

每个完成 Scene 都有一份显式 SceneSoundPlan；无局部声音时使用空计划，而不是缺失或让
Renderer.tsx 自行决定。

```json
{
  "schemaVersion": 1,
  "storyId": "gps-relativity",
  "meaningId": "two-relativistic-effects",
  "ambience": {
    "resourceId": "ambience.orbital-room-tone",
    "frameRange": { "startFrame": 0, "endFrame": 335 },
    "volume": 0.12
  },
  "cues": [
    {
      "cueId": "clock-pulse-sfx",
      "resourceId": "sfx.clock.digital-pulse",
      "anchor": {
        "eventId": "satellite-clock-pulse",
        "offsetFrames": 0
      },
      "durationInFrames": 24,
      "volume": 0.35
    }
  ]
}
```

锁定规则：

- ambience 和每个 cue 都必须完全位于固定 Beat 窗口；Scene-local cue 不允许 spill 到下一
  Beat；需要跨 Scene 的声音进入 M8 GlobalSoundPlan；
- SFX 可使用 `{eventId, offsetFrames}` 锚定视觉事件，或为无视觉事件的局部声音使用显式
  `sceneLocalFrame`；二者互斥；
- anchor 解析结果必须在范围内；eventId 缺失、重复、超界、duration 非正、volume 非有限
  或不在 `[0, 1]` 全部 fail closed；
- SceneSoundPlan 不拥有旁白、不挂载 complete WAV、不定义全局 BGM、不做 provider/network
  调用；
- 从 `video-shotcraft` 或其他上游选择的 SFX 必须先作为独立 audio resource 本地化；只有
  checksum、来源、允许用途和逐资产 license 状态全部通过后才可写入 SceneSoundPlan。上游
  声音设计建议可以参考，但不能把整个音频目录或未知授权文件默认放行；
- 旁白 ducking 和最终 loudness/mastering 由 M8 GlobalSoundPlan/runtime 统一负责。

### 5.7 ScenePackage 与 SceneCoverageMap

`ReferenceFidelityReceipt`（文件 `reference-fidelity.generated.json`）是 pass-only
generated receipt。对于每个
`exact-demo-localized` selection，它至少绑定：

```text
source snapshot / cardId / styleKey / card fingerprint
exact demo source fingerprint / preview fingerprint
minimal upstream dependency-closure fingerprints
localized source fingerprints
real Renderer import + JSX + frame-state binding evidence
matching source/adaptation stills or motion-strip fingerprints
normal-playback recognizability result
license/attribution verification result
fidelity receipt fingerprint
```

“Renderer binding”不能由 JSON 自报：checker 必须从本地静态 import graph、实际 JSX 使用和
至少两个有感知差异的 frame state 证明该镜头真的进入 Scene。只有静态画面、只有 metadata、
只复制参数、只放 preview、未使用的孤儿源码或与所选 recipe 无关的实现都不能通过 exact
fidelity。`inspiration-only` 记录 provenance 和普通视觉证据，但 fidelity 状态必须是明确的
`not-applicable`，不能伪装成 `pass`。

ScenePackage 是全部本地输入通过后生成的严格 receipt，至少绑定：

```text
schemaVersion / storyId / meaningId / rendererId
taskInputFingerprint
visualStyleFingerprint
semanticTimingFingerprint
resourceCatalogFingerprint
externalReferenceSnapshotFingerprints
shotRecipeSelectionFingerprint
referenceFidelityReceiptFingerprint
sceneVisualFingerprint
sceneSyncAnchorFingerprint
sceneSoundFingerprint
rendererSourceFingerprint
selectedResourceFingerprints
scenePackageFingerprint
```

ScenePackage 不保存独立 duration；checker 必须从 SemanticTiming 重新得到固定 Beat 范围。
一个合法 ScenePackage 恰好有一个 rendererId 和一份 SceneSoundPlan identity。没有选择外部
recipe 时使用合法空 ShotRecipeSelection，并生成无 exact 项的 `not-applicable` fidelity
receipt；不能为了通过 package gate 伪造一个 Shotcraft 选择。

SceneCoverageMap 按 StoryBeat 顺序为每个 meaningId 保存以下互斥状态之一：

```text
ready       → 存在当前有效 ScenePackage
fallback    → 明确选择 Narrative Baseline 或已批准固定 fallback
missing     → 尚未制作，final gate 失败
stale       → package 存在但任一上游 identity/fingerprint 漂移
```

Narrative Baseline 的 `narrative` level 不读取 CoverageMap；`final` level 才要求每个 Beat 为
ready 或显式 fallback。

## 6. 并行 Agent 制作协议

### 6.1 主 Agent 分发前

主 Agent 必须一次性冻结并记录：

1. 当前 Story、SemanticTiming、RenderSpec 和 Narrative AutoCheck 全部有效；
2. 用户已确定的 VisualStyleSpec；
3. 同一份 ResourceCatalog snapshot；
4. 允许使用的 ExternalReferenceSnapshot、不可变 revision 和 reference IDs；
5. 全 Story 对象连续性、空间方向、色彩和相邻语义约束；
6. 每个 meaningId 的固定帧窗口、允许目录和检查要求；
7. 不搜索、不打开、不模仿旧 Scene/Composition/still/contact sheet 的来源边界。

### 6.2 子 Agent 所有权

每个子 Agent：

- 独占一个 `scenes/<meaningId>/` 和对应 public asset 子目录；
- 同时完成 SceneVisualPlan、ShotPlan、sync anchors、SceneSoundPlan、资源/recipe 选择、
  本地化 Shot 源码和 Renderer.tsx；
- 不编辑共享 registry、Catalog、VisualStyleSpec、Story、timing、Composition 或其他 Scene；
- 只读使用任务中允许的冻结 reference IDs；不得在并行制作期间追踪上游 `main`、自行换
  commit、访问另一 Scene 的本地化实现或把全局 skill 路径写进源码；
- 新组件默认留在自己的 Scene 目录，不形成共享 capability promotion；
- 时间放不下时调整局部 Shot/动作/声音方案，不能延长 Beat；
- 无法满足输入时返回结构化 fallback/blocker，不伪造 package receipt。

### 6.3 主 Agent 收集后

主 Agent：

1. 对每个目录执行严格合同、资源、时间、renderer、sound、license 和 reference preflight；
2. 对 `exact-demo-localized` 项生成并检查 reference fidelity receipt；
3. 只为通过的 Scene 生成 ScenePackage receipt；
4. 按 StoryBeat 顺序生成 SceneCoverageMap 与 RendererRegistry；
5. 确定性投影 StoryVisualTrack 和 scene-only SoundDesignTrack；
6. 批量执行 SceneVisualCheck、SceneSoundCheck 和相邻连续性检查；
7. 生成一次完整 Preview，不为每个 Scene 建立用户批准节点。

## 7. Runtime 边界

### 7.1 SceneRenderer props

SceneRenderer 的最小强类型输入应包含：

```text
storyId / meaningId
sceneFrame / durationInFrames
fps / width / height
StoryBeat read-only semantic input
StoryBeatTiming read-only timing input
resolved VisualStyleSpec
SceneVisualPlan / ShotPlan / SceneSyncAnchor[]
validated selected visual resources
```

它不接收旁白播放器、CaptionLayer、SceneSoundPlan、任意动态 loader 或网络能力。

### 7.2 Scene audio runtime

固定 Scene audio runtime 接收：

```text
meaningId / durationInFrames
SceneSyncAnchor[]
SceneSoundPlan
validated selected audio resources
```

它解析局部 cue、挂载 repository-local audio，并被外层固定 Scene Sequence 裁定时间范围。
它不拥有 NarrationAudioTrack、GlobalSoundPlan 或创作选择。

### 7.3 静态 RendererRegistry

RendererRegistry 属于 composition-local 制作编排：

```text
ScenePackage.rendererId
→ generated literal static import
→ scenes/<meaningId>/Renderer.tsx default export
```

generator 必须稳定排序、AST 检查 default export、拒绝 symlink/重复 ID/未知目录并支持
byte-for-byte drift check。正式 render runtime 不扫描目录、不生成 registry。

## 8. Fingerprint 与精确失效

### 8.1 分层关系

```text
VisualStyle fingerprint
        ↓
SceneVisual fingerprint ← StoryBeat / timing / visual plan / shots / anchors
        ↓
renderer source + visual resource fingerprints
        ↓
Scene visual contribution fingerprint

ExternalReferenceSnapshot + ShotRecipeSelection
        ↓
card/demo/preview + dependency closure + localized source/evidence fingerprints
        ↓
reference fidelity receipt fingerprint

SceneSyncAnchor fingerprint
        +
SceneSoundPlan + audio resource fingerprints
        ↓
Scene sound contribution fingerprint

visual contribution + sound contribution + renderer binding + reference fidelity
        ↓
ScenePackage fingerprint
```

StoryVisualTrack fingerprint 只汇总 ordered Scene visual contributions 和视觉转场；
SoundDesignTrack scene fingerprint 只汇总 ordered Scene sound contributions。M8 再把
GlobalSoundPlan fingerprint 加入最终 SoundDesignTrack fingerprint。

### 8.2 失效矩阵

| 修改                                       | 必须失效                                                                 | 保持有效                                              |
| ------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| VisualStyleSpec                            | 所有依赖该 style 的 Scene visual/package、StoryVisualTrack、Preview      | narration、timing、未依赖视觉 anchor 的 sound 输入    |
| 单 Scene 色彩/材质/Renderer，anchors 不变  | 该 Scene visual/package、视觉证据、StoryVisualTrack、Preview             | 该 Scene sound fingerprint、其他 Beat、NarrativeCore  |
| 单 Scene Shot 动作但 anchors 不变          | 该 Scene visual/package 与视觉证据                                       | sound、其他 Beat、NarrativeCore                       |
| 选中 recipe 的 card/demo/preview identity  | 该 Scene reference receipt、visual/package、StoryVisualTrack、Preview    | sound、其他 Beat、NarrativeCore                       |
| 本地化 Shot 源码或 binding                 | 该 Scene reference receipt、visual/package、视觉证据、Preview            | 未依赖 anchor 的 sound、其他 Beat、NarrativeCore      |
| 上游出现新 commit，但项目未更新 snapshot   | 无自动失效；仍使用已冻结 immutable snapshot                              | 全部已封存 package                                    |
| 主 Agent 用新 snapshot 重发 task/selection | 仅使用被替换 reference identity 的任务/package 重新选择并 fail closed    | 未重发且仍绑定有效旧 snapshot 的 Scene、NarrativeCore |
| 第三方资产 license 变为 blocked            | 所有引用该资产的 resource/sound/package/final gate                       | 未引用该资产的 Scene、NarrativeCore                   |
| 单 SceneSyncAnchor local frame             | 该 Scene visual/sound/package、两类 Scene check、两条运行时投影、Preview | 其他 Beat、NarrativeCore                              |
| 单 SceneSoundPlan 或音频资产               | 该 Scene sound/package、SceneSoundCheck、SoundDesignTrack、Preview       | visual evidence、其他 Beat、NarrativeCore             |
| 删除一个 anchor                            | 所有引用它的 cue 和 ScenePackage fail closed                             | 其他 Beat                                             |
| GlobalSoundPlan                            | 最终 SoundDesignTrack、assembly、Preview/approval                        | ScenePackage 内部分层证据                             |
| Story/SemanticTiming                       | 所有不再匹配的 task inputs、ScenePackage、投影与 Preview                 | 仅按既有 narrative 规则判断的上游产物                 |

任何失效由 fingerprint 和 checker 证明，不依赖 Agent 记忆，也不通过自动修改 Scene 修复。

## 9. 检查与审核

### 9.1 机械检查

M6/M7 目标机械检查至少覆盖：

- VisualStyleSpec、ExternalReferenceSnapshot、ShotRecipeSelection、SceneTaskInput、
  SceneVisualPlan、ShotPlan、SceneSoundPlan、reference fidelity receipt、ScenePackage、
  CoverageMap 的 strict schema；
- storyId/meaningId/timing/style/Catalog identities 一致；
- 上游 repository/commit/index/card/style-key/demo/preview identities 唯一且 fingerprint current；
- exact demo 的最小依赖闭包已本地化，源码没有上游 runtime/package/global skill/remote import；
- exact selection 具有真实 Renderer import/JSX/frame-state binding、配对证据和正常速度可辨识
  结果；inspiration-only 不冒充 exact pass；
- Shot、anchor、ambience、cue 全部使用 Scene-local frame 且不越界；
- anchor 引用唯一且 current；
- 资源 kind/role/path/checksum/descriptor fingerprint、allowed use 与逐项 license 状态正确；
- Renderer.tsx default export、静态 binding 和 registry byte drift；
- Renderer source 不挂载 Audio、不渲染 CaptionLayer、不使用 CSS animation/transition；
- 子 Agent 输出没有修改共享输入或越过允许目录；
- narrative level 在全部 Scene artifact 缺失时仍 pass；final level 才检查 Scene 分支。

### 9.2 Agent 批量审核

- VisualDirectionCheck：VisualStyleSpec 是否足够具体且能指导所有 Scene；
- SceneVisualCheck：语义、画风、构图、运动、可读性和相邻连续性；
- ShotReferenceFidelityCheck：仅对选中 recipe 执行，检查来源、适配模式、运动语法、关键
  状态、正常速度可辨识度和不应继承的上游品牌皮肤；
- SceneSoundCheck：局部 ambience/SFX 的必要性、同步、音量、边界和资源适用性；
- ScenePackageCheck：画面与局部声音是否形成同一个 Beat 的内聚表达；
- FinalPreviewApproval：默认唯一用户创意批准。

内部 Shot、sync anchor、cue、still 或单个子 Agent 任务不新增用户批准节点。

## 10. Fallback 与失败

- 没有合适视觉资源：允许显式 Narrative Baseline/fixed fallback，不允许 runtime 联网或猜测
  动态模块；
- 没有合适 Shotcraft recipe：使用空 ShotRecipeSelection、自定义 Shot 或其他已冻结来源；
  不强行套卡，也不因未使用 Shotcraft 阻塞 Scene；
- exact demo 无法在固定 Beat 内保持关键运动语法：降级为 inspiration-only、自定义或
  fallback，不能通过缩短到不可辨识来冒充 exact fidelity；
- 上游 source/card/demo/preview/dependency identity 漂移：只允许主 Agent 显式重新冻结来源
  并重新分发受影响任务，Scene Agent 不自行追随新版本；
- 第三方音频或其他资产授权未确认：该资源 blocked，替换为已验证资源或使用显式空声音
  计划；不得用仓库顶层许可证推断媒体授权；
- 没有合适局部音效：SceneSoundPlan 使用显式空 ambience/cues，不能用任意占位声音；
- Scene 方案超出固定时长：调整 Shot、动作或声音密度；不能延长 Beat；
- anchor 删除或漂移：引用 cue fail closed，要求同一 Scene 任务内删除、替换或重绑；
- 子 Agent 失败：只标记该 meaningId missing/fallback，不修改其他 Scene；
- registry/Catalog/共享输入漂移：全部相关 package stale，主 Agent 重新冻结任务输入后再制作；
- Narrative Baseline 始终保持独立可检查和可渲染。

## 11. M6 建议实施顺序

M5 已获用户批准；M6 按以下 bounded slices 内联执行，每个 slice 均先 TDD、聚焦验证、小步
提交，完成 M6 后停止，不自动开始 M7：

1. **VisualStyleSpec 与 Scene primitives**：strict schemas、stable IDs、local-frame range、
   canonical fingerprints；
2. **ResourceCatalog 与 license policy**：视觉/音频/style/capability/authoring-reference
   descriptor、allowed use、生成、query、path/checksum/license preflight 和 drift check；
3. **External reference pipeline**：immutable commit snapshot、Gallery/card/style-key/demo/preview
   resolver、ShotRecipeSelection、最小依赖闭包本地化规则和无网络 runtime guard；
4. **Reference fidelity gate**：真实 import/JSX/frame-state binding、source/adaptation evidence、
   normal-playback recognizability、exact/inspiration/empty 三态和 pass-only receipt；
5. **SceneTaskInput 与 authored plans**：Visual/Shot/Anchor/Sound/SelectedResource/reference
   contracts；
6. **ScenePackage 与 CoverageMap**：分层 fingerprint、pass-only generated receipt、精确失效
   tests；
7. **RendererRegistry**：固定目录发现、AST default export、literal static imports、byte drift；
8. **Scene visual/audio runtimes**：固定 Beat Sequence、visual-only Renderer、scene-local audio
   contribution、边界检查；
9. **CompositionAssembly real slots**：只在真实 Scene input 存在时加入 storyVisualTrack 和
   scene-only soundDesignTrack；
10. **final-level mechanical base**：Scene contracts/resources/registry/coverage 聚合，但不实现
    M7 创意 Scene 或 M8 GlobalSoundPlan/approval；
11. **authority docs and proof**：测试、typecheck、lint、bundle、compositions、narrative gate、
    一个 synthetic Scene scaffold proof，以及一个冻结 `video-shotcraft` recipe 的 resolver/
    localization/fidelity fixture；fixture 不等于完成真实 `gps-relativity` Scene。

## 12. M5 明确不做

- 不新增或修改 TypeScript/Zod 合同；
- 不创建 `visual-style.json`、Scene 目录、RendererRegistry 或 ResourceCatalog 实现；
- 不安装 `video-shotcraft` 为本仓库 runtime package、submodule 或 Composition 依赖；
- 不复制整个 `video-shotcraft` 仓库、完整 Gallery、全部 demos、模板或音频库；未来只允许按
  已选 recipe/asset 本地化最小闭包；
- 不把 Gallery preview MP4 当作最终 Scene，也不把 card name、参数表或 metadata 当作真实
  renderer 实现；
- 不默认放行上游 bundled audio；逐资产授权不确定时必须 blocked；
- 不要求每个 Scene 使用 Shotcraft，也不依据关键词自动选卡；
- 不制作 `gps-relativity` 的任何 Scene、Shot、asset、ambience 或 SFX；
- 不修改 complete WAV、caption、SemanticTiming、NarrativeCore、ProjectRegistry 或 M3/M4
  evidence；
- 不实现 NarrativeCheck、GlobalSoundPlan、GlobalVisualLayers、FinalPreviewApproval 或发布；
- 不设计通用 Scene DSL、自动布局器、自动导演或双 Scene overlap handles；
- 不搜索、打开、比较、模仿或复制旧 Scene/Composition/still/contact sheet；
- 不提取新共享能力；
- 不提交，不 push。

## 13. M5 完成门槛与自审

本规格只有在以下全部成立时才可提交用户审阅：

- [x] VisualStyleSpec 是项目级下游权威，不反向修改 M1–M4；
- [x] 一个 meaningId 对应一个独占 Agent 任务和一个 ScenePackage/fallback；
- [x] ScenePackage 内聚视觉与局部声音，SceneRenderer 仍严格 visual-only；
- [x] StoryVisualTrack/SoundDesignTrack 保留为显式运行时聚合，不成为两份 Scene 创作权威；
- [x] Scene 固定窗口来自 SemanticTiming，普通 Scene 修改不会 ripple-shift 后续 Beat；
- [x] SceneSyncAnchor 允许视觉动作与局部 SFX 在同一 package 内稳定同步；
- [x] 子 Agent 不编辑共享输入、registry、Catalog、capabilities 或其他 Scene；
- [x] ResourceCatalog 覆盖视觉、音频、style profile 与共享能力；
- [x] ResourceCatalog 区分 runtime resource、可本地化来源和 reference-only 证据；
- [x] video-shotcraft 等来源固定到 immutable commit，不进入 render runtime；
- [x] exact-demo-localized、inspiration-only 与空选择边界明确；
- [x] exact 选择绑定准确 demo、最小依赖闭包、真实 Renderer 使用、配对证据和独立 fidelity
      receipt；
- [x] 第三方代码与媒体资产分别记录 license/attribution，未验证媒体 fail closed；
- [x] visual/sound/package 分层 fingerprint 支持精确失效；
- [x] M6/M7/M8 已重新划分：M7 完成 Scene 局部声音，M8 只补全局声音/视觉与最终装配；
- [x] CaptionLayer、旁白、sealed PCM 和 Narrative Baseline 边界保持不变；
- [x] 无通用 DSL、自动布局、自动导演、runtime Agent/network 或共享能力提前提取。

本文档的审阅结果已记录为：

```text
approve（2026-08-02）→ M5 完成，允许单独编写并审阅 M6 实施计划
```

该批准不等于 M6 实现授权；M6 合同、测试、runtime、Scene 和生成产物仍未开始。
