# Project Create / Inspect / Prepare / Explainability Clean-Break 实施计划

> 文档类型：待实施计划，不是 current implementation authority
>
> 日期：2026-08-20
>
> 当前事实仍以 `AGENTS.md`、仓库可执行代码、测试及 `docs/` 根目录权威文档为准。本文目标只有在
> Red → Green、完整验证和文档 closeout 后才能写入 `ITERATION_STATUS.md`。

## 1. 结论

本次优化不改变 ProductionRevision → Task DAG → ArtifactAttestation → synchronous four-file delivery 的
唯一生产主链，而是修正这条主链之前和入口处的四个问题：

1. 新 Project 没有原子、严格、可重复验证的固定创建入口；当前 `project:configure` 要求 Agent 已先手工创建
   `src/projects/<storyId>` 及多份文件。
2. `project:produce:plan` 在输出计划前可能调用 TTS provider、写 narration/timing、fixed artifacts、task
   workspaces 与 ExecutionAttempt；名称和调用顺序没有暴露成本。
3. ProducerPlan 虽有 `reasonCode`，但 current planner 主要只能说明 artifact missing/drift/blocked；
   `input-changed` 没有由真实 planner 发出，也不能指出具体输入与依赖传播链。
4. 修复任务的 CLI/Settings 只展示数量、TaskRevision 和粗粒度诊断，不能直接回答“为什么重做 TTS/Scene/Cover、
   哪些工作会复用、接下来会调用多少 provider/Agent/render”。

目标入口为：

```text
new Project:
  Root authors story + ttsChunks + creative inputs
    -> project:create
    -> project:asset:import           # only when Project-local media is needed
    -> project:produce:inspect       # read-only, zero provider/write cost
    -> project:produce:prepare       # explicit costly fixed preparation
    -> dirty Agent tasks
    -> project:produce:converge

existing Project modification or repair:
  Root edits current authoring inputs
    -> project:produce:inspect
    -> user-visible change/cost/reuse explanation
    -> project:produce:prepare
    -> dirty-only Agent tasks
    -> project:produce:converge
```

`inspect`、`prepare` 和 explainability 都不能成为新的 authority。Revision、TaskRevision、ArtifactAttestation、
validated current delivery 继续拥有 data-plane identity；explanation、estimate、attempt 和 human labels 只用于诊断。

## 2. 已确认的 current facts

### 2.1 `project:configure` 不是 Project 创建器

`scripts/projects/configure.ts` 当前先读取：

- `src/projects/<storyId>/brief.json`；
- `src/projects/<storyId>/story.json`；
- 调用方给定的 `producer-input.json`；
- 已存在的 `assets.manifest.json`。

然后才投影 NarrationSpec、RenderSpec、PublishingIntent、AuthoringRequirements、ProjectSound 和 configured Scene
templates。它不负责原子创建完整 Project，不拒绝“目标目录存在但来源不完整”的所有情况，也不拥有
VisualStyle、StoryResourcePool、SceneProductionBrief 或 GlobalVisualBrief 的初始 authoring transaction。

### 2.2 `plan` 当前包含有成本的 prepare

`planProjectProductionUnlocked()` 在加载完整 Project inputs 和返回 ProducerPlan 前先调用
`prepareNarrationInputs()`。后者可能执行 provider request、PCM normalize、seal、mastering 和 timing；随后 planner
还会 commit fixed artifacts、创建 dirty workspaces 并写 attempt。因此 current `plan` 不是 read-only query。

### 2.3 reason contract 与真实分类不一致

current contract 列出：

```text
artifact-valid
artifact-missing
checksum-drift
input-changed
dependency-changed
validator-version-changed
dependency-blocked
```

但生产路径没有 previous task identity snapshot，新的 TaskRevision 在 Artifact Store 中只表现为 missing；planner
不能反解 hash 得知是 `brief`、`timing`、`runtime` 还是 `tts-chunk` 变化。部分 artifact parse、安全或 exact-set
错误还会被 catch 后粗略归入 checksum drift。Settings 不暴露 attempt 中已有的 per-task cache decisions。

### 2.4 新 Project 的 timing-bound authoring 必须显式分阶段

Story 与 narrated beat 的 `ttsChunks[].ttsText` 在 TTS 前由 Root Agent 创作；SemanticTiming 只能在真实 PCM
生成、测量和 seal 后确定。current SceneProductionBrief 又绑定 semantic timing fingerprint。因此
`project:create` 不能一边承诺“零 provider 成本”，一边伪造 timing 或宣称完整生产输入已就绪。

新入口必须把以下状态机械区分：

```text
configured-authoring       story/tts/config 已原子落盘，尚未准备 narration
timing-ready               TTS/seal/master/timing 已验证，可完成 timing-bound authoring
production-inputs-ready    所有 current authoring contracts 齐全，可构建 Revision/DAG
```

状态只是 source completeness projection，不进入 content identity，也不是新的 Run 状态机。

## 3. 目标与非目标

### 3.1 完成目标

- 一个固定 `project:create` command 原子创建新 storyId 的 configured authoring Project；目标已存在时 fail closed。
- create 明确包含 Story、StoryBeat 与 Agent-authored `ttsChunks`，但不调用 provider、不生成媒体、不复用其他 Project。
- 一个严格 read-only `project:produce:inspect` 在任何有成本操作前输出 source readiness、cache/cost estimate、
  baseline 与可获得的 invalidation explanation。
- 一个名称诚实的 `project:produce:prepare` 承担 narration prepare、fixed artifacts、Revision/DAG、dirty workspace
  与 new ExecutionAttempt。
- ProducerPlan/Attempt 记录结构化 direct change、artifact integrity、validator change、dependency propagation 和
  baseline；不再用一个 reasonCode 混合所有维度。
- CLI 与 Settings 能按 task kind/meaningId/chunkId 解释复用、dirty、blocked、预计/实际 provider request、Agent
  dispatch 和 delivery work。
- converge 只做 read-only current replan + artifact verification，再物化/交付；不得隐式调用 provider或创建
  workspace/attempt。
- 删除 `project:configure` 和 `project:produce:plan` 的 public command surface，不保留 alias/shim；有价值的内部
  prepare/build functions 迁移后复用。

### 3.2 明确非目标

- 不把“制作新视频”与“修改已有视频”的自然语言判断编码进 Skill 或 repository schema。
- 不增加常驻 Agent、watcher、scheduler、child identity/chat/heartbeat persistence。
- 不恢复旧 attempt 或旧 Agent；失败后仍由新 prepare/attempt 通过 content inspection 复用 artifacts。
- 不允许 inspect warm TTS、发送测试语音、创建 cache、刷新 Catalog、创建 workspace 或写 attempt。
- 不加入自动 retry、provider fallback、跨 Project TTS/Scene/media reuse、Project clone 或 compatibility shim。
- 不改变 exact four-file delivery、同步 build、media probe/EOF decode 或 current replacement authority。
- 不删除或修改任何现有 Project、public media、deliveries、out、private、voice profile、`.producer-runs`、
  `.producer-artifacts` 或 `.producer-attempts` 用户数据。

## 4. 目标 contracts

### 4.1 ProjectCreateInput

新增严格、JSON-safe 的 `ProjectCreateInput`，只保存 Agent/user authored values 与明确选择，不接受由调用方伪造的
derived fingerprint、absolute path、provider secret、runtime output 或其他 Project identity。至少包含：

- storyId、VideoBrief、StorySpec；Narrated StoryBeat 内保留 exact ordered `ttsChunks`；
- VisualStyle authored fields 与 style profile selection；
- GlobalVisualBrief authored fields；
- 可在 Project 创建前验证的 core/shared resource selections 与 per-Scene creative brief authored fields；
- Producer input 中非默认 render/publishing/production choices；
- optional configured boundary Scene template selections。

fixed creator 从 current ProducerConfig、Catalog、template registry 和 selected resources 计算并写入 derived
fingerprints/config projections。若 Scene brief 的 current contract 必须绑定尚不存在的 SemanticTiming，creator
把其 authored values 保持在 create transaction 的受控 pending input 中，并返回
`nextRequiredPhase: "prepare-narration"`；不得填 placeholder fingerprint。narration verified 后由 fixed projection
绑定真实 timing，再进入 `production-inputs-ready`。

`project:create` 先产生合法的空/配置派生 Project asset manifest。只有 Project root 成功创建后，Root 才能通过
既有 `project:asset:import` 本地化该 Project 独有的媒体，再完成引用这些 asset IDs 的 resource pool/Scene brief。
create 不能假设尚不存在 Project 已经拥有 Project-local asset，也不能跨 Project 借用旧 manifest。

ProjectCreateInput 不是 ProductionRevision，也不是长期兼容格式。成功 creation 后 current Project contracts 才是
source authority；pending authoring input 只服务同一新 Project，必须位于 story-owned ignored root，并纳入
`project:delete` 精确清理。

### 4.2 ProductionInspection

新增 `ProductionInspection` read model：

```ts
type ProductionInspection = {
  storyId: StoryId;
  sourceState:
    | "configured-authoring"
    | "timing-ready"
    | "production-inputs-ready";
  currentRevisionId: ProductionRevisionId | null;
  baseline: {
    kind: "current-delivery" | "latest-verified-attempt" | "none";
    revisionId: ProductionRevisionId | null;
  };
  estimatedCost: {
    providerRequests: number | null;
    providerCacheHits: number;
    agentTasks: number | null;
    deliveryMedia: readonly ("video" | "cover-4x3" | "cover-3x4")[] | null;
  };
  tasks: readonly TaskDecisionExplanation[];
  nextAction:
    | "complete-authoring"
    | "prepare-narration"
    | "prepare-production"
    | "converge-current";
};
```

Estimate 必须标记 unknown，不能用推测值冒充确定事实。inspect 只能从 source、check-only Catalog、TTS cache
metadata、valid diagnostic snapshots、Artifact Store 和 current delivery 读取；任何 read model 缺失只降低解释
完整度，不得改变生产结果。

### 4.3 TaskDecisionExplanation

把 current 单一 `reasonCode` 拆成正交字段：

```ts
type TaskDecisionExplanation = {
  taskKind: ProducerTaskKind;
  subject: { kind: "meaning" | "tts-chunk" | "project"; id: string };
  taskRevision: TaskRevision | null;
  baselineTaskRevision: TaskRevision | null;
  action:
    | "reuse"
    | "dispatch-agent"
    | "prepare-fixed"
    | "blocked"
    | "converge";
  artifactState:
    | "valid"
    | "missing"
    | "manifest-invalid"
    | "identity-mismatch"
    | "exact-set-drift"
    | "checksum-drift"
    | "unsafe-path";
  directChanges: readonly {
    kind: "input" | "validator" | "declared-io";
    id: string;
  }[];
  dependencyChanges: readonly {
    taskKind: ProducerTaskKind;
    subjectId: string;
    taskRevision: TaskRevision | null;
  }[];
  blockedBy: readonly {
    taskKind: ProducerTaskKind;
    subjectId: string;
    taskRevision: TaskRevision | null;
  }[];
  explanationAvailability: "complete" | "baseline-unavailable";
};
```

说明：

- `artifactState` 描述当前目标 artifact 是否可用；`directChanges` 描述相对 baseline 的输入变化；两者不能再
  混为同一个 reason。
- `subject` 是诊断 label，不进入 TaskRevision。Scene 使用 meaningId，narration chunk 使用 chunkId，其余使用
  stable project-level label。
- 对外只展示 allowlisted input ID，如 `brief`、`timing`、`runtime`、`tts-chunk`、`provider-attempt`、`story`、
  `visual-style`、`publishing`；不展示 text、absolute path、private value 或 raw provider response。
- fingerprint 可在本地 attempt 中保存用于比较，但 Settings/普通 CLI 默认不输出 before/after hash。
- dependency propagation 必须来自 DAG edges，不从错误文案或 task kind 猜测。

### 4.4 Diagnostic baseline snapshot

hash 不可反解，因此仅凭新的 TaskRevision 和 missing artifact 无法解释哪个输入变化。ExecutionAttempt 升级为新的
strict version，保存每个 planned task 的 diagnostic identity snapshot：

```text
task kind + diagnostic subject
taskRevision
sorted input fingerprints
validator policy version
declared read/output sets
dependency task revisions
plan decision
```

baseline 优先选择与 current verified DeliveryBuild 对应的 succeeded attempt；没有 current delivery 时选择 latest
verified attempt；两者都不存在则 `baseline-unavailable`。失败 attempt 可以作为“上次失败诊断”显示，但不能取代
current-delivery baseline，也不能影响 task classification。

旧 attempt、缺失 attempt 或 malformed diagnostics 保持原位并被隔离。新 planner 不修改、迁移或删除它们；无法
读取 snapshot 时只返回 baseline unavailable。Attempt snapshot 不进入 Revision/Task/Artifact/Delivery identity。

## 5. CLI clean-break

最终 public production surface：

```text
project:create
project:produce:inspect
project:produce:prepare
project:task:check
project:task:commit
project:produce:converge
```

删除 public surface：

```text
project:configure
project:produce:plan
```

不保留 npm alias、deprecated option 或转发 shim。内部可迁移复用 current configure/narration/planner functions，
但 active docs、Skill、tests 和 architecture guard 只能出现新命令。

### 5.1 `project:create`

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

- operation lock 覆盖 source/public/template/sound/catalog transaction；
- input、target parents 和所有 selected source 必须 regular/no-symlink/contained；
- storyId 已存在、partial target、cross-project identity 或 unknown file 均 fail closed；
- 所有目标先 prepare/validate，再 controlled promote；任何失败恢复 creation 前 filesystem；
- 返回 sourceState、written logical paths、pending authoring requirements 和 nextAction；
- 不调用 provider、不写 `.narration-work`/artifact/workspace/attempt/delivery；
- 成功重复调用只允许 exact same creation identity 的只读 current，different input 不覆盖已有 Project。

### 5.2 `project:produce:inspect`

```bash
npm run project:produce:inspect -- --project <storyId>
```

- 无 repository mutation lock；使用 check-only readers 和 mutation guard test；
- 不产生 ExecutionAttempt，因为“查看成本”不是一次执行；
- 可在 timing 尚未生成时报告 narration cache estimate 和 `prepare-narration`，但不得伪造完整 Revision/DAG；
- production inputs ready 时输出完整 per-task reuse/dirty/blocked explanation 与预计 Agent/delivery work；
- repeated inspect bytes、mtime、provider call count 与 attempt count 均不变。

### 5.3 `project:produce:prepare`

```bash
npm run project:produce:prepare -- --project <storyId>
```

- operation lock 覆盖 provider/cache/seal/master/timing、fixed artifact、DAG、workspace 和 attempt；
- stdout 明确区分 estimated 与 actual provider/cache/media decisions；
- 若 narration 完成后仍需 Root 补 timing-bound authoring，返回稳定
  `project-authoring-required`，列出缺失 logical inputs，不创建 owner workspaces、不伪造完整 Revision；
- production inputs ready 时创建一个新 ExecutionAttempt，返回 attemptId、revisionId、summary、完整 explanation、
  dirtyAgentTasks 和 nextAction；
- dirtyAgentTasks 每项包含 human-safe subject、TaskRevision、workspace logical root、changed input IDs 和 focused
  check/commit command；不包含 private path、prompt content 或其他 workspace；
- same inputs + valid artifacts 仍可创建新 diagnostic attempt，但 artifacts/bytes/mtime 保持 current。

### 5.4 converge

converge 必须改用提取后的 read-only current-plan builder：

- recompute current inputs/Revision；
- inspect Artifact Store；
- validate explanation-independent task decisions；
- stale/incomplete 时零 live mutation；
- 不调用 provider、不生成 narration、不创建 workspace、不新建 planning attempt；
- only when complete 才 materialize、build delivery，并 append terminal result 到 prepare 创建的 current attempt。

## 6. 分层设计

保持 `scripts/project-production/domain -> application -> adapters -> cli` 单向依赖：

- domain：task snapshot diff、typed invalidation、DAG propagation、cost summary 的纯函数；
- application：inspect、prepare、build-current-plan、create Project orchestration；
- adapters：source/cache/artifact/attempt/current-delivery readers，atomic Project creator，provider/media ports；
- CLI/Settings：只投影 structured result，不重新推导原因。

建议拆分 current `plan-production.ts`：

```text
application/build-current-plan.ts     no provider/workspace/attempt writes
application/inspect-production.ts     read-only readiness/cost/explanation
application/prepare-production.ts     fixed costly preparation + attempt
application/task-explanation.ts       baseline comparison use case
domain/task-explanation.ts            pure snapshot diff + propagation
adapters/project-create-store.ts      atomic new Project commit
adapters/production-inspection.ts      check-only readers
```

`prepare-fixed-tasks.ts`、narration cache/seal/mastering、Artifact Store、workspace、materializer 和 delivery builder
继续复用，不创建平行实现。

## 7. Red → Green 实施任务

### Task 1：建立保护基线与新 contracts Red

**新增/修改**

- `src/contracts/project-create.ts`
- `src/contracts/production-inspection.ts`
- `src/contracts/producer-plan.ts`
- `src/contracts/execution-attempt.ts`
- `src/contracts/index.ts`
- `tests/contracts/project-create.test.ts`
- `tests/contracts/production-inspection.test.ts`
- `tests/contracts/producer-plan.test.ts`
- `tests/contracts/execution-attempt.test.ts`

**Red**

- current reason model不能同时表达 artifact missing 与 direct input change；
- unordered/duplicate/private diagnostic input IDs、cross-story subject、dependency cycle、stale snapshot 拒绝；
- create input 中 derived fingerprint、secret/path/runtime output、错误 storyId、silent Scene TTS 拒绝；
- explanation/attempt metadata 改变不改变 Revision/Task/Artifact identity。

**Green**

- strict schemas/builders、canonical sorting、stable fingerprint 与 safe diagnostic allowlist；
- 新版本 clean-break，不给旧 public contract 增 deprecated optional fields；
- old local diagnostic files不修改，reader isolation保持。

### Task 2：实现 typed artifact inspection 与纯 explanation domain

**新增/修改**

- `scripts/project-production/domain/invalidation.ts`
- `scripts/project-production/domain/plan.ts`
- `scripts/project-production/domain/task-explanation.ts`
- `scripts/project-production/adapters/artifact-store.ts`
- `tests/project-production/invalidation-explanation.test.ts`
- `tests/project-production/artifact-store.test.ts`

**Red**

- 一个 Scene brief change 精确输出 `directChanges=[brief]`；其他 Scene无变化；
- checksum drift、manifest parse、identity mismatch、exact-set drift、unsafe parent 分别分类；
- validator-only change 不误报 input；
- downstream composition/delivery 给出 exact blockedBy chain；
- artifact target missing 且 baseline task input changed 同时保留两类事实。

**Green**

- Artifact Store 返回 typed, stable, redacted inspection result；unexpected programmer error 继续 throw，不能 catch-all
  伪装成 checksum drift；
- pure snapshot diff 比较 sorted input IDs、validator、declared I/O 和 dependency bindings；
- propagation 只沿 validated DAG 递归生成，stable sort、无重复、无内容泄漏。

### Task 3：持久化 diagnostic snapshot 与 baseline selection

**修改**

- `scripts/project-production/adapters/attempt-store.ts`
- `scripts/project-production/adapters/progress.ts`
- `scripts/project-production/application/progress-query.ts`
- `tests/project-production/attempt-store.test.ts`
- `tests/project-production/historical-isolation.test.ts`

**Red**

- current delivery 对应 succeeded attempt 被选作 baseline，而较新的 failed attempt 不能替换它；
- narration chunks 可用 chunkId 区分，不因 semanticId 为 null 合并；
- malformed/missing/旧版本 attempt 返回 baseline unavailable，不影响 plan；
- snapshot event/attempt 写失败不改变 artifact classification 或 delivery。

**Green**

- append-only attempt 保存完整 diagnostic task snapshots 与 stable subject；
- baseline reader 只返回 validated safe fields；
- current delivery binding、revision 与 delivery result 必须一致，否则不作为 baseline。

### Task 4：先交付 explainable prepare 输出与 Settings

**修改**

- `scripts/project-production/cli.ts`
- `settings/contracts/api.ts`
- `settings/server/production-progress.ts`
- `settings/client/features/progress/ProductionProgressPanel.tsx`
- `tests/project-production/cli.test.ts`
- `tests/config/production-progress-server.test.ts`
- `tests/config/production-progress-ui.test.ts`

**Red**

- CLI 必须输出 attemptId、按 kind reuse 数量、dirty task subject、changedInputs、blockedBy 与 nextAction；
- Settings 展示“直接变化”和“被谁阻塞”，不能只显示 task count；
- raw fingerprints、authoring text、absolute/private paths、provider error body 不进入 API/UI；
- same plan 的 explanation stable-sort，JSON byte-equivalent。

**Green**

- CLI 保持单一 JSON stdout；human-readable 中文由 Root/Settings 从 stable code + label 渲染；
- attempt/Settings 共用同一 structured explanation，不在 UI 重算 DAG；
- diagnostic projection failure不回滚任何 artifact。

### Task 5：提取 read-only current-plan builder 并实现 inspect

**新增/修改**

- `scripts/project-production/application/build-current-plan.ts`
- `scripts/project-production/application/inspect-production.ts`
- `scripts/project-production/adapters/production-inspection.ts`
- `scripts/project-production/application/current-revision.ts`
- `scripts/project-production/application/load-inputs.ts`
- `tests/project-production/production-inspect.test.ts`
- `tests/project-production/read-only-inspection.test.ts`

**Red**

- inspect 前后 source/public/generated/cache/artifact/workspace/attempt/delivery exact tree 与 mtimes 不变；
- provider adapter 注入为“调用即失败”，inspect 必须 Green 且 provider call count 为零；
- fresh configured Project 没有 timing 时返回 `prepare-narration`，不报假 complete；
- complete Project 输出 provider cache hit/miss estimate、task explanation 和 estimated action；
- unknown estimate 显式 null/unknown，不默认零。
- inspect 对 authoring/Catalog/cache/artifact/current delivery 分别做前后 fingerprint 校验；并发写导致 snapshot
  漂移时返回稳定 `inspection-source-drift`，不自动重试、不写 lock file、不输出混合时点结论。

**Green**

- 为 source readiness、cache key inspection、Artifact Store 与 delivery 建 check-only ports；
- Catalog 只用 check mode；
- build-current-plan 接受已经验证的 fixed task descriptors/attestations，不生成它们；
- mutation guard test 用 mktemp snapshot 证明零写入。

### Task 6：把有成本行为迁入 prepare，并让 converge 只读 replan

**新增/修改**

- `scripts/project-production/application/prepare-production.ts`
- `scripts/project-production/application/plan-production.ts`（迁移完成后删除）
- `scripts/project-production/application/converge-artifacts.ts`
- `scripts/project-production/application/prepare-fixed-tasks.ts`
- `scripts/project-production/cli.ts`
- `tests/project-production/prepare-production.test.ts`
- `tests/project-production/convergence.test.ts`

**Red**

- prepare 才允许 provider/cache/fixed artifact/workspace/attempt mutation；
- provider请求发生前已完成所有可只读确定的 source/config/cache validation；
- narration ready 但 timing-bound authoring缺失时返回 `project-authoring-required`，没有 owner workspace/假 Revision；
- complete inputs 时 actual provider count、cache hits、dirty tasks 与 filesystem事实一致；
- converge 注入 provider 为“调用即失败”仍能对 prepared Revision 成功；
- stale/incomplete converge 零 live write、零 provider、零新 attempt。

**Green**

- current prepare逻辑迁入明确 use case；
- preparation stages在一个 repository operation lock 内，失败保持 validated cache/artifact可复用；
- converge只调用 build-current-plan/check-only readers；
- terminal delivery result append 到匹配 revision/plan 的 active attempt。

### Task 7：实现原子 `project:create`

**新增/修改**

- `scripts/projects/create.ts`
- `scripts/projects/application/create-project.ts`
- `scripts/projects/adapters/project-create-store.ts`
- `scripts/projects/configure.ts`（迁移能力后删除 public CLI或删除文件）
- `scripts/projects/delete.ts`
- `tests/config/project-create.test.ts`
- `tests/config/project-create-security.test.ts`
- `tests/config/project-delete.test.ts`

**Red**

- new storyId 从一个 strict input 生成 complete configured-authoring source；Story/ttsChunks byte/semantic identity保持；
- existing/partial target、cross-project input、unknown resource/template、symlink/path escape/special file 拒绝；
- source/public/template/sound/catalog 任一 promotion fail 完整 rollback；
- create 期间 provider、narration-work、artifact、workspace、attempt、delivery 调用/写入全部为零；
- same identity 第二次执行只读 current，不改 mtime；different identity 不覆盖；
- delete 精确清理 story-owned pending create input，继续保护其他 Project/private/voice/core。

**Green**

- 复用 configure 的 strict builders、template/sound preparation 和 repository lock；
- transaction 先在受控 staging 构建 exact set，全部 parse/check 后再 controlled promote；
- Settings 将 configured-authoring 显示为明确的“待准备旁白/待补 authoring”，不是 malformed Project。

### Task 8：切换 command surface 与 architecture guard

**修改**

- `package.json`
- `scripts/project-production/cli.ts`
- `scripts/architecture/script-layering.ts`
- `tests/architecture/project-production-clean-break.test.ts`
- `tests/architecture/script-layering.test.ts`
- 删除只服务旧 public `plan/configure` surface 的 tests/code。

先保证 create/inspect/prepare/converge vertical E2E Green，再删除：

- `project:configure` package script 与 CLI surface；
- `project:produce:plan` package script 与 `plan` command；
- active docs/Skill/tests 中的旧名字；
- 为旧名字存在的 wrapper、alias、deprecated option。

architecture tests 必须拒绝旧 scripts重新出现，并锁定 inspect 不依赖 provider writer、workspace writer、attempt
writer 或 materializer。

### Task 9：E2E、故障、安全与成本证据

使用 mktemp 隔离 fixtures，不读取或修改真实 Project，至少覆盖：

1. new create 成功，Story 与 TTS台词保留，零 provider/Agent/render；
2. create 任一多 root promotion failure 完整 rollback，外部 symlink目标零写入；
3. inspect 在 fresh/current/failed-repair 三种 Project 上都完全只读；
4. inspect 预告两个 TTS cache hit、一个 miss，prepare实际只请求一个且统计一致；
5. 单 Scene brief修改：该 Scene direct dirty，composition/delivery显示传播，其他 Scene/TTS/Global/Cover reused；
6. 单 TTS chunk修改：只该 chunk direct dirty，seal/timing与受影响Scene给出依赖链，其他 chunk reused；
7. Cover/style/runtime/validator分别显示准确direct cause与局部失效；
8. artifact manifest、exact set、checksum、unsafe path分别显示稳定分类并fail closed；
9. 上次Agent失败：有效artifacts reused，只派发剩余dirty task，原因说明同时区分“input未变”和“artifact missing”；
10. delivery中途失败：再次prepare不重跑TTS/Agent，converge复用validated staging media；
11. malformed/旧 attempts只使baseline unavailable，不影响production；`.producer-runs`仍完全隔离；
12. same inputs inspect/prepare/converge current路径identity、bytes与mtime稳定。

### Task 10：Skill、权威文档与 closeout

实现 Green 后同步：

- `.agents/skills/remotion-story-producer-video/SKILL.md`；
- Skill direct workflow 与 Producer config reference；
- `AGENTS.md`；
- `README.md`；
- `docs/ARCHITECTURE.md`；
- `docs/PRODUCTION_WORKFLOW.md`；
- `docs/DETERMINISTIC_EXECUTION.md`；
- `docs/ITERATION_STATUS.md`；
- `docs/ROADMAP.md`；
- `docs/TERMINOLOGY.md`；
- `docs/guides/PRODUCER_CONFIG.md`；
- `docs/guides/PRODUCTION_ORCHESTRATION.md`。

Skill只描述目标 Project 已由会话确定后的 create/inspect/prepare/delegate/converge，不增加自然语言“新建还是修改”
决策表。它必须明确：

- inspect 完全只读；
- prepare 是唯一允许触发 provider/fixed preparation 的入口；
- Root 先向用户报告 inspect 的成本与失效解释，再 prepare；
- 只派发 prepare 返回的 dirty Agent tasks；
- Root只在当前任务内等待children，不常驻监控；
- completion 仍只由 verified current four-file delivery证明。

实现完成后把本文移入 `docs/archive/implementation-plans/`，在 archive README 记录完成摘要；不能让 active plan
继续冒充 current authority。

## 8. 验证顺序

每个 Task 先确认精确 Red，再做最小 Green，并运行对应 focused tests、targeted typecheck/lint/diff-check。最终依次：

```bash
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run check:static
npm run compositions
npm run check
```

涉及 Remotion/Chromium/FFmpeg/真实 Project gate 的命令首次使用宿主权限。不得通过 `--no-sandbox`、provider
fallback、自动 retry、TTS warm-up、跳过 media probe/EOF decode 或伪造 estimate 获得 Green。

最终额外检查：

```text
active old-command grep: project:configure / project:produce:plan == 0
inspect mutation/provider call E2E == 0
new Project source/public multi-root rollback == Green
explanation direct/propagated cause matrix == Green
settings/API/private-data redaction == Green
git diff contains no real Project/public/private/voice/out/delivery/attempt/artifact data
```

## 9. 完成定义

只有同时满足以下条件才完成：

1. 新 Project 通过固定、严格、原子 `project:create` 进入 configured-authoring，Story 与 authored TTS台词没有
   消失或被脚本改写。
2. `project:produce:inspect` 对所有状态只读且零 provider call，能够在成本发生前报告 readiness、estimate、
   reuse 与可获得的失效解释。
3. `project:produce:prepare` 是唯一公开的有成本 preparation入口，stdout区分estimated/actual行为并返回
   attemptId、Revision、dirty tasks与nextAction。
4. `project:produce:plan` 和 `project:configure` public surface、active docs与tests已删除，无shim或双入口。
5. 每个 non-reused task能区分artifact问题、direct input/validator变化与dependency传播；Settings展示同一结构化
   事实，不自行猜测。
6. explanation/baseline/attempt缺失或损坏只降低诊断，不改变Revision、TaskRevision、ArtifactAttestation、
   dispatch、materialization或delivery结果。
7. converge不调用provider、不创建workspace/plan attempt；stale/incomplete仍在live mutation前fail closed。
8. 新建、局部修改、Agent失败、fixed失败、delivery失败、single-chunk TTS和single-Scene invalidation E2E全部Green。
9. 现有用户Project、public media、deliveries、out、private、voice profile、historical `.producer-runs` 和已有
   producer data均未删除或修改。
10. focused、static、host与完整`npm run check` Green，完整diff复核无dead code、兼容层、私有数据或生成产物。
11. Skill与全部权威文档仅在实现验证后更新，本文随后归档。
