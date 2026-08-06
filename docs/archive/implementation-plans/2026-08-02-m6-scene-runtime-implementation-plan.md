# M6 Resource Catalog and Scene Runtime Implementation Plan

> **归档说明：** 历史实施快照；其中命令、路径和状态不再代表当前仓库事实。

> **状态：** 待用户审阅。M5 ScenePackage 视听制作规格已于 2026-08-02 获用户正式批准；
> 本文档只把已批准边界拆成可逐 Task 执行的 TDD 实施计划。本轮不创建或修改 TypeScript、
> 测试、runtime、Scene、资产或 generated artifact，不 commit、不 push。

**目标：** 建立 Scene 制作所需的严格合同、统一 ResourceCatalog、冻结上游参考链、
composition-local RendererRegistry、visual-only Scene runtime、Scene-local sound runtime、
真实运行时投影和 `project:check --level final` 机械基础，并用一个 synthetic Scene 与一个
冻结的 `video-shotcraft` recipe fixture 证明基础设施真实可用；不制作 `gps-relativity` 的
5 个正式 ScenePackage。

**架构：** M6 只在 M1–M4 Narrative Baseline 下游增加可选 Scene 分支。制作期工具把本地
资产、style profile、共享 capability 和冻结 authoring reference 汇总为只读 Catalog；
Scene 输入通过严格合同、最小依赖闭包本地化、静态 Renderer binding、资源授权和分层
fingerprint 后生成 pass-only ScenePackage。运行时只消费生成后的静态 registry、本地源码、
本地资产和 ScenePackage 投影，不访问 Catalog 查询器、Git、上游仓库、Agent、skill、MCP、
网络或目录扫描。

**技术栈：** TypeScript 5.9.3、Zod 4.3.6、Node.js 20+ built-ins、TypeScript Compiler API、
Prettier 3.8.1、React 19.2.3、Remotion 4.0.489 与现有 canonical SHA-256。只使用宿主机
Node/npm、Git、FFmpeg/ffprobe 和 Remotion CLI；不新增 Docker，也不新增 npm 依赖。

## 1. Repo-truth planning baseline

本节是 2026-08-02 编写计划时从当前 checkout、代码、测试和真实命令重新确认的事实。

- Repository：`/data/projects/repos/remotion-story-producer`；分支 `codex/foundation`。
- HEAD：`6f94be0780e8fd25916f011123b8ec7dfd6b7b64`。
- 工作树已有用户预期的 M5 规格与 authority docs 未提交修改；这些修改必须保留，M6 执行
  只能精确修改当前 Task 列出的文件，不能 reset、覆盖或整理无关文件。
- `.codegraph/` 存在且索引 current；本计划已先用 CodeGraph 核对合同、project-check、
  ProjectRegistry、CompositionAssembly、style profiles、asset manifest 和测试调用路径。
- 当前 `npm test`：150 tests pass，0 fail、0 skipped、0 todo。
- 当前 `project:check --level narrative`：pass，report fingerprint 为
  `sha256:dd1dc79547123cc2a3c69a3f95ce81cdf951f3e569afbbdb94b51345bc52424c`。
- 当前 Composition listing 只有：

```text
CapabilityGallery    30 fps  1920x1080   150 frames
GpsRelativity        30 fps  1920x1080  1731 frames
```

- `src/contracts/` 当前只有 M1–M4 叙事、封存、timing、registry、Baseline 与 AutoCheck 合同；
  没有 VisualStyleSpec、ResourceCatalog、ExternalReferenceSnapshot、ShotRecipeSelection、
  SceneTaskInput、ScenePackage 或 final-check 合同。
- `src/contracts/assets.ts` 目前只有轻量 TypeScript 类型和路径断言，没有 Zod strict schema、
  checksum、allowed-use、license verification status、attribution 或 descriptor fingerprint。
- `src/remotion/capabilities/styles/` 已有 6 个 style profile；它们还没有进入统一 Catalog。
- `public/assets/library/` 只有 `.gitkeep`，当前没有可供 Scene 使用的 tracked 视觉/音频资产。
- `CompositionAssembly` 当前只有一个必需 `narrativeCore: ReactNode`；`GpsRelativity`
  Composition 只装配透明 NarrativeCore。
- `scripts/project-check/cli.ts` 当前只接受固定 `narrative` level，并显式拒绝 `final`。
- `scripts/registry/` 已提供可复用的固定一级目录发现、symlink 拒绝、TypeScript AST default
  export 检查、稳定排序、原子生成和 byte drift 模式；M6 的 RendererRegistry 应复用这些
  原则，不能与 ProjectRegistry 混为一个 registry。
- 当前仓库没有 `video-shotcraft` 依赖、submodule、snapshot、Gallery index、demo、preview、
  resolver、localizer 或 fidelity receipt；M6 不能把目标设计写成已实现事实。

### 1.1 受保护的 M1–M4 输入

M6 不修改以下文件或其语义：

```text
src/projects/gps-relativity/story.json
src/projects/gps-relativity/narration.json
src/projects/gps-relativity/render.json
src/projects/gps-relativity/reviews/story-check.json
src/projects/gps-relativity/generated/sealed-narration.generated.json
src/projects/gps-relativity/generated/semantic-timing.generated.json
src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json
src/projects/gps-relativity/generated/narrative-auto-check.generated.json
public/projects/gps-relativity/narration/**
src/remotion/runtime/narrative-core/**
src/projects/project-registry.generated.ts
out/gps-relativity/**
```

M6 可以扩展通用 `CompositionAssembly`，但 `GpsRelativity` 必须继续只传 `narrativeCore`，
不得为了证明可选插槽而给它创建 placeholder Scene、空 registry、空 Catalog、空视觉轨或
空声音轨。

### 1.2 M5 批准记录与 M6 repo truth

批准的规格权威为：

`docs/superpowers/plans/2026-08-02-m5-scene-package-production-specification.md`

批准只固定产品边界，不代表下列能力已存在：

```text
VisualStyleSpec / ResourceCatalog / ExternalReferenceSnapshot
ShotRecipeSelection / ReferenceFidelityReceipt
SceneTaskInput / SceneVisualPlan / ShotPlan / SceneSyncAnchor / SceneSoundPlan
ScenePackage / SceneCoverageMap / RendererRegistry
StoryVisualTrack / SceneSoundContribution / SoundDesignTrack
project:check --level final
```

## 2. Global hard boundaries

- M6 不制作 `gps-relativity` 的 5 个正式 ScenePackage；那是 M7。
- M6 不实现 M8 的 GlobalSoundPlan、全局 BGM、跨 Scene ambience、ducking、mastering、
  GlobalVisualLayers、FinalPreviewApproval 或最终 approval receipt。
- 不复制整个 `video-shotcraft` 仓库、Gallery、模板、全部 demos 或音频库；fixture 只保留
  一张已选 card、一个 style-key、准确 demo、一个 preview 和其最小依赖闭包。
- 不强迫每个 Scene 使用 Shotcraft。`exact-demo-localized`、`inspiration-only` 和空选择都是
  合法输入；只有 exact 模式进入严格 fidelity gate。
- 不做自动导演、关键词选卡、自动布局器、通用 Scene DSL、可执行 JSON、任意 module path、
  plugin graph 或通用 workflow engine。
- 不修改 Story、StoryBeat、`ttsChunks`、旁白、CaptionCue、sealed WAV 或 SemanticTiming；
  Scene 固定窗口只读来自当前 StoryBeatTiming。
- Narrative Baseline 在所有 Catalog、snapshot、Scene、coverage、registry 和增强轨 artifact
  缺失时仍必须独立通过 `project:check --level narrative`、preview 和 render。
- render runtime 不调用 Agent、skill、MCP、VoxCPM、Git、网络、目录扫描或 authoring CLI。
- 所有选中视觉/音频资产必须位于仓库 `public/`，由 descriptor 绑定 checksum、allowed-use、
  license verification 和 attribution；未知或 blocked 一律 fail closed。
- SceneRenderer 只输出视觉，不 import 或挂载 Audio、NarrationAudioTrack、CaptionLayer、
  complete WAV 或 SceneSoundPlan。
- Scene 局部声音只由固定 runtime 播放；M6 SoundDesignTrack 只汇总 Scene-local ambience/SFX，
  不接受 narration、BGM、cross-scene、ducking 或 mastering 字段。
- 所有 render-critical motion 只使用 Remotion frame API；禁止 CSS animation、CSS transition
  和 Tailwind animation utilities。
- 每个 ScenePackage 恰好一个 Scene-level `rendererId`；ShotPlan 不保存 rendererId、组件、
  JSX、函数或模块路径。
- Scene、Shot、anchor、ambience 和 SFX 使用零基、左闭右开 Scene-local frame；任何范围都
  必须落在 `[0, beatDurationInFrames)`，不得 ripple-shift 后续 Beat。
- 当前新实现默认 composition-local；M6 不把 synthetic proof 或本地化 recipe 提升到
  `src/remotion/capabilities/`。
- 不使用 Docker，不修改 Remotion 精确版本，不新增依赖。
- 每个 Task 先红测试、再最小实现、再聚焦验证、再建议小步 commit；完成 M6 后停止，不自动
  开始 M7，也不 push。

## 3. Fixed dependency direction

```text
M1–M4 Story + SemanticTiming + Narrative AutoCheck
                    │ read-only
                    ├───────────────┐
                    ↓               ↓
          VisualStyleSpec     ResourceCatalog snapshot
                    │               │
                    └───────┬───────┘
                            ↓
ExternalReferenceSnapshot → SceneTaskInput
                            ↓
        Scene plans + selected resources + recipe selection
                            ↓
     localized source + Renderer.tsx + local asset bytes
                            ↓
     resource / binding / fidelity / time preflight
                            ↓
                      ScenePackage
                     ↙            ↘
          visual projection     local-sound projection
                   ↓                 ↓
          StoryVisualTrack      SoundDesignTrack
                     ↘            ↙
                  CompositionAssembly
```

禁止的方向：

```text
narrative gate      -X-> Catalog / Scene / RendererRegistry requirement
Scene authoring     -X-> Story / narration / captions / SemanticTiming mutation
ShotRecipeSelection-X-> executable loader or module path
Catalog query       -X-> render runtime
RendererRegistry   -X-> ProjectRegistry merge
SceneRenderer      -X-> Audio / caption / narration ownership
scene sound runtime-X-> BGM / cross-Scene ambience / ducking / mastering
runtime            -X-> Agent / skill / MCP / Git / network / directory scan
M6                 -X-> gps-relativity formal ScenePackage or M8 global tracks
```

## 4. Locked M6 command surface

M6 只增加下列窄命令；所有参数顺序、数量、slug、ID 和路径规则都严格校验，未知参数失败：

```bash
npm run catalog:generate
npm run catalog:check
npm run catalog:query -- --kind <kind> [--tag <tag>] [--text <text>]

npm run reference:sync -- --project <slug> --source video-shotcraft --revision <40-char-commit>
npm run reference:localize -- --project <slug> --meaning-id <meaningId> --card <cardId> --style <styleKey>

npm run scene:package -- --project <slug> --meaning-id <meaningId> --write
npm run scene:package -- --project <slug> --meaning-id <meaningId> --check
npm run renderer-registry:generate -- --project <slug>
npm run renderer-registry:check -- --project <slug>

npm run project:check -- --project <slug> --level final
npm run project:check -- --project <slug> --level final --write-final-check

npm run m6:proof:compositions
npm run m6:proof:still
npm run m6:proof:evidence
```

命令边界：

- `reference:sync` 是唯一可显式访问获准上游的 authoring 命令；repository URL 由内置
  `video-shotcraft` adapter 固定，CLI 不接受任意 URL、branch、tag、`latest` 或输出路径。
- `reference:localize` 只能消费当前项目已冻结 snapshot，写入当前 meaningId 固定目录；
  不能传任意 source/destination path。
- `catalog:query` 只读 tracked generated Catalog，不写文件、不返回 executable loader。
- `scene:package --write` 只在全部合同、资源、来源、binding、license 和 fingerprint 通过时
  原子写 pass receipt；`--check` 只读 byte drift。
- `project:check --level narrative` 的现有两种 exact forms 完全保持不变。
- `final` 先要求 current narrative pass，再检查实际 Scene 分支；缺失 Scene artifact 只让
  final fail，不得让 narrative fail，也不得自动创建 fallback。
- synthetic proof 使用独立 Remotion entry，不注册为真实 Story，不进入 ProjectRegistry，
  不改变正常 `npm run compositions` 的两个既有 Composition。

## 5. Target file structure

```text
src/contracts/
├── scene-primitives.ts
├── visual-style.ts
├── resource-catalog.ts
├── external-reference.ts
├── shot-recipe.ts
├── reference-fidelity.ts
├── scene-task.ts
├── scene-plan.ts
├── scene-package.ts
├── final-check.ts
└── index.ts

src/remotion/catalog/
├── assets.manifest.json
├── capability-descriptors.ts
├── style-descriptors.ts
├── resource-catalog.generated.json
└── index.ts

scripts/catalog/
├── domain.ts
├── project-files.ts
├── generate.ts
└── cli.ts

scripts/external-references/
├── adapters/git.ts
├── adapters/video-shotcraft.ts
├── snapshot.ts
├── video-shotcraft-resolver.ts
├── dependency-closure.ts
├── source-guard.ts
├── localize.ts
├── project-files.ts
├── fidelity.ts
└── cli.ts

scripts/scene-package/
├── domain.ts
├── project-files.ts
├── generate.ts
└── cli.ts

scripts/renderer-registry/
├── domain.ts
├── project-files.ts
├── generate.ts
└── cli.ts

src/remotion/runtime/story-visual/
├── frame.ts
├── types.ts
├── SceneSlot.tsx
├── StoryBeatTransitionOverlay.tsx
├── StoryVisualTrack.tsx
└── index.ts

src/remotion/runtime/scene-sound/
├── resolve-scene-sound.ts
├── SceneSoundContribution.tsx
└── index.ts

src/remotion/runtime/sound-design/
├── SoundDesignTrack.tsx
└── index.ts

scripts/project-check/
├── final-run.ts
├── final-report-files.ts
├── cli.ts
└── project-files.ts

src/remotion/proofs/m6-scene-runtime/
├── index.ts
├── Root.tsx
├── Composition.tsx
├── proof-data.ts
├── renderer-registry.generated.ts
├── generated/scene-coverage.generated.json
└── scenes/m6-scene-proof/
    ├── task-input.generated.json
    ├── visual-plan.json
    ├── shot-plan.json
    ├── sound-plan.json
    ├── selected-resources.json
    ├── shot-recipe-selection.json
    ├── Renderer.tsx
    ├── shots/DrawSvgTraceShot.tsx
    └── generated/
        ├── localization-manifest.generated.json
        ├── reference-fidelity.generated.json
        └── scene-package.generated.json

public/assets/library/m6-scene-runtime/
├── proof-shape.svg
└── proof-pulse.wav

tests/fixtures/external-references/video-shotcraft/
└── d4915443232e89527fdc9d7e79f132ba411fc440/
    ├── fixture-manifest.json
    ├── LICENSE
    ├── gallery/api/library.draw-svg-trace.json
    ├── gallery/media/draw-svg-trace.mp4
    ├── references/shots/ui-entrance/draw-svg-trace.md
    ├── demos/_fixtures/Fixtures.tsx
    └── demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx
```

`d491544...` 是 M6 测试使用的冻结 fixture identity，不声明它是上游当前 HEAD。实施时必须
从完整不可变 commit 验证上述最小文件、许可证、Gallery entry、准确 demo 和 preview
checksum；若 commit 或单个 preview 的来源/授权无法验证，exact fixture fail closed，不能
换成浮动分支或只凭 card metadata 继续。

## 6. Fingerprint hierarchy

全部 fingerprint 使用既有 `sha256-canonical-json-v1`，每层包含固定 namespace、schema
version 和 algorithm ID；任何 self fingerprint 字段在计算时排除，其他 strict 字段全部覆盖。

```text
ResourceDescriptorFingerprint
= descriptor declaration + authority identity + allowedUse
+ file checksum/export identity + license/attribution verification

ResourceCatalogFingerprint
= catalog generator ID + ordered descriptor fingerprints

VisualStyleFingerprint
= Catalog fingerprint + resolved style descriptor fingerprint
+ artDirection + continuityRules + forbiddenTreatments

ExternalReferenceSnapshotFingerprint
= sourceId + fixed repository + immutable 40-char commit
+ canonical index + selected source/license file checksums + snapshot algorithm ID

ShotRecipeSelectionFingerprint
= task identity + ordered exact/inspiration selections
+ snapshot/card/style-key/card/demo/preview/closure identities
+ adaptation mode + reason + required traits

ReferenceFidelityReceiptFingerprint
= exact selections + immutable lineage + accurate demo
+ upstream closure hashes + localized source hashes
+ Renderer import/JSX/frame-state binding evidence
+ paired source/adaptation evidence + normal-speed review
+ code/media license and attribution results + checker version

SceneTaskInputFingerprint
= exact StoryBeat + story/render/timing/style/Catalog fingerprints
+ allowed snapshots/reference IDs + continuity brief + allowed directories

SceneVisualFingerprint
= task input + visual plan + ordered ShotPlan + sync anchors
+ selected visual descriptors + renderer-source fingerprint

SceneSoundFingerprint
= task input + sync-anchor fingerprint + sound plan
+ selected audio descriptors + scene-audio runtime version

ScenePackageFingerprint
= task + visual + sound + renderer binding
+ recipe selection + fidelity receipt + selected resources

SceneCoverageFingerprint
= ordered StoryBeat identities + each ready/fallback/missing/stale state
+ current package or fallback identity

RendererRegistryFingerprint
= ordered ready package renderer bindings + renderer source hashes
+ generator ID + generated bytes checksum

StoryVisualTrackFingerprint
= ordered ready visual projections + transition declarations + runtime version

SceneOnlySoundDesignFingerprint
= ordered ready Scene sound projections + runtime version

FinalMechanicalCheckFingerprint
= current Narrative AutoCheck fingerprint
+ style/Catalog/snapshot/coverage/package/registry/projection identities
+ final checker version
```

不允许把 VisualStyle、Catalog、Scene 或 reference fingerprint 加入 generation input、sealed
narration、SemanticTiming、ProjectRegistry entry 或 Narrative Baseline fingerprint。

## 7. Exact invalidation matrix

| Mutation                                                                      | 必须失效                                                          | 必须保持有效                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| VisualStyleSpec 变化                                                          | 所有依赖该 style 的 visual/package、StoryVisualTrack、final       | narration、timing、Narrative Baseline、纯 sound 输入 |
| selected resource bytes 与冻结 descriptor checksum 漂移                       | 引用 descriptor 的 selection/package/projection/final             | 未引用资源的 Scene、narrative                        |
| 主 Agent 显式冻结新 Catalog snapshot（含 descriptor/allowedUse/license 变化） | 绑定旧 Catalog 的 VisualStyle、全部 task/package/projection/final | sealed narration、timing、Narrative Baseline         |
| 上游出现新 commit但项目未切换 snapshot                                        | 无自动失效                                                        | 已冻结 snapshot/package/narrative                    |
| 当前 task 显式切换 snapshot                                                   | 绑定旧 snapshot 的 task/selection/fidelity/package/final          | 未重发的其他 Scene、narrative                        |
| card/style-key/demo/preview identity 变化                                     | 对应 selection/fidelity/visual/package/final                      | Scene sound、其他 Scene、narrative                   |
| localized source 或 closure 变化                                              | fidelity/renderer-source/visual/package/final                     | 未依赖 anchor 的 sound、其他 Scene                   |
| Renderer import/JSX/frame-state binding 删除                                  | exact fidelity、package、registry、visual/final                   | narrative、其他 Scene                                |
| normal-speed review 或 paired evidence 变化                                   | fidelity/package/final                                            | source contracts、narrative                          |
| 单 Scene visual/Shot 变化且 anchor 不变                                       | 该 visual/package/visual projection/final                         | 该 sound fingerprint、其他 Scene、narrative          |
| SceneSyncAnchor 变化/删除                                                     | 该 visual/sound/package、两条 projection、final                   | 其他 Scene、narrative                                |
| SceneSoundPlan/音频资源变化                                                   | 该 sound/package/sound projection/final                           | visual evidence、其他 Scene、narrative               |
| RendererRegistry bytes drift                                                  | registry/visual projection/final                                  | Scene authored inputs、narrative                     |
| coverage ready→missing/stale                                                  | final fail                                                        | narrative pass                                       |
| coverage ready→explicit fallback                                              | package/registry projection removed，coverage/final 重算          | narrative；其他 ready Scene                          |
| Story/SemanticTiming 变化                                                     | 所有不匹配 task/package/projection/final                          | 依既有 M1–M4 规则判断的上游                          |
| M6 runtime version 变化                                                       | 依赖对应 runtime 的 projection/package/final evidence             | authored plans、narrative                            |

每个 mutation 都在隔离临时副本执行；失败不能重写最后一份 pass receipt、Catalog、registry、
ScenePackage 或 M1–M4 artifact。

## 8. TDD task sequence

### Task 1: Add VisualStyleSpec and Scene/local-frame primitives

**目标与边界：** 建立后续合同共用的严格 ID、Scene-local frame、范围、renderer ID 和项目级
VisualStyleSpec。只做纯合同与 fingerprint，不读取 Catalog 文件，不创建任何 Story 的
`visual-style.json`，不修改 GPS 数据。

**Files:**

- Create: `src/contracts/scene-primitives.ts`
- Create: `src/contracts/visual-style.ts`
- Modify: `src/contracts/index.ts`
- Create: `tests/contracts/scene-primitives.test.ts`
- Create: `tests/contracts/visual-style.test.ts`

**先写失败测试：**

1. `SceneLocalFrameSchema` 只接受安全非负整数；`SceneLocalFrameRangeSchema` 必须
   `0 <= startFrame < endFrame <= beatDurationInFrames`。
2. `SceneRendererIdSchema`、`ShotIdSchema`、`SceneEventIdSchema` 接受稳定 slug，拒绝路径、
   空白、`.`/`..`、大小写漂移和任意 module path。
3. Scene frame helper 精确证明
   `sceneFrame = compositionFrame - beat.startFrame` 和
   `shotFrame = sceneFrame - shot.startFrame`，不接受负数或超界 frame。
4. VisualStyleSpec strict 拒绝 unknown field、空文本、重复/超量 continuity/forbidden rules、
   非 current Catalog fingerprint 和不合法 style profile ID。
5. VisualStyle fingerprint 对对象 key 顺序稳定，对 profile descriptor、art direction、
   continuity 或 forbidden treatment 的任何变化敏感，但不包含 Story 文案、旁白、字幕或
   SemanticTiming 内容。

**最小实现步骤：**

1. 复用 `StoryIdSchema`、`Sha256DigestSchema`、safe integer schema 和现有
   `createFingerprint`；不复制第二套 canonical JSON。
2. 暴露纯函数 `assertSceneLocalRangeWithinDuration`、`toSceneLocalFrame`、
   `toShotLocalFrame`，所有返回值先做 safe-integer/range 校验。
3. VisualStyleSpec 只保存 `storyId`、`styleProfileId`、Catalog fingerprint、artDirection、
   continuityRules 和 forbiddenTreatments；profile 是否存在留给 Task 3 的 Catalog resolver。
4. 定义 `VISUAL_STYLE_FINGERPRINT_VERSION` 和 namespace；compute 函数接收已解析 style
   descriptor fingerprint，避免仅凭字符串 profile ID 通过。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/scene-primitives.test.ts tests/contracts/visual-style.test.ts
npm run typecheck
```

**完成门槛：** 所有合同 strict；所有 local frame 计算无浮点、无隐式 clamp、无自动延长；
VisualStyle 不影响任何 M1–M4 fingerprint；没有新增项目 artifact。

**Fingerprint / fail-closed：** 非 current style descriptor、非法 frame、未知字段、重复 ID、
超界或 unsafe integer 直接抛错；不得猜测默认 style、修正范围或生成 placeholder fingerprint。

**建议 commit：** `feat(contracts): add visual style and scene frame primitives`

### Task 2: Define ResourceCatalog descriptors and policy

**目标与边界：** 定义 asset、style-profile、capability、authoring-reference 四类 descriptor，
以及 allowed-use、checksum、license/attribution 和 blocked policy。Catalog 是只读查询视图，
不是 runtime loader。

**Files:**

- Create: `src/contracts/resource-catalog.ts`
- Modify: `src/contracts/assets.ts`
- Modify: `src/contracts/index.ts`
- Modify: `src/remotion/capabilities/sound/library.ts`
- Create: `tests/contracts/resource-catalog.test.ts`
- Create: `tests/contracts/assets.test.ts`

**先写失败测试：**

1. 四类 descriptor 使用 discriminated strict schema；重复 resource ID、unknown kind/role、
   unknown field、空 tags/useCases、非 canonical 排序全部失败。
2. allowed-use 只允许 `runtime-approved`、`localize-code`、`localize-asset`、
   `reference-only`、`blocked`；kind 与 allowed-use 不兼容时失败。
3. runtime asset 必须有仓库 `public/` 下的 POSIX relative path、SHA-256 checksum、media role、
   license ID、verification `verified` 和满足要求的 attribution。
4. `unknown`、`unverified`、限制当前用途或显式 `blocked` 的资源不能进入 SelectedResourceRef；
   顶层 source license 不能替代单个 audio/image/font 的授权。
5. capability descriptor 只保存稳定 export identity/authority，不保存可执行 loader；
   authoring-reference 永远不能被 runtime asset resolver 返回。
6. 旧 `getProducerSoundLibrary` 只接受 current、runtime-approved、verified audio descriptor，
   且拒绝 narration 作为 Scene local sound。

**最小实现步骤：**

1. 将现有 `ProducerAssetManifest` 保留为窄兼容 export，但底层改由 strict
   `ResourceAssetDescriptorSchema`/manifest schema 校验，避免两份资产真相。
2. 定义 `LicenseRecordSchema`：license ID、verification status、source URL 可选、
   attribution required/text、verifiedAt/sourceEvidenceFingerprint；未验证状态统一映射 blocked。
3. 定义 `SelectedResourceRefSchema`，只保存 resource ID、kind、role、descriptor fingerprint
   和 Catalog fingerprint。
4. 定义 descriptor fingerprint 纯函数，覆盖 allowed-use、checksum、authority、license 和
   attribution；禁止 pathname 以外的动态执行数据。
5. 增加 resolver policy 纯函数：按使用场景检查 allowed-use，不做自动降级。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/resource-catalog.test.ts tests/contracts/assets.test.ts
npm run typecheck
```

**完成门槛：** 每类 descriptor 可独立 strict parse；逐资产授权缺失即 blocked；preview/
recipe 不会被当成 runtime media；现有 sound capability 编译通过。

**Fingerprint / fail-closed：** descriptor 自身、文件 checksum、allowed-use、license 或
attribution 任一变化都改变 descriptor fingerprint；缺字段、重复、路径越界、symlink、blocked
或 role mismatch 都失败，不允许以仓库顶层许可证兜底。

**建议 commit：** `feat(catalog): define resource descriptors and license policy`

### Task 3: Generate, query, and drift-check ResourceCatalog

**目标与边界：** 从明确 authority sources 生成稳定、tracked、只读 Catalog，并提供窄查询
CLI。render runtime 不 import query CLI，也不通过 Catalog 动态加载组件。

**Files:**

- Create: `src/remotion/catalog/assets.manifest.json`
- Create: `src/remotion/catalog/capability-descriptors.ts`
- Create: `src/remotion/catalog/style-descriptors.ts`
- Create: `src/remotion/catalog/resource-catalog.generated.json`
- Create: `src/remotion/catalog/index.ts`
- Create: `scripts/catalog/domain.ts`
- Create: `scripts/catalog/project-files.ts`
- Create: `scripts/catalog/generate.ts`
- Create: `scripts/catalog/cli.ts`
- Modify: `package.json`
- Create: `tests/catalog/resource-catalog.test.ts`
- Create: `tests/catalog/cli.test.ts`

**先写失败测试：**

1. 相同 authority inputs 不论读入顺序如何生成 byte-identical Catalog；descriptor 按 ID 稳定
   排序，Catalog fingerprint 稳定。
2. 当前 6 个 style profile 各解析为唯一 approved style descriptor；缺失、重复或 descriptor
   与实际 profile ID/export identity 漂移失败。
3. capability descriptors 只能绑定当前静态 export identity；不存在 export、重复 export、
   未批准 private file 或任意 module loader 失败。
4. asset manifest 文件缺失、malformed、unknown field、path escape、symlink、checksum 漂移、
   license blocked 时，写模式不覆盖旧 Catalog。
5. `catalog:check` 只读 byte drift；`catalog:query` 固定 kind/tag/text 组合、稳定排序、无结果
   返回空数组，未知 flag/path/output/write 失败。
6. Catalog 源码与 generated JSON 中不出现 React component、function、`import()`、网络 URL
   loader 或动态 module path。

**最小实现步骤：**

1. 用静态 TypeScript adapter 读取当前 style profiles/capability entrypoints；资产只读
   `assets.manifest.json`，初始允许 assets 为空。
2. builder 校验每个 descriptor 后计算 descriptor fingerprints，再计算 Catalog fingerprint，
   最后用 canonical JSON + Prettier/固定 serializer 输出。
3. `generate` 先完整构建到内存，全部通过后原子写；相同 bytes 不改 mtime。
4. `check` 只在内存重建并 byte compare；不修复。
5. `query` 只读 generated Catalog；kind 精确匹配、tags 交集、text 在 title/description/useCases
   中做固定 locale-independent lowercase match。
6. 将 `catalog:generate` 放入未来 M6 相关 prebuild/proof 流程，但不要让现有 narrative check
   或正常 Story listing 依赖 Catalog。

**聚焦验证：**

```bash
node --import tsx --test tests/catalog/resource-catalog.test.ts tests/catalog/cli.test.ts
npm run catalog:generate
npm run catalog:check
npm run catalog:query -- --kind style-profile --text cinematic
npm run typecheck
```

**完成门槛：** generated Catalog 可重建、可查询、byte-stable；当前 6 style profiles 和批准
capability entrypoints current；无 Scene/asset 时仍合法；narrative level 不读取它。

**Fingerprint / fail-closed：** authority source、descriptor、排序、checksum、allowed-use 或
license 变化使 Catalog fingerprint 变化；partial build、duplicate、drift 或 I/O error 不写旧
Catalog，也不回退 runtime scan。

**建议 commit：** `feat(catalog): add deterministic catalog generation and query`

### Task 4: Freeze ExternalReferenceSnapshot and resolve one exact Shotcraft card/demo/preview

**目标与边界：** 建立 immutable snapshot/index 合同和 `video-shotcraft` resolver，用一个
冻结 commit 下的 `draw-svg-trace` card/style/demo/preview 最小 fixture 证明准确解析；不把
上游安装为 package/submodule，不复制整仓。

**Files:**

- Create: `src/contracts/external-reference.ts`
- Modify: `src/contracts/index.ts`
- Create: `scripts/external-references/adapters/git.ts`
- Create: `scripts/external-references/adapters/video-shotcraft.ts`
- Create: `scripts/external-references/snapshot.ts`
- Create: `scripts/external-references/video-shotcraft-resolver.ts`
- Create: `scripts/external-references/project-files.ts`
- Create: `tests/external-references/snapshot.test.ts`
- Create: `tests/external-references/video-shotcraft-resolver.test.ts`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/fixture-manifest.json`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/LICENSE`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/gallery/api/library.draw-svg-trace.json`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/gallery/media/draw-svg-trace.mp4`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/references/shots/ui-entrance/draw-svg-trace.md`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/demos/_fixtures/Fixtures.tsx`
- Create: `tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440/demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx`

**先写失败测试：**

1. revision 只接受 40-char lowercase commit；branch、tag、short SHA、`latest`、dirty checkout
   和 HEAD mismatch 全部失败。
2. snapshot fingerprint 覆盖固定 repository、commit、canonical one-card index、license 和
   fixture file checksums；修改任一 byte 使旧 snapshot stale。
3. `cardId=draw-svg-trace + styleKey=draw-svg-trace` 唯一解析到完整 card、准确
   `DrawSvgTrace.tsx`、Gallery preview 与 closure root；card-only、错误 style、重复 entry、
   source doc 未声明准确 demo、preview 缺失都失败。
4. Gallery `generatedAt`、浮动 media query string 或远程当前状态不成为生产 identity；identity
   使用已缓存 preview bytes checksum 和 canonical repository-relative path。
5. source license 与 preview/media license 分开验证；preview 授权未知时 exact fixture blocked。
6. snapshot generator 只在完整验证后 append content-addressed record；相同 commit/bytes 复用，
   已存在路径不同 bytes 失败，不能原地覆盖。

**最小实现步骤：**

1. 定义 strict snapshot、card、style、demo、preview、license/index schemas；snapshot 中不保存
   executable loader。
2. Git adapter 只服务显式 authoring sync：固定 official repository、fetch 指定 full commit、
   detached checkout、验证 `rev-parse HEAD`、拒绝 dirty/symlink/path escape；工作区 ignored。
3. Shotcraft adapter 读取 `gallery/api/library.json` 与 card 文档的“参考实现”，把 card/style、
   demo source 和本地 preview bytes 交叉验证。
4. fixture 只裁出单张 `draw-svg-trace` card、单 style、单 preview、准确 demo、
   `_fixtures/Fixtures.tsx` 和 Apache-2.0 license；不复制其他卡、Gallery UI、模板或音频。
5. 为 fixture manifest 记录每个文件 SHA-256、来源路径、commit 和授权证据；测试从 bytes 重算，
   不信任手写 checksum。

**聚焦验证：**

```bash
node --import tsx --test tests/external-references/snapshot.test.ts tests/external-references/video-shotcraft-resolver.test.ts
npm run typecheck
```

**完成门槛：** 一个真实冻结 fixture 可唯一解析 card/style/card doc/demo/preview；整个 fixture
只含最小文件；没有 runtime import、remote URL fetch 或浮动 identity。

**Fingerprint / fail-closed：** commit/index/card/demo/preview/license/file byte 任一漂移使 snapshot
或 resolved reference stale；缺 preview 授权、来源不唯一或不能证明准确 demo 时 exact path
失败，不自动降级或换卡。

**建议 commit：** `feat(references): add immutable shotcraft snapshot resolver`

### Task 5: Add ShotRecipeSelection states and minimal dependency localization guards

**目标与边界：** 实现 exact-demo-localized、inspiration-only、empty 三态合同与最小依赖闭包
本地化。selection 只保存 provenance，不保存 loader；localizer 只复制已选 closure 到固定
Scene 目录。

**Files:**

- Create: `src/contracts/shot-recipe.ts`
- Modify: `src/contracts/index.ts`
- Create: `scripts/external-references/dependency-closure.ts`
- Create: `scripts/external-references/source-guard.ts`
- Create: `scripts/external-references/localize.ts`
- Create: `scripts/external-references/cli.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `tests/contracts/shot-recipe.test.ts`
- Create: `tests/external-references/dependency-closure.test.ts`
- Create: `tests/external-references/localize.test.ts`
- Create: `tests/external-references/cli.test.ts`

**先写失败测试：**

1. empty selection 以 `selections: []` 表达并有稳定 fingerprint；伪造 `mode: none` card 失败。
2. inspiration-only 必须有 snapshot/card/style provenance、selectionReason，允许不生成 exact
   receipt，但不得带 `fidelityStatus: pass` 或 exact claim。
3. exact 必须绑定 snapshot/card/style/card/demo/preview fingerprints、requiredTraits 和 closure
   identity；缺一项或跨 snapshot 混用失败。
4. closure 从准确 demo 的静态 relative imports 递归得到，`draw-svg-trace` 精确为 demo TSX +
   `_fixtures/Fixtures.tsx`；未使用文件、整个目录、Gallery、其他 demo 不进入 closure。
5. 拒绝 dynamic import、`require`、非字面量 import、HTTP(S)、absolute path、`..` escape、
   symlink、上游 package/global-skill import、未批准 npm package 和远程 asset。
6. 允许的 bare imports 仅限当前项目精确依赖中的 `react`/`remotion` 等明确 allowlist；
   allowlist 版本与 package lock 漂移进入 localization fingerprint。
7. localizer 只写
   `src/projects/<story>/scenes/<meaningId>/shots/video-shotcraft/<cardId>/`，复制许可证/NOTICE
   和 generated localization manifest；目标已有不同 bytes 时失败，不覆盖 Agent 修改。

**最小实现步骤：**

1. 用 TypeScript Compiler API 建立保守 import graph；只跟随 snapshot root 内 regular files。
2. closure manifest 记录 source relative path、source checksum、destination relative path、
   localized checksum、license/attribution 和 dependency reason。
3. source guard 对 closure 与最终 Scene renderer import graph 都运行；render/runtime 文件中
   禁止出现 snapshot workspace、GitHub、skill path、`video-shotcraft` package 或远程 URL。
4. CLI 固定为 `reference:sync` 与 `reference:localize` 两种 action；source/revision/card/style/
   project/meaningId 全部按 exact positional flags 解析，不接受任意路径。
5. localization 只复制准确 demo 基线；内容适配由 Scene authoring 后续完成，任何适配修改都
   产生新 localized checksum 并保留修改声明。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/shot-recipe.test.ts tests/external-references/dependency-closure.test.ts tests/external-references/localize.test.ts tests/external-references/cli.test.ts
npm run typecheck
```

**完成门槛：** 三态清楚且互斥；empty 不要求 Shotcraft；exact fixture 只本地化 2 个 TSX +
license/notice；禁止上游 runtime/package/global-skill/remote import 的测试全部通过。

**Fingerprint / fail-closed：** selection/closure/allowlist/source/destination/license 任一变化都
使 selection/localization identity 变化；解析不确定、目标冲突、import graph 不闭合或授权
blocked 时不复制任何部分文件、不生成成功 manifest。

**建议 commit：** `feat(references): localize exact shot recipe closures safely`

### Task 6: Generate pass-only ReferenceFidelityReceipt from real binding and paired evidence

**目标与边界：** 为 exact selection 建立独立 fidelity gate，绑定 immutable lineage、准确 demo、
本地源码 hash、真实 Renderer import/JSX/frame-state、source/adaptation 配对证据和正常速度
可辨识度。机械 checker 不冒充主观视觉判断；正常速度结论来自 current Agent review record，
receipt 只机械绑定该结论与当前 evidence。

**Files:**

- Create: `src/contracts/reference-fidelity.ts`
- Modify: `src/contracts/index.ts`
- Create: `scripts/external-references/fidelity.ts`
- Create: `tests/contracts/reference-fidelity.test.ts`
- Create: `tests/external-references/fidelity.test.ts`
- Create: `tests/fixtures/external-references/fidelity/source-adaptation-review.json`

**先写失败测试：**

1. exact receipt 必须逐 selection 绑定 snapshot/card/style/card/demo/preview、closure、localized
   source 和 license identities；缺失、重复、乱序或 stale identity 失败。
2. Renderer binding 不能由 JSON 自报：checker 从 TypeScript AST 证明 Renderer 静态 import
   localized Shot、返回 JSX 中实际实例化该 identifier，并把 `sceneFrame`/`shotFrame` 派生值
   传入组件。
3. localized Shot 必须在 render-critical state 中消费传入 frame；只 import 未使用、只放
   metadata、dead orphan file、静态不变 JSX 或与 selected recipe 无关的组件不能通过。
4. 至少两个 probe frame 的渲染状态/evidence checksum 必须不同，并与 review record 中同一
   normalized phase pair 对齐；source/adaptation 证据缺一侧、错配或修改后旧 review 失败。
5. normal-speed review 必须绑定 source/adaptation preview checksum、fps、duration、required
   traits 逐项结论和 `recognizable: true`；false/unknown/空 note 不能生成 pass receipt。
6. inspiration-only 和 empty 生成严格 `not-applicable` identity，不得出现 pass；exact 不允许
   `not-applicable`。
7. 代码 license、单个媒体 license 或 attribution 不 current 时 receipt 失败；失败不覆盖
   现有 pass receipt。

**最小实现步骤：**

1. 定义 `ReferenceFidelityReviewSchema` 与 pass-only
   `ReferenceFidelityReceiptSchema`；review 是 Agent 批量审核输入，不是用户 approval。
2. 建立保守 AST binding checker：跟随固定 Scene-local import graph，拒绝 alias ambiguity、
   namespace escape、dynamic import 和无法证明的 re-export。
3. 要求本地化 Shot 暴露显式 frame prop；Renderer 从 validated Scene runtime props 计算
   `shotFrame` 并传入，避免只凭 `useCurrentFrame` 字符串匹配冒充 binding。
4. evidence manifest 记录 source/adaptation 同 phase still 或 motion-strip checksums、normal-speed
   preview checksum、生成命令版本和 Remotion fps；checker 不根据文件名猜 identity。
5. receipt 只在所有 exact item pass 后 canonical/原子写；empty/inspiration 返回 current
   not-applicable record，保持模式差异可机读。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/reference-fidelity.test.ts tests/external-references/fidelity.test.ts
npm run typecheck
```

**完成门槛：** exact fixture 的 lineage、demo、closure、localized bytes、真实 frame binding、
配对 evidence、normal-speed review 和授权全部被一个 current receipt 绑定；metadata-only 和
orphan-copy tests 均失败。

**Fingerprint / fail-closed：** source/adaptation 任一 byte、Renderer binding、probe frame、
preview、review、required trait、license 或 checker version 改变都使旧 receipt stale；checker
无法静态证明时失败，不把“不确定”当 pass。

**建议 commit：** `feat(references): add strict reference fidelity receipts`

### Task 7: Add SceneTaskInput and authored visual/shot/anchor/sound contracts

**目标与边界：** 把主 Agent 冻结输入与单 meaningId authored plans 固化成 strict contracts。
不生成 ScenePackage，不创建 GPS Scene；Shot 不绑定字幕/TTSChunk/renderer/module。

**Files:**

- Create: `src/contracts/scene-task.ts`
- Create: `src/contracts/scene-plan.ts`
- Modify: `src/contracts/index.ts`
- Create: `tests/contracts/scene-task.test.ts`
- Create: `tests/contracts/scene-plan.test.ts`
- Create: `tests/fixtures/scene/m6-scene-input.ts`

**先写失败测试：**

1. SceneTaskInput 精确绑定 StoryBeat value、Story/timing/render/style/Catalog fingerprints、
   allowed snapshot/reference IDs、previous/next continuity、允许输出目录和固定 Beat range。
2. task storyId/meaningId 与 StoryBeat/SemanticTiming 不一致、snapshot 不在 allowlist、目录越过
   当前 meaningId 或 fingerprint stale 时失败。
3. SceneVisualPlan strict 覆盖语义目标、主体/动作/因果/主构图、style 落实、连续性、ordered
   Shot IDs、visual resource IDs、recipe decision 和 fallback intent；重复/缺失 Shot ID 失败。
4. ShotPlan 使用 ordered、唯一、非空的 primary local ranges，全部在 Beat 内；不允许
   rendererId、component、modulePath、CaptionCue、chunkId 或 TTSChunk 字段。
5. SceneSyncAnchor eventId 在 Scene 内唯一，local frame 在窗口内；anchor purpose 非空。
6. SceneSoundPlan 无声音时必须显式 `ambience: null, cues: []`；ambience/SFX 只能引用
   approved audio resource，anchor/explicit sceneLocalFrame 二选一，解析后完整 cue 不越界。
7. sound schema 拒绝 narration、complete WAV、BGM、cross-scene、ducking、mastering、provider、
   URL 和任意动态 source path。

**最小实现步骤：**

1. SceneTaskInput fingerprint 直接覆盖冻结的 exact StoryBeat/timing range 与所有 shared-input
   fingerprints；continuity 只含当前 Story 摘要，不含旧 Scene 路径或历史 still。
2. SceneVisualPlan 与 ShotPlan 分离：VisualPlan 引用 ordered Shot IDs；ShotPlan 提供 primary
   ranges、purpose/action/resource IDs；M6 只验证声明顺序、非空与窗口边界，不自动填洞或
   推导 Shot 边界，局部 layers 留在 Renderer 源码，不演化为 DSL。
3. SceneSyncAnchor 独立 fingerprint；visual 和 sound fingerprint 都引用它，使 anchor drift
   精确失效两侧。
4. 声音 cue resolver 纯函数解析 `{eventId, offsetFrames}` 或 `sceneLocalFrame`，用整数运算
   校验 `[start, start + duration)`。
5. SelectedResourceRef 全部通过 Task 2 policy resolver；计划数据不保存 public path，runtime
   只接收已经解析并校验的 local src。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/scene-task.test.ts tests/contracts/scene-plan.test.ts
npm run typecheck
```

**完成门槛：** 一个 synthetic 120-frame Beat 可形成合法 task/visual/shot/anchor/empty-or-local
sound contracts；所有跨 Beat、跨目录、字幕/TTS ownership 和 M8 字段均 fail closed。

**Fingerprint / fail-closed：** task/shared input、plan、shot order/range、anchor、sound cue 或
resource descriptor 任一变化只重算相应层；无 clamp、无自动移动 cue、无自动生成 fallback。

**建议 commit：** `feat(contracts): add scene task visual shot and sound plans`

### Task 8: Generate ScenePackage and ordered SceneCoverageMap

**目标与边界：** 只在全部本地输入 current 时生成一个 meaningId 的 pass-only ScenePackage，
并按 StoryBeat 顺序生成 ready/fallback/missing/stale coverage。M6 只对 synthetic fixture 写
package，不为 GPS 写任何 package/coverage。

**Files:**

- Create: `src/contracts/scene-package.ts`
- Modify: `src/contracts/index.ts`
- Create: `scripts/scene-package/domain.ts`
- Create: `scripts/scene-package/project-files.ts`
- Create: `scripts/scene-package/generate.ts`
- Create: `scripts/scene-package/cli.ts`
- Modify: `package.json`
- Create: `tests/contracts/scene-package.test.ts`
- Create: `tests/scene-package/generate.test.ts`
- Create: `tests/scene-package/coverage.test.ts`
- Create: `tests/scene-package/cli.test.ts`

**先写失败测试：**

1. ScenePackage strict receipt 恰好有一个 rendererId、一份 SceneSoundPlan identity，不保存
   独立 duration，必须从 SemanticTiming 重算 Beat range/duration。
2. task/style/timing/Catalog/snapshot/selection/fidelity/visual/anchor/sound/renderer/resource
   fingerprints 任一不 current 时不生成 package。
3. empty recipe 要求 current not-applicable fidelity identity；inspiration-only 不接受 exact pass；
   exact 必须 current pass receipt。
4. coverage 按 StoryBeat 顺序一一覆盖，状态互斥：ready 绑定 current package；fallback 绑定
   explicit approved fallback declaration；missing 无 package；stale 必须说明漂移层。
5. duplicate/unknown/out-of-order meaningId、ready 无 package、fallback 同时带 renderer、missing
   冒充 final-ready、stale 被自动修复全部失败。
6. `--write` 仅 pass 后原子写且 identical bytes 保持 mtime；`--check` 只读拒绝 missing/
   malformed/unknown field/byte drift；失败保留旧 receipt。
7. GPS 项目缺少 Scene files 时 `scene:package` 明确失败，但不创建目录、不修改 narrative artifacts。

**最小实现步骤：**

1. 将 package builder 写成纯 domain function，文件 adapter 只按固定项目/meaningId 路径读取。
2. renderer source fingerprint 先由 Task 10 的 registry/source checker接口注入；Task 8 可用测试
   fixture adapter，不在 JSON 自报源码 current。
3. package canonical receipt 保存各层 identity 与 selected descriptor fingerprints，不复制
   authored plan 全文，也不存 JSX/path loader。
4. coverage generator 从 StoryBeat order + valid packages + explicit fallback declarations推导；
   `missing`/`stale` 是检查结果，不允许手工改 ready。
5. 写入临时文件、fsync/rename（沿用现有 atomic pattern）；失败路径无 partial receipt。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/scene-package.test.ts tests/scene-package/generate.test.ts tests/scene-package/coverage.test.ts tests/scene-package/cli.test.ts
npm run typecheck
```

**完成门槛：** synthetic Scene 可生成 byte-stable package/coverage；GPS 缺 Scene 时保持完全
不变；ready/fallback/missing/stale 语义与 final gate 分离清楚。

**Fingerprint / fail-closed：** ScenePackage 覆盖所有分层 inputs；coverage 覆盖 ordered state
与 package/fallback identity。任何失效不自动重写旧 package 为 pass，不把 missing 默认为
fallback。

**建议 commit：** `feat(scene): generate scene packages and coverage`

### Task 9: Prove the exact Scene invalidation matrix in isolated fixtures

**目标与边界：** 用临时副本逐项 mutation 证明 M6 fingerprint 和 fail-closed 传播，不触碰
真实 GPS 受保护文件，不依赖 Agent 记忆。

**Files:**

- Create: `tests/fixtures/m6-project.ts`
- Create: `tests/scene-package/invalidation.test.ts`
- Modify: `tests/scene-package/generate.test.ts`

**先写失败测试：**

按本计划第 7 节至少逐项建立独立 test case：

1. VisualStyle art direction；
2. selected asset checksum；
3. selected asset allowed-use/license→blocked；
4. Catalog fingerprint；
5. snapshot commit/index；
6. card/style/demo/preview identity；
7. localized source byte；
8. Renderer import/JSX/frame-state binding；
9. paired evidence/normal-speed review；
10. SceneVisualPlan/ShotPlan；
11. anchor move/delete；
12. SceneSoundPlan/audio bytes；
13. renderer registry byte；
14. coverage ready/fallback/missing/stale；
15. StoryBeat/SemanticTiming range；
16. visual runtime、scene-audio runtime 和 fidelity checker version。

每个 case 断言：必须失效层、必须保持有效层、旧 pass receipt bytes/mtime、Narrative AutoCheck
bytes、sealed WAV checksum 和 SemanticTiming checksum。只有 VisualStyle、project Catalog
snapshot、Story/SemanticTiming 等明确的 project-global 输入允许使全部 Scene task/package
失效；单 Scene/resource/reference mutation 不得误伤其他 Scene。

**最小实现步骤：**

1. fixture helper 在 `mkdtemp` 下创建一个两 Beat synthetic project、current narrative stubs、
   一 ready Scene 和一 explicit fallback；每个测试拿独立副本。
2. 对每个 mutation 只改一个权威输入，重新运行纯 checker，不调用 writer repair。
3. 记录 before/after fingerprints 与 expected failure code；错误输出只用固定 safe code，不泄漏
   临时绝对路径或 raw stack。
4. 增加 source scan，证明 invalidation test/helper 不 import provider/network/Agent/skill。

**聚焦验证：**

```bash
node --import tsx --test tests/scene-package/invalidation.test.ts
```

**完成门槛：** 16 类 mutation 全部独立通过；没有 false-positive 全局失效，也没有漏掉必须
失效层；Narrative Baseline identity 在纯 Scene/reference mutation 中保持 current。

**Fingerprint / fail-closed：** 本 Task 是 fingerprint 设计的验收；若无法证明精确边界，回到
对应合同修正，不能放宽为“全部重建”或“忽略 stale”。

**建议 commit：** `test(scene): prove exact m6 invalidation boundaries`

### Task 10: Generate composition-local RendererRegistry with literal static imports

**目标与边界：** 把 current ready ScenePackage.rendererId 绑定到当前项目的 Scene-level
Renderer default export。RendererRegistry 与 ProjectRegistry 分离；Shot/local component 不
成为 registry entry。

**Files:**

- Create: `src/remotion/runtime/story-visual/types.ts`
- Create: `scripts/renderer-registry/domain.ts`
- Create: `scripts/renderer-registry/project-files.ts`
- Create: `scripts/renderer-registry/generate.ts`
- Create: `scripts/renderer-registry/cli.ts`
- Modify: `package.json`
- Create: `tests/renderer-registry/renderer-registry.test.ts`
- Create: `tests/renderer-registry/cli.test.ts`

**先写失败测试：**

1. 发现只允许
   `src/projects/<story>/scenes/<meaningId>/Renderer.tsx` fixed depth；nested/extra files ignored，
   project/scene symlink 和 path escape 失败。
2. 每个 ready package 恰好匹配一个 meaningId/rendererId/default export；unknown/duplicate ID、
   package/dir mismatch、fallback/missing entry 被注册全部失败。
3. generated source stable sort，使用字面量 static `import RendererX from "./scenes/.../Renderer"`；
   不出现 JSON path、dynamic import、directory scan 或 Shot component entry。
4. AST 检查 default export exactly once；Renderer source 禁止 Audio/Caption/Narration、CSS
   animation/transition、remote URL 和上游/global-skill import。
5. generated bytes、renderer transitive local source hash 与 package renderer fingerprint current；
   one-byte drift check 失败且不修复。
6. 无 ready package 时不要求生成 registry；Narrative Baseline 不读取空 registry。

**最小实现步骤：**

1. `SceneRendererProps` 只包含 story/meaning、sceneFrame/duration/fps/width/height、read-only
   StoryBeat/timing/style/visual plan/shots/anchors/resolved visual resources。
2. 复用 ProjectRegistry 的 stable rendering、Prettier、atomic write 和 byte check pattern，但
   建立独立 generator ID 和项目本地 output。
3. 生成 registry object 只含 rendererId→component 的静态绑定与 fingerprint metadata；runtime
   不解析 JSON module path。
4. 源码 guard 遍历 Renderer 的 composition-local relative imports，计算 normalized source graph
   fingerprint，并拒绝越出项目/approved capability entrypoints。

**聚焦验证：**

```bash
node --import tsx --test tests/renderer-registry/renderer-registry.test.ts tests/renderer-registry/cli.test.ts
npm run typecheck
```

**完成门槛：** synthetic ready package 生成唯一 literal registry；unknown/duplicate/stale/default
export/symlink/Audio violations fail；GPS 无 Scene 时不产生 registry 依赖。

**Fingerprint / fail-closed：** registry fingerprint 绑定 ordered package mapping、renderer source
graph、generator ID 和 generated bytes；任何 drift 失败，不 fallback 到 runtime discovery。

**建议 commit：** `feat(scene): add static composition-local renderer registry`

### Task 11: Project real ScenePackage visuals into StoryVisualTrack

**目标与边界：** 实现 Scene/local/shot frame helpers、固定 Beat Sequence、visual-only Renderer
调用、hard cut 与等时长 visual-only overlay。只消费 validated packages/registry，不创作选择，
不改 timing。

**Files:**

- Create: `src/remotion/runtime/story-visual/frame.ts`
- Create: `src/remotion/runtime/story-visual/SceneSlot.tsx`
- Create: `src/remotion/runtime/story-visual/StoryBeatTransitionOverlay.tsx`
- Create: `src/remotion/runtime/story-visual/StoryVisualTrack.tsx`
- Create: `src/remotion/runtime/story-visual/index.ts`
- Create: `tests/runtime/story-visual-frame.test.ts`
- Create: `tests/runtime/story-visual-track.test.tsx`
- Create: `tests/runtime/story-beat-transition.test.tsx`

**先写失败测试：**

1. `SceneSlot` 外层 `Sequence.from/durationInFrames` 精确等于 StoryBeatTiming；sceneFrame 在
   `[0,duration)`，不独立延长/缩短。
2. ready package 只解析一次 rendererId，传入 validated props；unknown/stale registry entry
   render 前失败。
3. fallback Beat 不调用 Renderer；missing/stale coverage 不能进入 visual projection。
4. StoryBeat order 与 timing 连续性 current；重复、乱序、overlap、gap 与 total duration mismatch
   按既有 SemanticTiming 规则 fail closed。
5. hard cut 不增加节点时长；overlay 只在边界上的固定时长窗口叠加纯视觉 preset，不移动、
   overlap 或裁掉 spoken Scene frames。
6. runtime source 不出现 Audio、CaptionLayer、NarrationAudioTrack、Catalog query、fs/network、
   CSS animation/transition 或 arbitrary component array。
7. visual projection fingerprint 对 ordered package visual identities、transition 和 runtime version
   敏感，对 Scene sound-only 变化不敏感。

**最小实现步骤：**

1. 用已有 SemanticTiming 绝对 ranges 建立 `StoryVisualProjection` 纯数据；runtime 只展开。
2. `SceneSlot` 在 Sequence 内用 `useCurrentFrame()` 得到 local frame，调用 registry renderer；
   shotFrame 由 Renderer 使用 Task 1 helper计算。
3. transition schema 只支持 `hard-cut` 与 `visual-overlay-v1`，overlay duration 不改变任何 Beat
   或 Composition duration；不实现双 Scene overlap handles。
4. StoryVisualTrack 只接受 ready/fallback coverage 和 current registry/projection fingerprint，
   不读取 Scene authored JSON 或 Catalog。

**聚焦验证：**

```bash
node --import tsx --test tests/runtime/story-visual-frame.test.ts tests/runtime/story-visual-track.test.tsx tests/runtime/story-beat-transition.test.tsx
npm run typecheck
```

**完成门槛：** synthetic Scene 视觉真实挂载在固定 Beat；hard cut/overlay 不改变总长；无 Scene
输入时组件不被创建，NarrativeCore 路径不受影响。

**Fingerprint / fail-closed：** visual projection 绑定 ordered current package/transition/runtime；
unknown registry、range drift、missing coverage 或 stale fingerprint 在 render 前失败，不跳过。

**建议 commit：** `feat(runtime): project scene visuals into fixed beat windows`

### Task 12: Project Scene-local audio into scene-only SoundDesignTrack

**目标与边界：** 实现固定 Scene audio runtime和 Story-level scene-only SoundDesignTrack，只播放
ScenePackage 声明的 ambience/SFX。不拥有旁白、全局 BGM、跨 Scene ambience、ducking 或
mastering。

**Files:**

- Create: `src/remotion/runtime/scene-sound/resolve-scene-sound.ts`
- Create: `src/remotion/runtime/scene-sound/SceneSoundContribution.tsx`
- Create: `src/remotion/runtime/scene-sound/index.ts`
- Create: `src/remotion/runtime/sound-design/SoundDesignTrack.tsx`
- Create: `src/remotion/runtime/sound-design/index.ts`
- Create: `tests/runtime/scene-sound.test.tsx`
- Create: `tests/runtime/sound-design-track.test.tsx`

**先写失败测试：**

1. ambience 与 cue 都从 SelectedResourceRef 解析到 current `public/` local audio；checksum、kind、
   role、allowed-use 或 license mismatch 在 render 前失败。
2. anchor+offset 和 explicit local frame 二选一；计算出的 `[start,end)` 必须完全在 Beat 内，
   不 clamp、不 spill、不移动下一 Beat。
3. SceneSoundContribution 只挂载已声明 Audio，volume finite 且 `[0,1]`；空 plan 输出 null。
4. SoundDesignTrack 按 StoryBeat order 汇总 Scene sound projections；fallback/empty sound 合法，
   missing/stale coverage 不能冒充 final-ready。
5. source/props/schema 中不存在 narration、completeAudio、bgm、crossScene、ducking、mastering、
   provider、network 或 auto-mix 字段。
6. scene-only sound fingerprint 对 anchor/sound plan/audio checksum/runtime version敏感，对
   visual-only source变化（anchor不变）不敏感。
7. NarrativeAudioTrack 仍只挂一次 complete WAV，Scene audio runtime 不 import它。

**最小实现步骤：**

1. 纯 resolver 先把 anchors/cues 解析为 absolute contribution，但保留 Beat from/duration guard；
   React runtime 不重新做创作选择。
2. 用 Remotion frame/Sequence API 固定挂载；资源 src 只能来自已校验 local descriptor，不能
   接受 authored arbitrary path。
3. SoundDesignTrack 接收 projection，不接收 GlobalSoundPlan；未来 M8 用独立扩展添加 global
   contribution，不修改 SceneSoundPlan ownership。
4. 增加源代码 guard，确保 Scene Renderer 没有 Audio，SceneSound runtime 没有 caption/
   narration/global fields。

**聚焦验证：**

```bash
node --import tsx --test tests/runtime/scene-sound.test.tsx tests/runtime/sound-design-track.test.tsx tests/runtime/narrative-core.test.tsx
npm run typecheck
```

**完成门槛：** synthetic ambience/SFX 在固定 Scene window 内真实挂载；空 plan 合法；任何
越界/blocked/unknown/stale 资源 fail；M8 字段完全不存在。

**Fingerprint / fail-closed：** anchor、cue、volume、audio checksum/license、runtime version
变化只使 sound/package/final 下游失效；visual-only变化且 anchor current 时 sound 保持有效。

**建议 commit：** `feat(runtime): add fixed scene-local sound projection`

### Task 13: Add real CompositionAssembly slots and close the synthetic Scene proof

**目标与边界：** 只有在存在真实、current synthetic ScenePackage 输入时，给
CompositionAssembly 增加 `storyVisualTrack` 和 scene-only `soundDesignTrack` 显式插槽，并用
独立 M6 proof Composition 真实 listing/still/evidence 证明 visual+local sound 投影。正常
GpsRelativity Composition 保持 narrative-only。

**Files:**

- Modify: `src/remotion/runtime/composition-assembly/CompositionAssembly.tsx`
- Modify: `src/remotion/runtime/composition-assembly/index.ts`
- Modify: `tests/runtime/composition-assembly.test.tsx`
- Modify: `tests/projects/gps-relativity-composition.test.tsx`
- Create: `src/remotion/proofs/m6-scene-runtime/index.ts`
- Create: `src/remotion/proofs/m6-scene-runtime/Root.tsx`
- Create: `src/remotion/proofs/m6-scene-runtime/Composition.tsx`
- Create: `src/remotion/proofs/m6-scene-runtime/proof-data.ts`
- Create: `src/remotion/proofs/m6-scene-runtime/renderer-registry.generated.ts`
- Create: `src/remotion/proofs/m6-scene-runtime/generated/scene-coverage.generated.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/task-input.generated.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/visual-plan.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/shot-plan.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/sound-plan.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/selected-resources.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/shot-recipe-selection.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/Renderer.tsx`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/shots/DrawSvgTraceShot.tsx`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/generated/localization-manifest.generated.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/generated/reference-fidelity.generated.json`
- Create: `src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/generated/scene-package.generated.json`
- Create: `public/assets/library/m6-scene-runtime/proof-shape.svg`
- Create: `public/assets/library/m6-scene-runtime/proof-pulse.wav`
- Modify: `src/remotion/catalog/assets.manifest.json`
- Modify: `src/remotion/catalog/resource-catalog.generated.json`
- Modify: `package.json`
- Create: `tests/runtime/m6-scene-runtime-proof.test.tsx`
- Create: `scripts/m6-proof/evidence.ts`
- Create: `tests/m6-proof/evidence.test.ts`
- Create: `docs/evidence/2026-08-02-m6-scene-runtime-foundation.md`

**先写失败测试：**

1. CompositionAssembly props 恰好是 required `narrativeCore`、optional `storyVisualTrack`、
   optional `soundDesignTrack`；没有 generic tracks、GlobalVisualLayers 或 placeholder。
2. assembly 固定视觉顺序保证 Scene visual 在下、NarrativeCore/CaptionLayer 在上；sound node
   可并列但不替换 NarrationAudioTrack。只传 narrative 时输出与 M3 行为等价。
3. `GpsRelativity` source 不 import Scene/Catalog/RendererRegistry，不传两个可选插槽；其
   metadata、1731 frames、complete WAV 和 caption props 不变。
4. proof 使用一个 synthetic `m6-scene-proof`、120-frame fixed Beat、一个 renderer、一个
   `draw-svg-trace` exact localized Shot、一个 verified SVG 和一个 Scene-local pulse WAV；
   不读取 GPS Story/Scene。
5. proof Renderer 静态 import/JSX 使用 `DrawSvgTraceShot`，显式传入 shotFrame；不 import
   Audio/Caption/Narration，也没有 CSS animation/transition。
6. proof package/coverage/registry/Catalog/fidelity receipts 全部 current；修改 proof asset、
   localized source 或 renderer binding 后 evidence check 失败。
7. 独立 proof listing 只有 `M6SceneRuntimeProof`；正常 `npm run compositions` 仍只有原两个
   compositions。
8. 真实 still 在选定 frame 同时证明非透明 Scene pixels 与 Caption/Narrative layering；
   FFprobe/PCM 检查证明 local pulse WAV 被 SoundDesignTrack 挂载，但不是 narration/BGM。

**最小实现步骤：**

1. 扩展 CompositionAssembly 为三个强语义 ReactNode 插槽；不加入 `globalVisualLayers`，不
   建立空 track object。
2. synthetic proof 的 VisualStyle、Catalog asset、task、plans、selection、localization、
   fidelity、package、coverage 和 registry 全部用前面 Tasks 的正式 domain/generator 生成，
   禁止手写 fingerprint。proof 使用固定的 proof-root adapter 输出到
   `src/remotion/proofs/m6-scene-runtime/`；生产 CLI 仍只允许
   `src/projects/<story>/scenes/<meaningId>/`，并由测试证明两种 adapter 对相同输入生成同一
   closure/receipt identity。
3. 将 `draw-svg-trace` 最小 demo 适配为 `DrawSvgTraceShot({shotFrame})`：保留 pathLength、
   40f trace、close flash、content handoff 和 settle 的关键运动语法；替换上游品牌/占位内容
   为 proof shape，并保存 changed-file notice/Apache attribution。
4. `proof-pulse.wav` 为项目内生成的短 PCM 测试音，manifest 标记 project-authored/verified；
   只在 Scene local cue 使用，不当作 BGM。
5. 独立 `Root.tsx/index.ts` 只注册 proof Composition；package scripts 对该 entry 执行
   compositions、still 与 evidence，输出写 `out/m6-scene-runtime-proof/`，不进入
   ProjectRegistry。
6. evidence receipt 绑定 still、可选短 preview、audio stream、package、registry、fidelity 和
   projection fingerprints；human evidence 明确它是 synthetic foundation proof，不是正式
   Story Scene。

**聚焦验证：**

```bash
node --import tsx --test tests/runtime/composition-assembly.test.tsx tests/projects/gps-relativity-composition.test.tsx tests/runtime/m6-scene-runtime-proof.test.tsx tests/m6-proof/evidence.test.ts
npm run catalog:check
npm run m6:proof:compositions
npm run m6:proof:still
npm run m6:proof:evidence
npm run compositions
```

**完成门槛：** synthetic proof 真实渲染，visual-only Renderer、scene-only audio、exact fidelity、
registry 和 assembly 都有 current evidence；正常 GpsRelativity 仍 narrative-only 且 listing/
duration/current AutoCheck 不变。

**Fingerprint / fail-closed：** proof evidence 绑定 Catalog、asset bytes、selection、fidelity、
package、registry、visual/sound projection 和 runtime versions；任何 drift 失败且不重写旧
evidence。GpsRelativity 不因 proof artifact 缺失而失败。

**建议 commit：** `feat(runtime): prove scene visual and local sound assembly`

### Task 14: Add `project:check --level final` mechanical foundation

**目标与边界：** 在保持现有 narrative CLI/report 完全兼容的前提下，增加 final-level 机械
聚合。M6 只验证合同、资源、reference、coverage、package、registry、projection 和 assembly
identity；不实现 NarrativeCheck、SceneVisualCheck 主观判断、FinalPreviewApproval 或 release。

**Files:**

- Create: `src/contracts/final-check.ts`
- Modify: `src/contracts/index.ts`
- Create: `scripts/project-check/final-run.ts`
- Create: `scripts/project-check/final-report-files.ts`
- Modify: `scripts/project-check/project-files.ts`
- Modify: `scripts/project-check/cli.ts`
- Modify: `package.json`
- Create: `tests/contracts/final-check.test.ts`
- Create: `tests/project-check/final-run.test.ts`
- Create: `tests/project-check/final-report-files.test.ts`
- Modify: `tests/project-check/cli.test.ts`
- Modify: `tests/project-check/project-check.test.ts`

**先写失败测试：**

1. 所有现有 narrative exact CLI tests 和 report bytes继续通过；narrative 仍不读取 Catalog/
   Scene/coverage/registry/final report。
2. final 固定 check order：`narrative`、`visual-style`、`resource-catalog`、
   `external-references`、`reference-fidelity`、`scene-coverage`、`scene-packages`、
   `renderer-registry`、`scene-projections`、`composition-assembly`。
3. reference 三态条件：empty 时 `external-references` 与 `reference-fidelity` 都是 current
   `not-applicable`；inspiration-only 必须通过 snapshot/provenance 检查但 fidelity 为
   `not-applicable`；exact 必须同时有 current snapshot 和 pass receipt，不能互相冒充。
4. coverage 每个 Beat 必须 ready 或 explicit fallback；missing/stale 使 final fail。fallback 不
   要求 package/renderer；ready 必须 current package/registry/projection。
5. final report strict、canonical、safe；不保存绝对路径、stack、network URL、Git workspace、
   raw source 或任意 private config。
6. `--write-final-check` 只写 aggregate pass 且 identical bytes/mtime stable；失败不创建、不
   覆盖；默认 final 只读拒绝 missing/malformed/unknown field/byte drift。
7. CLI 只新增两种 exact final forms；narrative+`--write-final-check`、final+`--write-auto-check`、
   reordered/duplicate/extra/path/repair flags 全失败。
8. 当前 GPS `--level narrative` pass；当前 GPS `--level final` 因 coverage 缺失明确 fail，且不
   创建任何 Scene/fallback/final report。synthetic fixture final pass。
9. final source不调用 Agent/skill/MCP/network/Git sync，不运行 localizer，不生成 registry/
   package，不修复 Catalog。

**最小实现步骤：**

1. 保持 `runNarrativeAutoCheck` 与 `NarrativeAutoCheckReport` 不变；final runner 先调用 current
   narrative read-only validation，再聚合 Scene branch。
2. 定义独立 `FinalMechanicalCheckReport`，其 input identity 引用 narrative report fingerprint
   和 M6 分层 identities；不把 final 字段塞进旧 AutoCheck。
3. final project files adapter 只读固定项目 paths；不存在 Scene artifacts 返回固定 safe
   missing failure，不创建目录。
4. `composition-assembly` 检查验证实际项目只有在 ready Scene projection 存在时才装配可选
   slots；全 fallback 可保持 narrative-only。
5. pass-only writer复用现有 atomic/canonical模式，但输出
   `generated/final-mechanical-check.generated.json`；M6 不为 GPS 生成该文件。

**聚焦验证：**

```bash
node --import tsx --test tests/contracts/final-check.test.ts tests/project-check/final-run.test.ts tests/project-check/final-report-files.test.ts tests/project-check/cli.test.ts tests/project-check/project-check.test.ts
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
! npm run project:check -- --project gps-relativity --level final
```

**完成门槛：** narrative behavior/bytes current；synthetic final gate可 pass；GPS final fail 是预期
M7 边界且无写入；final report 只含机械事实，不伪造主观审核/approval。

**Fingerprint / fail-closed：** final fingerprint 覆盖 narrative + M6 identities；任一 current
input drift 使 persisted final stale。缺 Scene 只影响 final，永不传播回 narrative。

**建议 commit：** `feat(check): add final-level scene mechanical gate`

### Task 15: Synchronize authority docs and run the complete M6 gate

**目标与边界：** 在代码、fixtures、proof 和 final gate全部完成后，把 authority docs 从
“M6 目标”同步为可证实的 M6 实现事实，记录 M7 是下一步；不提前写 GPS Scene 或 M8 global
实现，不 push。

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/FINAL_PRODUCT_GOAL.md`
- Modify: `docs/PRODUCTION_WORKFLOW.md`
- Modify: `docs/ITERATION_STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DETERMINISTIC_EXECUTION.md`
- Modify: `docs/TERMINOLOGY.md`
- Modify: `docs/CAPABILITY_CATALOG.md`
- Modify: `docs/REVIEW_MODEL.md`
- Modify: `docs/evidence/2026-08-02-m6-scene-runtime-foundation.md`
- Create: `scripts/docs/check-links.ts`
- Create: `tests/docs/check-links.test.ts`
- Modify: `package.json`

**先写失败检查：**

1. 搜索 authority docs 中把 M5 写成待审、把 M6 写成未开始、把 final 写成完全不存在的 stale
   wording；只在实现证据齐全后更新。
2. 搜索任何把 synthetic proof 说成 GPS 正式 Scene、把 fixture 说成整仓 vendoring、把
   inspiration/empty 说成 exact pass、把 Scene local sound 说成 global sound 的错误表述。
3. 搜索 GPS 下新增的 `visual-style.json`、`scenes/`、`scene-coverage`、renderer registry、
   final report；M6 完成时这些仍不应存在。
4. 搜索 runtime source 的 Agent/skill/MCP/network/Git/fs scan、上游 import、CSS animation/
   transition、Narration/Caption ownership 违规。
5. 先写 docs link checker tests：local relative file/anchor current 通过，missing file、missing
   anchor、仓库外 escape 失败；HTTP(S) 只识别为外部链接并跳过，不联网。

**最小实现步骤：**

1. 状态文档只宣称通过测试/真实 proof 支持的 M6 foundation；明确 NarrativeCheck 与 M7/M8
   仍未完成。
2. Roadmap 将 M6 标记完成、M7 标记唯一下一步；M7 才制作 GPS 5 个 formal ScenePackage。
3. CapabilityCatalog 文档列出实际 descriptor/generator/query/allowed-use/license 行为；
   Reference docs列出 single frozen fixture与 authoring/runtime boundary。
4. Deterministic Execution列出 final check IDs、fingerprint、registry/projection runtime版本与
   failure semantics；Review Model保持主观 Scene checks 未由M6自动实现。
5. README 写入准确命令；不写未实现 network publish、global sound 或 Agent skill。
6. 实现只读 `docs:check-links`：扫描 tracked Markdown、本地相对 target 与 heading anchor，稳定
   输出；不写文件、不联网、不跟随仓库外路径，并加入 `npm run check`。

**聚焦验证与完整 gate：**

```bash
npm exec prettier -- --check "README.md" "AGENTS.md" "docs/**/*.md"
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run catalog:check
npm run registry:check
npm run build
npm run compositions
npm run m6:proof:compositions
npm run m6:proof:evidence
env -u RSP_VOXCPM_PRIVATE_CONFIG npm run project:check -- --project gps-relativity --level narrative
git diff --check
```

**完成门槛：** 全量 gate通过；normal compositions仍是原两个 Story/system entries；独立 M6
proof通过；GPS narrative current、GPS final仍因M7缺失而预期失败；status/docs无目标冒充实现；
worktree没有 secret、临时 reference workspace、preview output或未列文件。

**Fingerprint / fail-closed：** docs不参与 runtime fingerprint，但证据文档必须引用 current
receipt/checksum；任何完整 gate失败都不能标记M6完成，不能开始M7。

**建议 commit：** `docs: close m6 scene runtime foundation`

## 9. Task dependency and commit order

```text
Task 1  scene/style primitives
  ↓
Task 2  ResourceCatalog policy
  ↓
Task 3  Catalog generation/query
  ↓
Task 4  immutable snapshot + resolver fixture
  ↓
Task 5  recipe states + localization
  ↓
Task 6  fidelity gate
  ↓
Task 7  Scene task/plans
  ↓
Task 8  package/coverage
  ↓
Task 9  invalidation matrix
  ↓
Task 10 RendererRegistry
  ↓
Task 11 visual runtime
  ↓
Task 12 local sound runtime
  ↓
Task 13 assembly + synthetic proof
  ↓
Task 14 final mechanical gate
  ↓
Task 15 docs + full validation
```

每个 Task 一个建议小步 commit；提交前只 stage Task 列出的文件并核对 staged diff。Task 内
如果红测试暴露计划文件名或接口不成立，应先最小修订本计划/authority docs并说明原因，不能
悄悄扩大到 M7/M8。完成 Task 15 后停止，不 push。

## 10. M6 completion checklist

- [ ] VisualStyleSpec 与 Scene/Shot/local-frame primitives strict、versioned、fingerprinted；
- [ ] ResourceCatalog 覆盖 asset/style/capability/authoring-reference，生成/query/drift current；
- [ ] allowed-use、checksum、逐资产 license/attribution 和 blocked policy fail closed；
- [ ] ExternalReferenceSnapshot只接受immutable full commit并绑定canonical index/fingerprint；
- [ ] `draw-svg-trace` card/style/card/demo/preview唯一准确解析；
- [ ] exact fixture只本地化最小依赖闭包，无上游 runtime/package/global-skill/remote import；
- [ ] ShotRecipeSelection exact/inspiration/empty三态互斥且empty合法；
- [ ] ReferenceFidelityReceipt绑定lineage/demo/local hashes/real binding/paired evidence/normal speed；
- [ ] SceneTaskInput、VisualPlan、ShotPlan、Anchor、SoundPlan strict且固定Beat窗口；
- [ ] ScenePackage/CoverageMap pass-only、byte-stable并完成精确失效矩阵；
- [ ] composition-local RendererRegistry literal static binding且unknown ID fail closed；
- [ ] SceneRenderer visual-only，Scene audio runtime scene-only；
- [ ] StoryVisualTrack 与 SoundDesignTrack从同一批 ScenePackage真实投影；
- [ ] CompositionAssembly只在真实synthetic Scene输入存在时增加明确slots；
- [ ] `project:check --level final`机械基础完成，narrative行为不变；
- [ ] synthetic Scene真实listing/still/evidence通过；
- [ ] GPS 5个formal ScenePackage不存在，M7/M8未开始；
- [ ] authority docs、README、evidence与真实命令一致；
- [ ] tests/typecheck/lint/catalog/registry/build/compositions/proof/narrative/diff全部通过；
- [ ] 无Docker、无新依赖、无secret、无commit遗漏、无push。

## 11. Failure recovery

- Catalog生成失败：修正authority source或descriptor；旧generated Catalog保持不变，不让
  runtime临时扫描目录。
- reference sync/resolver失败：保留旧immutable snapshot；不追踪branch/tag、不改用card名
  猜demo、不自动降级exact。
- localization失败：删除/舍弃未promote的临时workspace；已存在不同bytes的Scene-local文件
  保留并报告冲突，不覆盖Agent工作。
- fidelity失败：package保持缺失/stale；修复binding/evidence/review/license后重新生成，不手写
  pass receipt。
- package/registry生成失败：保留最后current receipt/registry；Narrative Baseline继续独立运行。
- proof render失败：M6不能完成；不得用静态React单测替代真实Remotion proof。
- GPS final失败：M6阶段预期，因为M7未制作formal Scenes；只要failure reason精确且narrative
  仍pass，不将其当M6 blocker，也不自动创建fallback。
- narrative gate失败：这是M1–M4真实 blocker；停止Scene分支，先恢复受保护权威，不能用M6
  代码遮盖。

## 12. Planning-only stop condition

本文档完成并通过docs验证后，本轮必须停止。不得创建或修改任何本计划列出的TypeScript、
测试、runtime、Scene、asset、fixture或generated artifact；不得运行reference sync/localize；
不得commit或push。只有用户后续明确批准本M6计划，才从Task 1开始TDD执行。
