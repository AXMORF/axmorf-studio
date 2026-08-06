# Scene 内容边界与生产前 Preflight 优化实施计划

> **归档状态：** 该计划后续已实现并经本地提交收口；本文仅保留实施时的历史设计与任务
> 拆分，不再代表当前目录、文件路径或实现状态。当前事实以权威文档和可执行代码为准。
>
> **实施方式：** 后续获得批准后，在当前主对话按 Task 1–Task 9 执行。每个 Task 都遵循
> Red → 最小 Green → 聚焦验证 → 精确 staging → 独立本地 commit；不使用 `git add .`，不 push。
>
> **本计划唯一成功边界：** 三项通用优化实现并通过机械验证；不创建新作品批准，不进入
> NarrativeCheck、审美 gate、promotion、M10、发布或 push。

## 1. 当前 repo truth

### 1.1 仓库与保护基线

- `/data/projects/repos/remotion-story-producer` 与
  `/home/zzzxc/projects/repos/remotion-story-producer` 解析到同一工作树；实施统一使用前者。
- 当前 branch：`codex/foundation`。
- 当前 HEAD：`31645b2f806c0624ce5af50a063b5903c778e040`，最近提交为
  `feat(production): add algorithm model AI system preview`。
- 当前已有、不得覆盖或清理的用户修改：

```text
 M src/remotion/runtime/story-visual/SceneSlot.tsx
?? public/voice_profile/
```

- `SceneSlot.tsx` 的现有 diff 只是 import 空行和错误消息格式变化，但它仍属于用户未提交修改；
  后续 Task 5 必须在当前 bytes 上做最小增量，不能 checkout、reset 或恢复该文件。
- `public/voice_profile/` 只作为受保护目录状态项记录。计划编写和后续 baseline/closeout 不递归
  枚举、不读取内容、不计算内容 checksum、不移动、不删除、不 stage、不 commit。
- GPS 与 ProductComicVertical 的十个正式保护产物继续沿用现有 E2E 保护清单：

```text
src/projects/gps-relativity/generated/final-assembly.generated.json
src/projects/gps-relativity/generated/final-mechanical-check.generated.json
src/projects/gps-relativity/generated/final-preview-approval.generated.json
src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json
out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4
src/projects/product-comic-vertical/generated/final-assembly.generated.json
src/projects/product-comic-vertical/generated/final-mechanical-check.generated.json
src/projects/product-comic-vertical/generated/final-preview-approval.generated.json
src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json
out/m9-product-comic-vertical/product-comic-vertical-final-preview.mp4
```

### 1.2 已实现基础

当前 M9.5 与后续 readability hardening 已实现：

- `ProductionRequirementsFreeze` v1/v2 union；新 Run 当前只接受 v2；
- `production-readability-v1` 在 v2 freeze 中冻结唯一的
  `sceneContentSafeAreaPx`、`captionSafeAreaPx`、Scene 最小字号、字幕字号与字幕预算；
- v2 `SceneTaskInput`、`SceneAssignment`、`ScenePackage`、`SceneProductionResult` 把同一
  readability policy/fingerprint 传到 submit、watcher 与 post-Scene 复检；
- `SceneBackground`、`SceneContentFrame`、`SceneText`、`SceneSvgText`；
- `readability-source-validator.ts` 对完整 Renderer source graph 做静态文字、缩放、
  CaptionLayer 与安全框检查；
- `production:start/status/narrative/scene-freeze/scene-submit/scene-fail/watch/preview-check`
  exact CLI；
- append-only events、immutable Scene results、generated state projection 与 central
  single-writer store；
- 旧 v1 artifacts 与正式视频不迁移、不回填；M9.5 Preview 仍明确无 GlobalSoundPlan、BGM、
  跨 Scene ambience、ducking 和 GlobalVisualLayers。

### 1.3 当前三个缺口

#### 缺口 A：Scene 自己承担了共享边界

当前 `SceneSlot` 只负责 Beat `<Sequence>` 和 Renderer 挂载。v2 Renderer 被 validator 强制要求
根节点恰好包含一份 `SceneBackground` 和一份 `SceneContentFrame`，并把
`readabilityPolicy` prop 直接交给 `SceneContentFrame`。因此：

- 每个 Scene 都复制安全框与背景 root；
- Scene source 同时承担语义内容、全屏背景和安全区责任；
- validator 只能靠“每 Scene 自己画正确外壳”证明安全区；
- 项目级背景、纹理、非语义装饰和连续性 motif 没有 M9.5 固定外壳；
- 当前 `SceneText` 已足以统一检查最小字号，无需另造第二个字号 policy，但它只能在
  `SceneContentFrame` context 内使用。

#### 缺口 B：VoxCPM 失败发生在 Run 之后

`runProductionStart()` 当前顺序是：读取 current requirements → readability 检查 → 写/检查
Composition scaffold → 创建 `run.json` / state / 首事件。它不检查 private config、loopback、
当前进程网络权限、服务可达性或选定 voice profile。

`production:narrative` 进入 `narrative-running` 并获得 Run lock 后，才通过 narration CLI 解析
`RSP_VOXCPM_PRIVATE_CONFIG`/默认 `voxcpm/voxcpm.private.json`、读取 private config、解析 profile
并创建 VoxCPM client。配置、权限或服务问题因此会把一个本可在 Run 前发现的外部 blocker
记录成 terminal narrative failure。

#### 缺口 C：Chromium 失败也发生在 Run 之后

当前 browser 首次真实启动发生在 `production:narrative` 的 Remotion compositions/listing 或
Baseline still/render；post-Scene watcher 之后还会再次调用 compositions/render/still。生产过程
统一经 `runProductionMediaProcess` spawn Remotion CLI，但 compositions 参数在 narrative 和
post-scene 两处仍是重复字面量。

仓库已有真实历史：受限环境会以 `sandbox_host_linux.cc: Operation not permitted` 失败。这类
错误当前只会在 Run 已创建后出现，且通用 non-zero 断言不能稳定区分 external browser
environment blocker 与 Scene 问题或 fixed-flow defect。

### 1.4 老项目 VoxCPM 合同核对结果

为消除 health/readiness 语义的不确定性，本计划只读核对了老项目
`/data/projects/labs/ai-video-studio` 的当前 Agent Producer skill、narration reference、VoxCPM
provider 文档与它所使用的本机 `/data/projects/labs/voxcpm-api` 非私有 API 源码。可复用的服务
事实是：

- `GET /health` 是进程 liveness，当前固定成功响应为 HTTP 200 + `{"status":"ok"}`；
- `GET /ready` 只表示模型是否已驻留 GPU；ready 时 HTTP 200 + `ready: true`；
- 模型空闲卸载后，`GET /ready` 可返回 HTTP 503，FastAPI body 的安全判别字段为
  `detail.ready: false`、`detail.status: "loading"`；这不是生产 blocker；
- `/tts`、`/clone`、`/clone_with_prompt` 都在首个真实生成请求内调用 `ensure_ready()`，空闲卸载
  时同步重新装载模型；preflight 不应为此发送预热 TTS；
- `GET /ready` 的 HTTP 500 表示已有 model load failure，body 可能包含内部错误/路径，必须只按
  status 分类，不能输出 raw body。

这些事实只用于冻结 probe route 与安全状态机，不把老项目的 LAN endpoint、Docker wrapper、
私有 voice path、按标点切分或其他 narration 规则带入本仓库。本仓库的 loopback-only、宿主机
Node/Remotion、已创作 `ttsChunks` 与现有 private config/narrative client 仍是唯一实施权威。

## 2. 目标状态

### 2.1 新生产固定顺序

```text
current authored inputs + ProductionRequirementsFreeze v3
  → read-only ProductionStartPreflight v1
      → VoxCPM private config/profile/loopback/access preflight
      → Remotion Chromium real-launch preflight
  → project scaffold
  → create immutable ProductionRun
  → production:narrative
  → VisualStyleSpec + project-local VisualShell + Scene freeze
  → Scene Renderer semantic content only
  → SceneSlot-owned SceneSafeArea
  → VisualShell + StoryVisualTrack + CaptionLayer assembly
  → existing mechanical Preview path
```

preflight 任一失败时：不写 scaffold、不创建 `.producer-runs/<runId>`、不调用 TTS、不生成候选
音频、不进入 Scene 制作。成功也不形成作品 authority 或长期 persisted receipt；Run 的存在只
证明 start 在该时点完成了强制 preflight 顺序。

### 2.2 新视觉责任

```text
Composition / project-local Preview scaffold
├── VisualShell                         全屏背景、纹理、非语义装饰、连续性 motif
│   └── StoryVisualTrack
│       └── SceneSlot / fixed Beat Sequence
│           └── SceneSafeArea(policy)   唯一消费冻结 Scene safe-area geometry
│               └── Scene Renderer      当前 StoryBeat 的语义内容
├── NarrativeCore
│   └── CaptionLayer(policy)            唯一顶层字幕权威
└── SoundDesignTrack                    既有 Scene-local sound；非视觉
```

固定视觉层次为：`VisualShell background/decor → Scene semantic content → CaptionLayer`。
`VisualShell` 与 `StoryVisualTrack` 共同占用现有 `storyVisualTrack` 聚合槽，不新增第五个
CompositionAssembly 万能槽，也不冒充 `GlobalVisualLayers` enhancement。

## 3. Hard boundary 与非目标

### 3.1 SceneSafeArea 的唯一权威

- `production-readability-v1` 保持不变，继续是几何与字号唯一权威。
- `SceneSafeArea` 直接接收并 parse 当前 `ProductionRequirementsFreeze`/`SceneAssignment` 已冻结的
  `ProductionReadabilityPolicy`；只读取 `sceneContentSafeAreaPx` 和同一 policy fingerprint。
- 不向 SceneVisualPlan、VisualStyleSpec、ScenePackage、VisualShell 或 Renderer 增加第二组
  top/right/bottom/left、安全比例、默认 inset 或字号常量。
- requirements v3 新增的只是责任声明 literal，不包含任何安全区数值：

```text
sceneCompositionBoundaryVersion = "scene-composition-boundary-v1"
sceneSafeAreaOwner              = "composition"
visualShellOwner                = "project"
captionOwner                    = "caption-layer"
```

- `SceneText`/`SceneSvgText` 复用现有 readability context 与冻结最小字号；不新增另一套字号
  resolver。普通 HTML/SVG text 仍允许，但必须由 source validator 静态证明达到同一最小字号。

### 3.2 Scene Renderer 的新边界

新 v3 Renderer：

- 只负责当前 StoryBeat/meaningId 的语义视觉、Shot、局部运动与已批准 Scene 视觉资源；
- 不 import/render `SceneSafeArea`、`SceneContentFrame`、`SceneBackground`、`VisualShell`、
  `CaptionLayer`、旁白、任意音频或 GlobalVisualLayers；
- 不读取或重算 readability policy，不声明安全区 inset；
- 可以使用 `SceneText`/`SceneSvgText`，因为 context 由外部 `SceneSafeArea` 提供；
- 不得用 transform/scale、相对字号、继承字号或动态不可证明字号绕过最小字号。

v1/v2 Renderer 保持原 parser/runtime/check 路径，不批量重写、不自动替换本地安全框。

### 3.3 VisualShell 的固定边界

- 每个 v3 project 在 Scene freeze 前由主 Agent 写一个静态、project-local、literal-imported
  `src/projects/<storyId>/visual-shell/VisualShell.tsx`。
- 它只拥有全屏背景、纹理、非语义装饰和贯穿全片的连续性 motif；可用 Remotion frame API，
  可静态 import 同目录辅助组件和已批准本地资产。
- 它不得包含可见文字、字幕、StoryBeat 语义内容、Scene/Shot 选择、音频、网络、Git、Agent、
  skill、MCP、目录扫描、动态 import、任意 module path、CSS animation/transition。
- 它不消费或产生 safe-area geometry；不能包办 Scene 内容布局。
- 它没有独立 global plan/projection，不进入 `enhancements.globalVisualLayers`，Preview 仍明确
  `globalVisualLayers: absent`。
- 它不扩张为 Track、Scene DSL、自动布局器、自动导演、theme engine 或 capability promotion。
- 主 Agent 是 VisualShell authoring owner；Scene Agent 没有该目录写权限。Scene freeze 把
  shell source-graph fingerprint 绑定进 v3 task/assignment；freeze 后 drift 使所有相关 Scene
  和 Preview fail closed。

### 3.4 Preflight 安全边界

- `production:preflight -- --project <storyId>` 是新增 exact、read-only CLI；
  `production:start` 必须调用同一个函数，不能有两套实现。
- preflight 不发送任何带 `ttsText`、reference audio、prompt audio/text 或 clone form 的请求；
  不产生音频，不进入 `.narration-work`。
- private config 的路径选择与 `production:narrative` 完全共享：环境变量非空时使用绝对覆盖，
  否则使用 repo 默认路径。解析继续使用同一 strict schema。
- 成功/失败 stdout/stderr 不包含 URL、endpoint、token、绝对路径、private config bytes、
  reference/prompt 内容或 `public/voice_profile/` 内容。
- 若选定 profile 的 protected source path 指向仓库 `public/voice_profile/`，preflight 在任何
  `readFile`/checksum/normalize 前 fail closed；不得为了“检查”而打开该文件。
- provider 只允许解析后确认为 loopback 的地址；不访问公网、不跟随到非 loopback 的 redirect。
- VoxCPM 模型允许在长期无调用后自动卸载。preflight 固定先以 `GET /health` 检查服务进程与
  当前环境访问权限，再以 `GET /ready` 区分 resident、cold/loading 和已知 load failure；它不
  要求模型已驻留，也不把可识别的 cold/loading 判成 blocker。
- 两个 GET 都是 non-generative probe，不触发模型装载；模型只在 `production:narrative` 的首个
  真实 TTS 请求中按现有服务行为自动装载。preflight 不发送 warm-up text、空白 text、
  reference/prompt media 或其他伪装 TTS 请求。
- 不自动重试、不切换 profile/provider、不生成 silence/fallback audio、不复用 sealed narration
  绕过 start gate。
- Chromium preflight 使用正式生产同一 Remotion executable、process adapter、entry point、
  chrome mode/default config 和 compositions 关键参数；不增加 `--no-sandbox`、
  `--disable-web-security`、自定义不受控 executable、容器或 browser fallback。

### 3.5 明确非目标

本计划不包括：

- sealed narration 复用策略或旧旁白替换；
- Scene 批量重提、旧 Renderer 批量改造或旧项目迁移；
- NarrativeCheck、Story/旁白/字幕主观质量审核；
- SceneVisualCheck、SceneSoundCheck 或其他审美 gate；
- GlobalSoundPlan、BGM、跨 Scene ambience、ducking、GlobalVisualLayers enhancement；
- capability promotion、共享提取提案、M10、发布、上传、账号、密钥修改或权限修改；
- 自动重试、自动恢复、假成功、fallback audio、降低 Chromium 安全设置；
- Git push。

## 4. 合同版本与兼容策略

### 4.1 版本矩阵

| 合同/运行时 | 现有 | 新版本 | 新版本增加内容 |
| --- | --- | --- | --- |
| ProductionRequirementsFreeze | v1/v2 | v3 | 固定 boundary ownership literals；继续内嵌同一 readability v1 policy |
| ProductionReadabilityPolicy | v1 | 不升级 | 安全区/字号唯一数值权威保持原 fingerprint |
| ProductionStartPreflight | 无 | v1 | transient pass/failure、安全检查 ID 与 safe classification |
| SceneTaskInput | v1/v2 | v3 | boundary version、VisualShell source-graph fingerprint；readability policy 原样传播 |
| SceneAssignment | v1/v2 | v3 | v3 task、同一 policy、shell fingerprint 与 requirements identity |
| ScenePackage | v1/v2 | v3 | v3 task identity、shell/boundary identity、story-visual-runtime-v2 |
| SceneProductionResult | v1/v2 | v3 | v3 assignment/package/mechanical identity |
| story visual runtime | v1 | v2 | SceneSlot 外部统一 SceneSafeArea |
| ProductionPreviewAssembly | v1 | v2 | VisualShell source graph、boundary version、v2 layer order；GlobalVisualLayers 仍 absent |
| PreviewEvidence / MechanicalCheck | v1 | 保持 v1 | 已绑定 assembly fingerprint；只扩展固定 check ID 时才升级，不因字段重复升级 |

### 4.2 兼容规则

1. `ProductionRequirementsFreezeSchema`、Scene contracts 与 PreviewAssembly schema 保留旧版本
   union parser；不能给旧 JSON 注入默认字段。
2. `buildProductionRequirementsFreeze()` 改为只生成 v3；保留显式 v1/v2 builders 仅用于旧
   identity 重算和测试。
3. 代码合入之后，`production:start` 只接受 v3 requirements。v1/v2 requirements 仍可读取、
   check，并允许已存在的 immutable v1/v2 Run 沿原 narrative/Scene/watcher 路径完成或复查。
4. v1/v2 Composition scaffold、Renderer safe frame、ScenePackage、result、PreviewAssembly 与
   正式视频 bytes 不迁移、不重写、不重新 fingerprint。
5. v3 Scene freeze 只创建 v3 task/assignment；v3 submit 只接受 v3 package/result，不跨版本
   拼装。
6. `production-readability-v1` fingerprint 不因 ownership 重排改变；boundary/shell 变化通过
   v3 task/package/assembly identity 单独失效，不污染安全区数值权威。
7. `SceneRendererProps.readabilityPolicy` 为 v1/v2 compatibility 暂时保留为 deprecated optional；
   v3 generated runtime 不把它传给 Renderer。v3 source validator 禁止 Renderer 读取该 prop。

## 5. 失败分类与 single-writer 边界

### 5.1 Preflight failure contract

新增 strict `production-start-preflight-v1` transient contract：

```text
status: "pass" | "failed"
domain: "voxcpm" | "remotion-browser"
kind: "external-blocker" | "fixed-flow-defect"
code:
  VOXCPM_PRIVATE_CONFIG_UNAVAILABLE
  VOXCPM_PROVIDER_NOT_LOOPBACK
  VOXCPM_PROFILE_UNAVAILABLE
  VOXCPM_PROFILE_PROTECTED
  VOXCPM_SERVICE_UNREACHABLE
  VOXCPM_ENVIRONMENT_PERMISSION_DENIED
  VOXCPM_HEALTH_RESPONSE_UNRECOGNIZED
  VOXCPM_READINESS_RESPONSE_UNRECOGNIZED
  VOXCPM_MODEL_LOAD_FAILED
  REMOTION_BROWSER_UNAVAILABLE
  REMOTION_BROWSER_PERMISSION_DENIED
  REMOTION_BROWSER_SANDBOX_DENIED
  REMOTION_PREFLIGHT_FAILED
summary/remediation: bounded safe text
requirementsFingerprint: safe current identity
redactionApplied: boolean
```

- private config/profile/loopback/service/OS permission、无法识别的 health/readiness response、
  已知 VoxCPM model load failure 与 browser binary/sandbox/OS permission 问题是
  `external-blocker`；`retryable` 不进入合同，避免暗示自动重试。已识别的
  `cold/unloaded + auto-load-on-first-tts` 是 pass state，不创建 failure code。
- exact process adapter、argument construction 或分类器在 valid fixture 上出错是
  `fixed-flow-defect`。
- `sandbox_host_linux.cc`、`Operation not permitted`、`Failed to move to new namespace` 等已知
  Chromium sandbox/namespace pattern 必须映射为 `REMOTION_BROWSER_SANDBOX_DENIED`，不能映射为
  Scene、post-scene 或 generic narrative failure。
- 未识别的 Remotion non-zero 先以 safe `REMOTION_PREFLIGHT_FAILED / fixed-flow-defect` 失败，
  不把 raw stderr/stack 持久化或原样打印。

### 5.2 为什么不扩展 ProductionRunState

preflight 发生在 Run 创建前，因此不新增 `preflight-running` state、不追加 event、不生成失败
Run，也不把 transient service/browser 可用性写入作品 fingerprint。`ProductionError` v1 继续只
描述已存在 Run 的 stage failure；preflight 使用独立 transient contract，避免伪造 runId、
previous-state fingerprint 或第二套 ledger。

### 5.3 单写者与文件所有权

- `production:start` 顺序固定为：read-only inputs → read-only preflight → scaffold →
  `initializeProductionRunStore`。只有最后两步可能写文件；preflight 本身零写入。
- central run-store 仍是 events/state 唯一 writer；Scene Agent 仍只通过 submit/fail 产生自己的
  immutable result。
- 主 Agent 独占 `visual-style.json`、`visual-shell/`、resource pool、Scene brief 和中央生成步骤；
  Scene Agent 只写 assignment 指定的 meaning-local Scene/source/public 路径。
- `SceneSafeArea` 和 validators 是共享 runtime/checker 代码，不是新的状态 writer。
- VisualShell source-graph 只在固定 production/validation 步骤收集；Remotion runtime 只通过
  literal static import 使用它，不扫描目录。

## 6. 精确文件范围

### 6.1 新增文件

```text
src/contracts/production-preflight.ts
src/remotion/runtime/readability/SceneSafeArea.tsx
scripts/production/preflight.ts
scripts/production/adapters/voxcpm-preflight.ts
scripts/production/adapters/remotion-process.ts
scripts/production/visual-shell-source-validator.ts
tests/production/preflight.test.ts
tests/production/visual-shell.test.ts
tests/runtime/scene-safe-area.test.tsx
```

每个新 v3 project 在后续真实生产中另由主 Agent创建，implementation commit 本身不向 GPS、
ProductComicVertical 或现有 trial 写入：

```text
src/projects/<new-v3-story>/visual-shell/VisualShell.tsx
src/projects/<new-v3-story>/visual-shell/<optional-static-helper>.tsx
```

### 6.2 修改文件

```text
src/contracts/index.ts
src/contracts/production-requirements.ts
src/contracts/scene-task.ts
src/contracts/scene-package.ts
src/contracts/production-scene-result.ts
src/contracts/production-preview.ts

scripts/narration/cli.ts
scripts/narration/adapters/private-config.ts

scripts/production/cli.ts
scripts/production/start.ts
scripts/production/narrative.ts
scripts/production/scene-freeze.ts
scripts/production/scene-submit.ts
scripts/production/watch.ts
scripts/production/post-scene-default.ts
scripts/production/project-scaffold.ts
scripts/production/readability-validator.ts
scripts/production/readability-source-validator.ts

scripts/scene-package/domain.ts

src/remotion/runtime/readability/index.ts
src/remotion/runtime/readability/SceneReadability.tsx
src/remotion/runtime/story-visual/types.ts
src/remotion/runtime/story-visual/SceneSlot.tsx

tests/narration/private-config.test.ts
tests/narration/narration-cli.test.ts
tests/production/production-requirements.test.ts
tests/production/start.test.ts
tests/production/cli.test.ts
tests/production/scene-freeze.test.ts
tests/production/scene-submit.test.ts
tests/production/scene-readability.test.ts
tests/production/project-scaffold.test.ts
tests/production/preview-assembly.test.ts
tests/production/preview-fixture.ts
tests/production/post-scene.test.ts
tests/production/orchestration-e2e.test.ts
tests/runtime/story-visual-track.test.tsx

package.json
docs/FINAL_PRODUCT_GOAL.md
docs/PRODUCTION_WORKFLOW.md
docs/ITERATION_STATUS.md
docs/ROADMAP.md
docs/ARCHITECTURE.md
docs/DETERMINISTIC_EXECUTION.md
docs/TERMINOLOGY.md
docs/PRODUCTION_ORCHESTRATION.md
```

### 6.3 明确禁止修改

除上表和新 v3 project 的 future pattern 外，不修改其他文件。尤其禁止修改：

```text
src/projects/gps-relativity/**
src/projects/product-comic-vertical/**
out/m8-gps-final-assembly/**
out/m9-product-comic-vertical/**
public/voice_profile/**
voxcpm/voxcpm.private.json
任意外部 private config 或 voice profile source
```

若实现中发现必须增加文件，先更新本计划的文件范围并重新审阅 hard boundary；不能顺手扩张。

## 7. TDD 实施 Tasks

### Task 1：建立保护基线与 v3 合同 Red

**目标：** 先冻结当前保护事实，再用失败测试明确新生产版本与旧版本兼容。

**修改文件：**

```text
src/contracts/production-requirements.ts
src/contracts/scene-task.ts
src/contracts/scene-package.ts
src/contracts/production-scene-result.ts
src/contracts/production-preview.ts
src/contracts/production-preflight.ts
src/contracts/index.ts
tests/production/production-requirements.test.ts
tests/production/scene-freeze.test.ts
tests/production/scene-submit.test.ts
tests/production/preview-assembly.test.ts
tests/production/preview-fixture.ts
tests/production/preflight.test.ts
scripts/scene-package/domain.ts
```

**保护基线：**

1. 记录 branch、HEAD、`git status --short`、`git diff --name-only`；
2. 计算十个正式 artifact before checksum；
3. 只记录 `public/voice_profile/` 在 porcelain status 中的路径级状态，不进入目录；
4. 保存 `SceneSlot.tsx` 当前 diff checksum，后续确认用户已有修改未丢失；
5. baseline 写入 `/tmp`，不写 repo、不 stage。

**Red：**

- current builder 尚不能生成 requirements v3 ownership literals；
- v3 task/assignment/package/result 不能 parse/bind shell/boundary identities；
- PreviewAssembly v2 不能证明 VisualShell present 且 GlobalVisualLayers absent；
- preflight pass/failure safe contract 尚不存在；
- v1/v2 round-trip bytes/identity compatibility 必须保持 Green，防止以破坏旧版本换取 Red。

**最小 Green：**

- 增加 strict v3/v2 schemas/builders/unions；
- readability policy 继续原样引用，ownership contract 不保存几何；
- PreviewAssembly v2 增加
  `visualShellSourceGraphFingerprint`、`sceneCompositionBoundaryVersion` 和固定 layer order；
- package v3 选择 `story-visual-runtime-v2`，旧 package 仍绑定 v1；
- preflight contract 只允许 safe bounded fields。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/production/production-requirements.test.ts \
  tests/production/scene-freeze.test.ts \
  tests/production/scene-submit.test.ts \
  tests/production/preview-assembly.test.ts \
  tests/production/preflight.test.ts
npm run typecheck
```

**独立 commit：** `feat(production): define v3 scene boundary contracts`

### Task 2：共享 VoxCPM 配置解析与只读 service preflight

**目标：** 让 standalone preflight 与 narrative 使用同一配置选择/schema/profile metadata 边界，
并在不发送 TTS、不读取受保护 profile 内容的前提下检查 loopback、现有 health endpoint 与当前
环境访问能力；模型长期未调用而 cold/unloaded 不阻塞 start。

**修改文件：**

```text
scripts/narration/cli.ts
scripts/narration/adapters/private-config.ts
scripts/production/adapters/voxcpm-preflight.ts
tests/narration/private-config.test.ts
tests/narration/narration-cli.test.ts
tests/production/preflight.test.ts
```

**Red：**

- env override/default path resolver 目前埋在 narration CLI generate branch，production preflight
  不能复用；
- private config schema 当前接受任意 HTTP(S) URL，production preflight 未限制 loopback；
- profile resolve 会读取 reference/prompt bytes，不能用于“不打开受保护内容”的 metadata-only
  preflight；
- network permission/service unavailable 没有 safe external-blocker classification；
- 当前仓库尚无 `/health`/`/ready` strict classifier；若直接要求 ready，会把正常的自动卸载
  误判为 blocker；若接受任意 HTTP 响应，又会把真实服务故障误判为成功；
- 任意 failure message 不能包含 fake URL/token/absolute path/profile contents。

**最小 Green：**

1. 从 narration CLI 抽取并导出单一 `resolveVoxcpmPrivateConfigPath()`；generate 与 preflight
   都调用它；
2. 在 private-config adapter 增加 metadata-only selected-profile resolver：只 parse config、
   查唯一 profile ID/mode、验证路径 shape；不读 reference/prompt bytes；
3. 解析 URL 后只允许 `127.0.0.0/8` 或 `::1`；hostname/redirect 不能把请求导向非 loopback；
4. profile path 若位于 repo `public/voice_profile/`，在 filesystem content access 前返回
   `VOXCPM_PROFILE_PROTECTED`；其他 profile source 只做最小 read-access metadata 检查，
   不读取/normalize/checksum 内容；
5. 使用注入式 probe 从同一 loopback base URL 固定调用 `GET /health` 与 `GET /ready`；route 是
   adapter 单一常量，不扩张 private config schema；沿用同一 token/network boundary、短固定
   timeout，每个 route 至多一次、无 redirect 到非 loopback、无 retry；
6. `/health` 只接受 HTTP 200 + JSON `status: "ok"`；unknown/malformed/non-200 fail closed 为
   `VOXCPM_HEALTH_RESPONSE_UNRECOGNIZED`；
7. `/ready` 只接受 HTTP 200 + `ready: true` 为 `resident-ready`，或 HTTP 503 +
   `detail.ready: false` + `detail.status: "loading"` 为
   `cold-auto-load-on-first-tts`。后者不预热模型，首个真实 TTS 沿现有 narrative 路径自动装载；
   HTTP 500 只分类为 `VOXCPM_MODEL_LOAD_FAILED`，不读取到日志；其他响应 fail closed 为
   `VOXCPM_READINESS_RESPONSE_UNRECOGNIZED`；
8. 只返回 safe check ID、profile match boolean/mode enum、safe service state 和 requirements
   fingerprint；不返回 URL、path、token、raw health body 或 voice content。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/narration/private-config.test.ts \
  tests/narration/narration-cli.test.ts \
  tests/production/preflight.test.ts
npm run typecheck
```

**独立 commit：** `feat(production): add safe voxcpm start preflight`

### Task 3：统一 Remotion process adapter 与 Chromium real-launch preflight

**目标：** compositions/list/render/still 与 start preflight 使用同一个受限 process adapter 和
固定参数来源，可靠分类 Chromium sandbox/permission blocker。

**修改文件：**

```text
scripts/production/adapters/remotion-process.ts
scripts/production/adapters/process-runner.ts
scripts/production/narrative.ts
scripts/production/post-scene-default.ts
scripts/production/preflight.ts
tests/production/preflight.test.ts
tests/production/narrative-runner.test.ts
tests/production/post-scene.test.ts
```

**Red：**

- narrative/post-scene 仍复制 Remotion executable 与 compositions args；
- preflight 没有证明真实 Chromium launch；
- fake stderr 中的 `sandbox_host_linux.cc: Operation not permitted` 尚不能稳定映射为 external
  browser blocker；
- tests 必须拒绝新增 `--no-sandbox`、`--disable-web-security`、任意 alternate executable、
  shell mode 或 fallback args。

**最小 Green：**

1. 增加固定 `resolveProductionRemotionCommand(rootDir)` 与 compositions/render/still args builders；
2. compositions 固定为正式 entry `src/index.ts` 和 `--log=error`，narrative、post-scene、preflight
   共用；render/still 保持现有 codec/output 参数；
3. preflight 真实 spawn 与正式 compositions 相同命令，要求进程成功并实际完成 browser-backed
   Composition listing；不写 project scaffold 或 run；
4. 先对 bounded stderr/stdout 做 in-process classification，再经过现有 redaction；
5. known sandbox/namespace/permission patterns → external blocker；未知 non-zero → safe fixed-flow
   defect；spawn ENOENT → browser/executable external blocker；
6. 不保存 raw process output，不把它拼入 stdout/stderr JSON。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/production/preflight.test.ts \
  tests/production/narrative-runner.test.ts \
  tests/production/post-scene.test.ts
npm run typecheck
```

**独立 commit：** `feat(production): preflight remotion browser environment`

### Task 4：把 preflight 接到 exact CLI 与 Run-before-write gate

**目标：** 提供 read-only `production:preflight`，并确保 `production:start` 在任何 scaffold/run
写入前强制运行同一逻辑。

**修改文件：**

```text
scripts/production/preflight.ts
scripts/production/start.ts
scripts/production/cli.ts
package.json
tests/production/preflight.test.ts
tests/production/start.test.ts
tests/production/cli.test.ts
tests/production/error-redaction.test.ts
```

**Red：**

- exact preflight CLI 缺失；
- start fixture 必须证明调用顺序是 inputs → VoxCPM → Chromium → scaffold → run store；
- 任一 preflight failure 后 `.producer-runs/<runId>`、Composition scaffold、`.narration-work` 均
  不存在，provider TTS call count 为 0；
- external blocker 必须 safe non-zero，不写 stdout success JSON；
- v2 requirements start 必须被 v3 gate 拒绝，但 standalone preflight 可对旧 current project
  做只读环境诊断，不迁移它。

**最小 Green：**

1. exact CLI：`npm run production:preflight -- --project <storyId>`；
2. `runProductionPreflight()` 接受注入式 VoxCPM/browser dependencies，聚合固定 check order；
3. `runProductionStart()` 在 `ensureProductionProjectScaffold()` 前 await 同一 preflight；
4. preflight success 返回 safe transient JSON；failure 输出 canonical safe failure 到 stderr 并
   非零退出；
5. start 只有在两项 pass 后才生成 runId/clock、写 scaffold、初始化 store；
6. 不向 ProductionRun manifest/event/state 增加 transient health 字段。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/production/preflight.test.ts \
  tests/production/start.test.ts \
  tests/production/cli.test.ts \
  tests/production/error-redaction.test.ts
npm run typecheck
```

**独立 commit：** `feat(production): gate run creation on fixed preflight`

### Task 5：新增通用 SceneSafeArea 并迁移新 runtime ownership

**目标：** v3 Scene 由 `SceneSlot` 在 Renderer 外统一包裹安全区；保留 v1/v2 runtime 行为。

**修改文件：**

```text
src/remotion/runtime/readability/SceneSafeArea.tsx
src/remotion/runtime/readability/SceneReadability.tsx
src/remotion/runtime/readability/index.ts
src/remotion/runtime/story-visual/types.ts
src/remotion/runtime/story-visual/SceneSlot.tsx
tests/runtime/scene-safe-area.test.tsx
tests/runtime/story-visual-track.test.tsx
```

**Red：**

- v3 `SceneSlot` 尚未渲染 exactly one `SceneSafeArea`；
- `SceneSafeArea` 必须 parse full frozen policy、验证 fingerprint/dimensions，并直接使用
  `sceneContentSafeAreaPx`；
- `SceneText`/`SceneSvgText` 在外部 wrapper context 中必须正确 enforce 同一最小字号；
- v3 Renderer 不能接收 readability policy prop；
- v1/v2 `SceneContentFrame` output 与既有 tests 保持不变；
- 用户当前 `SceneSlot.tsx` 格式 diff 必须保留。

**最小 Green：**

1. `SceneSafeArea` 只实现 context provider + absolute inset/overflow；不算比例、不提供 layout；
2. `SceneSlot` 根据显式 `sceneBoundaryVersion` 分支：v3 composition-owned wrapper；legacy 原样
   mount Renderer；
3. v3 generated props 持有 policy 供 SceneSlot 使用，但传给 Renderer 前剥离 policy/boundary
   internal props；
4. 保留 `SceneContentFrame`/`SceneBackground` export 供旧 Renderer；标注 legacy，不删除；
5. runtime tests 验证 Beat Sequence、wrapper 数量、policy fingerprint、文字 context 与无字幕/
   audio/network/animation。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/runtime/scene-safe-area.test.tsx \
  tests/runtime/story-visual-track.test.tsx
npm run typecheck
npm run lint -- --quiet
```

**独立 commit：** `feat(runtime): wrap v3 scenes in shared safe area`

### Task 6：建立 project-local VisualShell 与新 scaffold/assembly

**目标：** 新 v3 production 用一次 literal project-local VisualShell 包住 StoryVisualTrack，
不新增 GlobalVisualLayers enhancement 或 runtime scan。

**修改文件：**

```text
scripts/production/visual-shell-source-validator.ts
scripts/production/project-scaffold.ts
scripts/production/scene-freeze.ts
scripts/production/post-scene-default.ts
src/contracts/production-preview.ts
tests/production/visual-shell.test.ts
tests/production/project-scaffold.test.ts
tests/production/scene-freeze.test.ts
tests/production/preview-assembly.test.ts
tests/production/post-scene.test.ts
```

**Red：**

- v3 scene-freeze 在 shell 缺失、symlink、跨 project import、可见文字、CaptionLayer、Scene DSL、
  audio/network/fs/dynamic import/CSS animation 时必须 fail closed；
- generated Preview Composition 必须用字面量 import
  `./visual-shell/VisualShell`，exactly once 包住 StoryVisualTrack；
- shell 必须位于 Scene 下、CaptionLayer 下；
- PreviewAssembly v2 必须绑定 shell source graph 与 boundary version，同时仍声明
  `globalVisualLayers: absent`；
- v1/v2 scaffold bytes/parser 不改。

**最小 Green：**

1. validator 只在固定 authoring/check step 收集 project-local static source graph；
2. shell source graph 只允许 `visual-shell/` 与已批准共享能力/本地 asset imports，禁止跨 Scene；
3. `scene-freeze` v3 先验证 shell 并把 fingerprint 写入 task/assignment；
4. v3 generated runtime 静态 import shell，不读取 JSON module path、不 `readdir`/glob；
5. post-scene 再验证 current shell fingerprint，写 PreviewAssembly v2；
6. VisualShell 不添加到 CompositionAssembly props；它只组合在已有 `storyVisualTrack` node 内。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/production/visual-shell.test.ts \
  tests/production/project-scaffold.test.ts \
  tests/production/scene-freeze.test.ts \
  tests/production/preview-assembly.test.ts \
  tests/production/post-scene.test.ts
npm run typecheck
```

**独立 commit：** `feat(production): add fixed project visual shell`

### Task 7：改造 readability validator 识别共享边界

**目标：** v3 validator 验证 Renderer 的语义内容与 shared boundary，不再要求每 Scene 复制
本地安全框；v2 validator 行为保持原样。

**修改文件：**

```text
scripts/production/readability-source-validator.ts
scripts/production/readability-validator.ts
scripts/production/scene-submit.ts
scripts/production/watch.ts
scripts/production/post-scene-default.ts
tests/production/scene-readability.test.ts
tests/production/scene-submit.test.ts
tests/production/orchestration-e2e.test.ts
```

**Red：**

- v3 semantic-only Renderer（无 SceneBackground/SceneContentFrame）当前会失败；
- v3 Renderer 自己 import/render安全区、背景、VisualShell、CaptionLayer 或读取
  `readabilityPolicy` 必须失败；
- v3 source graph 内 `SceneText`、`SceneSvgText` 和静态 HTML/SVG text 必须按同一 frozen min
  font size 检查；
- v3 validator 必须机械证明 shared `SceneSafeArea` runtime 与 generated scaffold 的 boundary
  marker current，而不是仅相信 Renderer 缺少安全框；
- submit、watcher、post-scene 都必须复用同一 public validator，check-only、byte/mtime stable；
- v2 fixture 仍要求一份 `SceneBackground + SceneContentFrame`，证明没有静默迁移旧合同。

**最小 Green：**

1. validator 显式按 assignment schemaVersion dispatch v1/v2 legacy 与 v3 unified boundary；
2. 抽出共享文字/scale/source-graph 检查；v3 root 只要求一个可静态检查的 semantic root，不要求
   background/content frame；
3. v3 禁止 ownership components/imports 和 raw readability prop；
4. 对固定 runtime files/scaffold marker 做 exact source identity/check，证明外层 wrapper 存在；
5. `validateSceneReadability()` 返回 policy、boundary、shell fingerprints 供 mechanical check；
6. mechanical check v3 绑定三者，任一 drift 使 package/result/watch fail closed。

**聚焦验证：**

```bash
node --import tsx --test \
  tests/production/scene-readability.test.ts \
  tests/production/scene-submit.test.ts \
  tests/production/orchestration-e2e.test.ts
npm run typecheck
```

**独立 commit：** `refactor(production): validate shared scene boundaries`

### Task 8：v3 全链 synthetic E2E 与真实 preflight 验证

**目标：** 证明新合同、preflight、SceneSafeArea、VisualShell、single-writer 和 PreviewAssembly
连成一条新生产链，同时旧项目和私有目录零修改。

**修改文件：**

```text
tests/production/orchestration-e2e.test.ts
tests/production/start.test.ts
tests/production/preflight.test.ts
tests/production/project-scaffold.test.ts
tests/production/visual-shell.test.ts
```

**Red：**

- synthetic v3 two-Scene fixture 必须先证明 preflight pass 才创建 Run；
- 任一 VoxCPM/browser external failure 必须在 Run/scaffold/provider/Scene 前停止；
- success path 必须生成 v3 assignments/results/packages 和 PreviewAssembly v2，保持
  central single writer 与 byte/mtime idempotence；
- shell/policy/runtime drift 必须在 submit/watcher/post-scene fail closed；
- protected artifact checksum 必须 before/after 相同。

**最小 Green / synthetic：**

```bash
node --import tsx --test tests/production/*.test.ts
```

fixture 使用 fake transport/process，不读取 private config、不访问网络；但必须断言 fake TTS
request count 始终为 0，browser probe args 与正式 adapter exact equal。

**真实 preflight：**

1. 在当前 host、当前 dependency install、当前 private-config environment 下只运行 read-only：

```bash
npm run production:preflight -- --project rounded-airplane-windows
```

2. 该命令允许读取旧 v2 current authored contracts 作为诊断输入，但不迁移、不写该项目，
   `production:start` 仍拒绝从 v2 创建新 Run；
3. 验证 stdout 只有 safe pass contract；stderr/terminal history 不出现 URL、token、绝对路径或
   profile content；
4. 让 `/health` 返回固定 liveness success、`/ready` 返回已冻结的 503/loading，验证 preflight
   仍 pass、没有模型 warm-up/TTS 请求；随后真正的 `production:narrative` 才负责触发服务自动
   装载；
5. 让 `/ready` 返回 HTTP 500，验证只输出 safe `VOXCPM_MODEL_LOAD_FAILED` external blocker，
   不泄露 response body 中的内部路径/trace；
6. 验证 `.producer-runs/`、`.narration-work/`、project files、registry、十个正式 artifacts 的
   bytes/mtime 均未变化；
7. 在隔离 fake process test 中重放 exact Chromium sandbox stderr，证明分类；不得为了让当前
   sandbox 通过而加 `--no-sandbox`；
8. 若真实命令返回 external blocker，Task 8 停止并报告环境事实；不伪造 pass、不创建 Run。

**聚焦验证：**

```bash
node --import tsx --test tests/production/*.test.ts
npm run registry:check
npm run catalog:check
git status --short
```

**独立 commit：** `test(production): prove v3 preflight and scene assembly`

### Task 9：Authority docs、完整 gate 与保护 closeout

**目标：** 同步实现事实并证明没有范围外修改；只有全部 gate 通过才可把实现标记为完成。

**修改文件：**

```text
docs/FINAL_PRODUCT_GOAL.md
docs/PRODUCTION_WORKFLOW.md
docs/ITERATION_STATUS.md
docs/ROADMAP.md
docs/ARCHITECTURE.md
docs/DETERMINISTIC_EXECUTION.md
docs/TERMINOLOGY.md
docs/PRODUCTION_ORCHESTRATION.md
```

**文档同步内容：**

- v3 新生产 boundary ownership、v1/v2 compatibility 与不迁移事实；
- VisualShell 与 GlobalVisualLayers 的硬区分；
- SceneSafeArea/CaptionLayer/Scene Renderer 三方所有权；
- `production:preflight` exact command、start ordering、external blocker taxonomy；
- preflight 不进入 Run ledger/作品 authority，single-writer 不变；
- browser sandbox permission 不属于 Scene defect；
- M10、NarrativeCheck、审美 gate、promotion、发布仍未开始。

**完整验证：**

```bash
node --import tsx --test tests/production/*.test.ts
npm run check
npm run production:preflight -- --project rounded-airplane-windows
git diff --check
git status --short
```

若当前执行沙箱不允许 Chromium，`npm run check`/真实 preflight 的 browser failure 必须按
external blocker 记录，并在有同等正式权限的 host 环境重跑；不能修改 browser args 绕过。

**保护 closeout：**

1. 重算十个正式 artifact after checksum，与 Task 1 before baseline byte-for-byte 相同；
2. `git diff --name-only -- src/projects/gps-relativity src/projects/product-comic-vertical \
   out/m8-gps-final-assembly out/m9-product-comic-vertical` 为空；
3. `git status --short public/voice_profile` 与 baseline 路径级状态相同，不进入目录；
4. `git diff -- src/remotion/runtime/story-visual/SceneSlot.tsx` 人工确认 Task 5 增量叠加在用户原
   formatting diff 上，没有丢失既有修改；
5. `git diff --name-only` 只能包含第 6 节批准文件；
6. `git diff --check` 通过；
7. 检查 staged set 不包含 private config、voice profile、out 临时文件、token 或运行目录。

**独立 commit：** `docs(production): document v3 preflight scene boundaries`

Task 9 commit 后仍不 push。

## 8. 测试与验收矩阵

| 维度 | 必须证明 |
| --- | --- |
| 单一安全区权威 | v3 requirements 与 assignment 的 policy fingerprint 相同；SceneSafeArea 无 resolver/默认 inset；VisualShell/Renderer 无安全区数值 |
| Renderer ownership | v3 Renderer 无背景、安全框、字幕、shell、audio；semantic-only fixture pass |
| SceneText | 同一 context/min字号；低于阈值、动态/继承/相对字号、缩小 transform fail |
| VisualShell | exactly once、project-local、literal import、无文字/Scene语义/Caption/audio/network/scan/DSL |
| Caption | CaptionLayer 仍由 NarrativeCore 顶层唯一渲染；Scene/Shell import/render 均 fail |
| 版本兼容 | v1/v2 bytes/identity/check path 不变；新 start 只接受 v3；旧 Run 可继续原路径 |
| VoxCPM config | 与 narrative 共用 resolver/schema；default/override、profile unique、loopback、protected path fail closed |
| VoxCPM network | 零 TTS payload、零 reference/prompt content read、固定 `/health` + `/ready` GET、每 route 至多一次、无 retry/fallback |
| Chromium | exact正式 executable/adapter/entry/args；真实 launch；sandbox permission safe external blocker |
| Run-before-write | 任一 preflight fail 后无 scaffold/run/event/state/narration-work/Scene write |
| Error privacy | fake endpoint/token/absolute path/stack/profile content 不出现在 contract/stdout/stderr |
| Single writer | preflight零写；central store唯一 events/state writer；Scene result writer边界不变 |
| No runtime scan | VisualShell/Renderer 均 literal static import；source graph 仅制作期固定检查 |
| No enhancement drift | PreviewAssembly v2 绑定 VisualShell，同时 `globalVisualLayers: absent` |
| Protected artifacts | 十个 checksum before/after 完全一致；两个正式 project diff 为空 |
| Protected directory | `public/voice_profile/` 只做 path-level status；不读取内容、不stage、不commit |

## 9. 回滚与失败处理

- 每个 Task 独立 commit；若 Task 内 Green 无法成立，只回退该 Task 自己明确新增的文件/行，
  不触碰用户预存修改。任何 destructive git 操作仍需用户明确批准。
- preflight external blocker 不通过 retry、fallback 或改安全设置解决；修复外部服务/权限后重新
  运行 read-only preflight，再创建全新 Run。
- v3 contract/validator/common adapter 在 valid fixture 下失败属于 fixed-flow defect：保存脱敏
  现场，补最窄 Red，最小 common Green，独立 commit，再从 preflight/start 完整重验。
- 已创建 Run 之后发现 upstream identity drift，沿现有 immutable replacement 规则处理；本计划
  不新增 resume shortcut。
- VisualShell 或 readability identity 在 Scene freeze 后变化，使 v3 assignments/packages/results
  stale；主 Agent 必须重新 freeze/新 Run，不手改 result/state。

## 10. 已确认的 VoxCPM preflight 边界

用户说明与老项目 skill/API 源码一致：VoxCPM 模型长期不调用会自动卸载，首个真实语音请求会
自动装载模型。因此本计划不要求 preflight 时模型 resident，并把 liveness 与 readiness 分开：

```text
GET /health 200 + status=ok                 → liveness pass
GET /ready 200 + ready=true                 → resident-ready；preflight pass
GET /ready 503 + detail.status=loading      → cold；preflight pass；不预热
GET /ready 500                              → external model-load blocker；不打印 body
任一 probe unreachable/permission denied    → external environment blocker
其他 unknown/malformed response             → external environment blocker；不猜测、不假成功
```

实施无需用户再提供 health route 或 cold response 字段：固定 route 是 `/health` 与 `/ready`，
上述字段已由维护中的老项目生产合同和本机 API 源码交叉确认。它们作为 adapter 代码常量进入
测试，不修改 private config schema；若将来服务合同真实变化，应作为新的显式版本变更处理，
不得在运行时目录扫描、猜 route、接受任意 response 或调用 clone route 探测。

## 11. 计划自审

### 11.1 第二套安全区权威

**通过。** 只有 `production-readability-v1.sceneContentSafeAreaPx` 保存几何；v3 ownership literal、
SceneSafeArea、VisualShell 和 PreviewAssembly 不保存/推导另一组 inset。`SceneText` 复用同一
policy context。

### 11.2 runtime 目录扫描或动态模块路径

**通过。** VisualShell 与 Renderer 都由 generated TypeScript 字面量 import；目录/source graph
发现只发生在固定 scene-freeze/submit/post-scene check step。JSON 不保存组件或模块路径，Remotion
runtime 不 `readdir`/glob/dynamic import。

### 11.3 权限或安全绕过

**通过。** 没有 `--no-sandbox`、`--disable-web-security`、容器、alternate browser、网络 fallback、
provider fallback、自动 retry 或假音频；permission/sandbox 归类为 external blocker 并在 Run 前
停止。

### 11.4 旧项目迁移

**通过。** v1/v2 contracts/scaffolds/renderers/packages/results/assemblies 保持兼容；新 start 从
v3 开始。GPS、ProductComicVertical、rounded-airplane-windows 不回填 VisualShell、不删除本地
safe frame、不重渲染、不重 fingerprint。

### 11.5 single-writer

**通过。** preflight 零写入且发生在 Run 前；run-store 仍唯一写 events/state；Scene Agent 只
写 meaning-local source/assets 并由固定 submit/fail 写 immutable result；VisualShell 由主 Agent
在 freeze 前独占。

### 11.6 范围扩张

**通过。** VisualShell 明确不是 GlobalVisualLayers/Track/DSL/自动布局/自动导演；计划未包含
sealed narration 复用、Scene 批量重提、NarrativeCheck、审美 gate、promotion、M10、发布或 push。

### 11.7 私密与保护路径

**通过。** preflight contract 和日志不包含 endpoint/token/private path/content；metadata-only
profile 检查在受保护目录内容 access 前停止；closeout 只对 `public/voice_profile/` 做 path-level
porcelain status，正式 artifact 用既有十项 checksum 证明零修改。

### 11.8 可独立提交与验证

**通过。** Task 1–Task 9 均有明确 Red、最小 Green、精确文件、聚焦测试与独立 commit；最终
包含 production tests、`npm run check`、真实 read-only preflight、保护 checksum、diff allowlist
和 authority docs 同步。
