# Project Revision / Task DAG / Artifact Clean-Break 实施计划

> 文档类型：已完成实施计划归档
>
> 日期：2026-08-20
>
> 归档状态：已完成。生产 authority 已 clean-break 为 ProductionRevision、内容寻址 Task DAG、
> task workspace、ArtifactAttestation、可复用 fixed/Agent artifacts 与同步 exact 四文件 DeliveryBuild；
> 旧 Run/receipt/boundary/render-ready/detached-delivery 双主链源码、CLI、active UI 字段和旧 tests 已删除。
>
> 当前 authority：以仓库可执行代码、测试及 `docs/` 根目录权威文档为准。

## 1. 结论

本次不修补现有 `ProductionRun`、owner receipt 或 Agent write boundary。目标是一次 clean-break：

> 把生产 authority 从 runId 驱动的执行账本，改为 Project authoring revision、内容寻址 Task DAG、
> 可复用 ArtifactAttestation 和同步四文件 DeliveryBuild；执行 attempt 只记录诊断，不拥有产物。

最终只保留一条生产主链。已有 Project 的首次创作、局部重做、失败后继续和最终交付都使用同一套
Revision/DAG/Artifact 规则；是否需要 Agent 只由 dirty task 计划决定。相同输入永远复用已有 artifact，
不因新 attempt、进程重启或历史失败重新消耗 TTS/Agent token。

本计划允许删除旧 CLI、旧 TypeScript contracts、旧 settings API 字段、旧 tests 和旧 Skill 流程，
不提供 compatibility layer，不迁移旧 Run 为新 authority。旧 `.producer-runs/` 保持只读历史，并继续由
`project:delete` 按 storyId 清理；新代码不得读取它来规划、构建或判定当前 Project。

## 2. 已确认的根因与设计约束

### 2.1 当前缺陷

当前 Skill 顺序是 `production:scene:freeze` 后运行 `delivery:cover:freeze`。前者先保存全工作区
owner-authoring fingerprint，后者再创建 `src/projects/<storyId>/delivery/` 父目录。边界采集器允许
`delivery/cover` 子树，但仍记录此前不存在的父目录，因此所有 owner 在发布 receipt 前同时被误判为越界。

这不是 Scene/GlobalVisual/Cover 创作失败，而是两个确定性 fixed writer 的阶段合同互相冲突。现有测试分别
验证 Scene freeze、Cover freeze 与 boundary，却没有覆盖“Project 无 delivery 目录”的真实公共顺序。

### 2.2 必须保留的产品不变量

- 一 Story 一个 Composition；一 StoryBeat 一个 meaningId 和 ScenePackage。
- sealed PCM 与累计 sample frame 继续是时间 authority；不重新切分 Agent authored `ttsChunks`。
- 字幕只由顶层 CaptionLayer 渲染；Scene root 保持透明。
- template-copy Scene 继续由固定脚本验证和物化，不派发 Agent。
- Scene、GlobalVisual、Cover 的创作所有权继续彼此隔离。
- Render runtime 继续使用 composition-local 静态 registry，不扫描目录、不调用网络或 Agent。
- 所有 Project、public media、work/artifact/attempt、out、delivery 继续是 ignored 本地数据。
- 最终交付仍是同步生成、机械复验并受控提升的 exactly four files：`video.mp4`、两张 Cover 和
  `publish.json`。
- current delivery 在新 package 全部通过 checksum、probe 和 EOF decode 前不得被替换。
- 不新增数据库、服务、Docker、远程 artifact store 或新的 TTS Gateway。
- 不读取或暴露 private config、`.env`、voice profile 内容。

### 2.3 新的硬边界

- `runId`、attemptId、时间戳和绝对路径不得进入 RevisionId、TaskRevision 或 ArtifactAttestation identity。
- Agent 不直接写 live Project；只写 fixed CLI 创建的 task workspace。
- fixed validator 是 workspace 到 Artifact Store 的唯一 promoter；manifest 最后写，promotion 原子且可回滚。
- Artifact Store 命中必须重新校验 contract、exact file set、path containment、regular-file/no-symlink、size 和
  checksum；不能因为目录存在就视为命中。
- ExecutionAttempt 可失败、可丢失、可重新创建；它不得阻塞 Artifact 重用或 current delivery。
- 旧 Run 不得被转换、代签、回填或复制 identity 到新体系。

## 3. 目标模型

### 3.1 ProductionRevision

新增 `ProductionRevision`，它只冻结“任务输入”，不包含 Agent 输出或过程投影。至少绑定：

- StorySpec、NarrationSpec、RenderSpec、VisualStyleSpec、PublishingIntent；
- ProjectSoundPlan、authoring requirements/readability；
- SceneProductionBrief、GlobalVisualBrief、StoryResourcePool；
- configured template instance identities；
- Project asset manifest、selected resource bytes/checksums；
- narration generation/provider-attempt identity；
- shared contracts/runtime/toolchain policy versions。

`revisionId` 是上述 canonical input 的内容指纹。它显式排除：

- `.producer-runs/`、`.producer-attempts/`、`.producer-work/`、`.producer-artifacts/`；
- owner assignments、receipts、results、render-ready、launch intent/receipt；
- Scene/GlobalVisual/Cover 当前输出；
- delivery、out、progress、时间戳和随机 ID。

避免使用当前 `collectProjectSourceSnapshot()` 的 broad Project tree 作为 Revision 输入，因为它同时包含 owner
输出，会形成“产物改变 revision、revision 又改变 task”的循环。实现应从严格解析后的 Project contracts 和
明确资源 manifest 构建 Revision。

### 3.2 ProducerTaskSpec

每个 TaskSpec 必须包含：

```text
schemaVersion
taskKind
storyId
semanticId
revisionId
dependencyArtifacts[]
inputFingerprints[]
declaredReadSet[]
declaredOutputSet[]
validatorPolicyVersion
taskRevision
```

建议 task kinds：

- `narration-chunk`：fixed/provider task，继续复用现有 `.narration-work`；
- `narration-seal`：fixed task；
- `semantic-timing`：fixed task；
- `scene-template`：fixed task；
- `scene-owner`：每个需要 Agent 的 meaningId 一个；
- `global-visual-owner`：每 Story 一个；
- `cover-owner`：每 Story 一个；
- `composition-convergence`：fixed task；
- `delivery-build`：fixed synchronous task。

`taskRevision` 由 task kind、semantic identity、真实输入 fingerprints、dependency artifact fingerprints 和
validator policy version 计算，不含 execution identity。

### 3.3 ProducerArtifact 与 ArtifactAttestation

Artifact 存储在：

```text
.producer-artifacts/<storyId>/<taskKind>/<taskRevision>/
├── files/...
└── artifact-attestation.json
```

Attestation 至少绑定：

```text
storyId
taskKind
semanticId
taskRevision
validatorPolicyVersion
dependencyArtifacts[]
outputManifest[]  # repository-relative logical path, checksum, size
artifactFingerprint
```

`outputManifest` 必须稳定排序。`createdAt`、attemptId 等诊断字段不得进入 fingerprint；如确需记录，放入
attempt event，不放入内容 authority。

### 3.4 Task workspace

Agent 只写：

```text
.producer-work/<storyId>/<taskRevision>/
├── task.json
├── src/...
└── public/...
```

fixed workspace creator 负责把当前可复用 Artifact 或最小 scaffold 投影进 workspace。Agent prompt 只收到
TaskSpec、workspace 相对路径、focused check 和 commit 命令，不收到 runId。

focused check 必须接受显式 workspace root，不能偷偷读取 live owner output。通过后，fixed commit：

1. 重新解析 TaskSpec；
2. 重跑相同 validator；
3. 校验 exact output set、禁止 symlink/path escape/unknown file；
4. 写 immutable staging；
5. `artifact-attestation.json` 最后写入；
6. 原子 rename 到 Artifact Store；
7. 已存在相同 identity/bytes 时 no-op，不同 bytes 时 fail closed。

### 3.5 ExecutionAttempt

Attempt 只用于 UI 与诊断：

```text
.producer-attempts/<storyId>/<attemptId>/
├── attempt.json
├── events/
└── progress.generated.json
```

它记录 revision、plan、cache hit/miss、task terminal outcome 和 delivery result，但不拥有 assignment 或
artifact。Attempt failure 后再次 plan 同一 Revision，应重新解析 Artifact Store，只派发 misses。Attempt 可保持
append-only；它是否 terminal 不影响新 attempt。

### 3.6 ProducerPlan

Plan 输出稳定排序的 DAG 与 reuse 决策：

```text
revisionId
artifactSetFingerprint
tasks[]:
  taskRevision
  status: reused | dirty | missing | incompatible | blocked
  reasonCode
  dependencyTaskRevisions[]
summary:
  reusedTaskCount
  dirtyAgentTaskCount
  dirtyFixedTaskCount
```

reasonCode 必须机械且稳定，例如 `artifact-missing`、`checksum-drift`、`input-changed`、
`dependency-changed`、`validator-version-changed`。不要让 Agent 自评是否可复用。

## 4. 唯一外部工作流

保留 native child Agent 编排，但移除 Run/freeze/finalize：

```bash
npm run project:produce:plan -- --project <storyId>
```

该命令完成 fixed preflight、TTS/cache/seal/timing 等可自动收敛节点，写 Revision/Plan/Task workspaces，并返回
仅包含 dirty Agent tasks 的 JSON。Root 一 task 一 child，Agent 在 workspace 内自行循环：

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision>
```

所有 child terminal 后，Root 恰好调用一次：

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

converge 重新规划，不相信聊天或 attempt 进度：

- 若仍有 missing/dirty Agent task，返回 `producer-artifacts-incomplete`，不写 delivery；
- 若 artifacts 齐全，物化 current Scene/GlobalVisual/Cover、刷新 package/coverage/registry/Composition；
- 调用同步 DeliveryBuild，复用同 identity staging 中已经验证的媒体；
- 完整验证后原子提升 `deliveries/<storyId>/`；
- 返回 `project-production-complete` 或 `project-production-current`。

不再存在 detached automatic delivery、render-ready 或 foreground production finalize。最终命令必须等待真实
Remotion/FFmpeg 完成并验证 MP4；普通局部修改与首次创作使用同一入口。

## 5. 实施任务

本次在一个分支中完成 clean-break，但内部严格按 Red → Green → focused verification 分 Task 推进。不得先删除
旧链路再失去可运行基线；先让新纵向链路 E2E Green，再在同一 change set 删除旧 authority。不要保留双写或
兼容期。

### Task 1：锁定新架构的 Red contracts 与架构门禁

**新增**

- `src/contracts/production-revision.ts`
- `src/contracts/producer-task.ts`
- `src/contracts/producer-artifact.ts`
- `src/contracts/producer-plan.ts`
- `src/contracts/execution-attempt.ts`
- `tests/contracts/production-revision.test.ts`
- `tests/contracts/producer-task.test.ts`
- `tests/contracts/producer-artifact.test.ts`
- `tests/contracts/producer-plan.test.ts`
- `tests/architecture/project-production-clean-break.test.ts`

**Red 断言**

- 改变 attemptId/runId/时间戳不改变 Revision/Task/Artifact identity；
- 改变 Story、timing slice、brief、resource bytes、validator version 会精确 invalidation；
- output manifest 未排序、重复路径、逃逸路径、absolute path、symlink kind、checksum stale 均拒绝；
- core/new pipeline 不 import old production run/owner/boundary/render-ready contracts；
- 新 package scripts 不再暴露旧 production/delivery Cover/finalize commands；
- settings schema 不再出现 `auditedRun`。

先只写测试与最小 schema skeleton，确认 Red 原因精确，不以大面积缺文件错误代替行为 Red。

### Task 2：实现 Revision 与 Task DAG 纯 domain

**新增**

- `scripts/project-production/domain/revision.ts`
- `scripts/project-production/domain/task-graph.ts`
- `scripts/project-production/domain/invalidation.ts`
- `scripts/project-production/domain/plan.ts`

**修改**

- `src/contracts/index.ts`
- `scripts/architecture/script-layering.ts`
- `tests/architecture/script-layering.test.ts`

**要求**

- Domain 纯函数，不读取 filesystem、不依赖 application/adapters/CLI。
- DAG 拒绝环、重复 task identity、未知 dependency、非稳定排序。
- 每个 Scene task 绑定完整 StoryBeat、SemanticTiming slice、readability、brief、requirements、resource pool 和
  selected resource fingerprints。
- template-copy task 与 scene-owner task 类型严格区分。
- GlobalVisual 不读取 Scene 输出；Cover 只读取 Story/VisualStyle/fixed CoverSpec。
- policy version 放在相关 node key 中，不能用一个全局版本导致所有任务无差别失效。

### Task 3：实现安全 Artifact Store 与 task workspace

**新增**

- `scripts/project-production/adapters/artifact-store.ts`
- `scripts/project-production/adapters/task-workspace.ts`
- `scripts/project-production/adapters/attempt-store.ts`
- `scripts/project-production/adapters/atomic-promotion.ts`
- `tests/project-production/artifact-store.test.ts`
- `tests/project-production/task-workspace.test.ts`
- `tests/project-production/attempt-store.test.ts`

**要求**

- 所有根路径由严格 storyId/task kind/taskRevision schema 推导，不接受调用方拼接任意路径。
- 拒绝 symlink、FIFO/device、unknown file、duplicate logical path 和 `..` escape。
- Artifact commit 使用同父 staging + atomic rename；manifest 最后写；捕获到的 promotion failure 恢复旧 artifact。
- 相同 identity/bytes no-op；相同 identity/不同 bytes 是确定性冲突。
- workspace cleanup 只删除精确 taskRevision root，使用 recoverable/validated target；不得 broad `rm`。
- Attempt 写入失败不得污染 Artifact Store。

### Task 4：把现有 fixed inputs 接入 Revision planner

**新增**

- `scripts/project-production/application/load-inputs.ts`
- `scripts/project-production/application/plan-production.ts`
- `scripts/project-production/application/prepare-fixed-tasks.ts`
- `scripts/project-production/adapters/project-input-snapshot.ts`
- `tests/project-production/revision-planner.test.ts`
- `tests/project-production/invalidation-matrix.test.ts`

**复用而非重写**

- `scripts/narration/*` 的 generation/provider-attempt cache、seal、mastering 与 PCM 校验；
- current Story/SemanticTiming/ScenePackage/ResourceCatalog contracts；
- Project configure/template instance identity；
- Project asset manifest 和 Catalog validation。

**关键矩阵**

- 同输入重复 plan：所有已有 artifact `reused`，bytes/mtime 稳定；
- 只改一个 Scene brief：仅该 Scene 与 downstream convergence/delivery dirty；
- 只改 Cover authoring input：仅 Cover 与 delivery dirty；
- 只改一个 TTS chunk：复用其他 chunks，重新 seal/timing，并由新 timing task inputs 精确 invalidation Scene；
- 修改 shared renderer runtime：相关 Scene/convergence/delivery invalidation；
- 修改无关 Project 或旧 Run：当前 revision 不变；
- validator version 变化：只失效该 task kind。

### Task 5：改造 Scene、GlobalVisual、Cover owner 为 workspace task

**新增/迁移**

- `scripts/project-production/application/scene-task-check.ts`
- `scripts/project-production/application/global-visual-task-check.ts`
- `scripts/project-production/application/cover-task-check.ts`
- `scripts/project-production/application/commit-task-artifact.ts`
- `tests/project-production/scene-task.test.ts`
- `tests/project-production/global-visual-task.test.ts`
- `tests/project-production/cover-task.test.ts`

从 `scripts/production/application/` 迁移仍有价值的纯 validator、readability source check、TypeScript compile、
GlobalVisual source graph 与 Project Composition compiler；迁移后不得保留反向 import 到旧 production。

**要求**

- validators 显式接受 task workspace root 和 TaskSpec；不读取 live owner source 决定通过。
- `project:task:check` 完全只读。
- Agent 可在同一 workspace 内多次 check/修正；只有一次成功 commit 创建 ArtifactAttestation。
- `project:task:commit` 重跑 check，不能把 earlier check 当 authority。
- Scene task 输出继续包含 Renderer、plans、anchors、selected resources、sound plan 和必要 license/lineage；
  generated ScenePackage 由 fixed convergence 产生，不由 Agent 伪造。
- GlobalVisual/Cover 分别保持当前职责，不读取其他 owner workspace。

### Task 6：实现 Artifact convergence 与 current Project 物化

**新增**

- `scripts/project-production/application/converge-artifacts.ts`
- `scripts/project-production/adapters/project-materializer.ts`
- `tests/project-production/convergence.test.ts`
- `tests/project-production/materialization.test.ts`

**要求**

- Converge 始终重新计算 current Revision/Plan；传入 revision stale 时返回稳定错误，不采用旧 artifact。
- 所有 required artifacts 齐全前不修改 current materialized owner roots。
- 物化使用 task-owned directory staging + controlled replace；跨 `src`/`public` 替换必须有 rollback 测试。
- template-copy Scene 由 fixed task 直接产生 ArtifactAttestation，无 Agent。
- 物化后机械刷新 ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 和生成式 Composition。
- 重新读取 materialized files，并证明 bytes 与 ArtifactAttestation exact match。
- 不写 run result、receipt、render plan 或 render-ready。

### Task 7：把同步 ProjectBuild 纳入唯一生产链

把当前 `scripts/project-build` 的成熟能力迁入 `scripts/project-production`，保留其：

- build-owned staging；
- 同 identity 已验证媒体复用；
- Remotion/FFmpeg 同步等待；
- H.264/AAC、声道、尺寸、fps、frame count、PNG、checksum、EOF decode；
- `publish.json` 最后写；
- current delivery controlled replacement/rollback；
- 完整 current package no-op。

**修改/新增**

- `scripts/project-production/application/build-delivery.ts`
- `scripts/project-production/adapters/media.ts`
- `scripts/project-production/adapters/progress.ts`
- `scripts/project-production/application/progress-query.ts`
- `scripts/project-production/cli.ts`
- `tests/project-production/build-delivery.test.ts`
- `tests/project-production/cli.test.ts`
- `tests/project-production/progress.test.ts`

新的 DeliveryBuildId 绑定 `revisionId + artifactSetFingerprint + Composition metadata + build policy`，不再 broad
hash owner current source，也不绑定 attempt。Build 前后都要验证 materialized bytes 与 attestations，防止人工漂移。

### Task 8：切换 settings progress、删除和 CLI surface

**Settings**

- clean-break 升级 `settings/contracts/api.ts` schema；删除 `ProductionRunProgress`、`auditedRun`、
  `auditedRunError`；
- UI 只显示 current Revision、task reused/dirty/blocked counts、current attempt diagnostics 和四文件 delivery；
- API 不扫描 `.producer-runs/`；旧 Run malformed 不再让当前 Project 页面报错。

**Project delete**

- 保留旧 `.producer-runs/<runId>` 的 deletion-only strict `runId/storyId` ownership parser；删除
  `ProductionRunIdSchema` 后，在删除器内部保留最小 legacy ID schema，禁止为此继续导出或读取旧 Run contract；
- 新增 `.producer-attempts/<storyId>`、`.producer-work/<storyId>`、`.producer-artifacts/<storyId>` 的精确清理；
- deletion matrix 必须覆盖 new roots，继续保护其他 Project、core、private 和 voice profiles。

**package scripts**

新增：

```text
project:produce:plan
project:task:check
project:task:commit
project:produce:converge
```

删除：

```text
production:preflight
production:start
production:status
production:narrative
production:scene:freeze
production:scene:check
production:global-visual:check
production:owner:ready
production:owner:failed
production:finalize
production:render-ready:check
delivery:cover:freeze
delivery:cover:check
delivery:build
delivery:check
project:build
```

不要保留旧命令转发到新命令的 shim。更新 architecture test 保证旧命令、旧 imports 和旧状态字段不能回来。

### Task 9：删除旧 Run authority 与双主链实现

新纵向 E2E Green 后删除：

- `scripts/production/` 中 run store、events/projection/transitions、owner inbox、owner output manifest、boundary、
  assignments/freeze/submit/fail、render-ready、finalize、status/progress 和旧 CLI；
- `src/contracts/production-agent-write-boundary.ts`、`production-owner.ts`、`production-run.ts`、
  `production-render.ts`、run-bound `production-scene-result.ts` 与 `production-global-visual.ts`；
- `scripts/delivery/` 中 detached launch、run-bound package/check/progress 和 Cover assignment workflow；
- `scripts/project-build/`（能力已迁移后）；
- 对应 `tests/production/*`、旧 audited delivery tests、旧 project-build tests；
- settings audited Run UI/CSS/contracts。

`production-requirements.ts`、`production-readability.ts` 中仍属于 Project authoring 的合同应在同一变更中明确
重命名为 `authoring-requirements.ts`、`scene-readability.ts`，更新 imports 后删除旧名，不留 deprecated export。

不得删除 `.producer-runs/` 实际目录或任何 Project/媒体；新代码只是不再消费它们。删除旧 source tests 前，必须把
仍然保护有效产品不变量的断言迁入新 test suite，不能用“旧架构已删除”为由降低 coverage。

### Task 10：重写 Skill、权威文档和最终验收

**Skill**

重写 `.agents/skills/remotion-story-producer-video/`：

- Root 运行 plan，只派发 dirty Agent tasks；
- child 只写 task workspace，自行循环 focused check，最后 commit artifact；
- Root 等待所有 child terminal 后恰好调用一次 converge；
- 聊天仍不作 authority，ArtifactAttestation 才是 authority；
- 没有 runId、owner receipt、freeze、boundary 或 finalize；
- 相同 Revision 的已验证 artifact 必须复用；
- normal endpoint 是实际 `project-production-complete/current`，不是 spawn acknowledgement。

**权威文档**

同步更新：

- `docs/FINAL_PRODUCT_GOAL.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCTION_WORKFLOW.md`
- `docs/DETERMINISTIC_EXECUTION.md`
- `docs/ITERATION_STATUS.md`
- `docs/ROADMAP.md`
- `docs/TERMINOLOGY.md`
- `docs/guides/PRODUCTION_ORCHESTRATION.md`
- `docs/guides/LOCAL_DELIVERY.md`
- `README.md` 与 `docs/README.md` 的入口
- `AGENTS.md` 的 current production/delivery、owner、故障和验证边界

不得把计划目标提前写成已实现。实施完成后把本文移入 archive，并在 `docs/archive/implementation-plans/README.md`
追加一条完成摘要。

## 6. 必须具备的 E2E 证据

使用 `mktemp` 隔离仓库 fixture，不删除或修改真实作品，至少证明：

1. **首次生产**：三个 Agent task 缺失；提交两个、第三个失败，converge 返回 incomplete 且不写 delivery。
2. **失败后继续**：新 attempt 重新 plan，前两个为 reused，只派发第三个；第三个提交后 converge 成功。
3. **fixed failure**：Delivery render 在一项媒体后失败；再次执行复用已验证 staging，只重做缺失媒体。
4. **单 Scene 修改**：只 dirty 目标 Scene 与 downstream convergence/delivery；其他 Scene、TTS、GlobalVisual、Cover
   均 reused。
5. **Cover 修改**：只 dirty Cover 与 delivery。
6. **TTS 修改**：其他 chunks reused；seal/timing 和实际受影响 Scene 按指纹失效。
7. **validator 升级**：只失效对应 task kind。
8. **安全边界**：workspace symlink、unknown file、path escape、artifact checksum drift 全部 fail closed。
9. **历史隔离**：任意 malformed/failed `.producer-runs` 不影响 plan/converge/build；删除器仍能安全识别严格 ownership。
10. **零 Project**：bootstrap、Registry/Catalog、settings API 和核心检查继续通过。

如果当前 checkout 存在完整的 `cloudflare-ai-capabilities` Project，可在不调用 TTS provider、不重新派发已命中 Agent
task 的前提下运行一次真实 plan，验证它输出精确 reuse/dirty 摘要。不要把 ignored Project 数据复制进 worktree、fixture
或 Git；真实媒体 build 只在 source/artifacts 完整且用户数据位于当前执行 checkout 时运行。

## 7. 验证顺序

每个 Task 先跑新增 focused tests。完成 clean-break 后依次运行：

```bash
npm test
npm run typecheck
npm run lint
npm run docs:check-links
npm run check:static
npm run compositions
npm run check
```

涉及真实 Project Composition、Remotion、FFmpeg 或 Chromium 的命令首次直接使用宿主权限。不得通过 `--no-sandbox`、
fallback、预热 TTS 或跳过 media gate 获得 Green。最后检查：

- `rg` 不再发现 active 旧 CLI、Run authority、owner receipt、render-ready、detached delivery 文案；
- `src/contracts/index.ts` 不导出旧 contracts；
- new script layering 没有 domain/application/adapters 反向依赖；
- git diff 不包含 Project、public media、private、voice、Run、out 或 delivery；
- 无 compatibility shim、dead code、debug log 或 run-specific special case。

## 8. 完成定义

只有同时满足以下条件才可称为完成：

1. 唯一生产入口使用 Revision/DAG/Artifact，不创建或读取 ProductionRun。
2. Agent 只写 task workspace，fixed commit 才能生成 ArtifactAttestation。
3. 任意 attempt 失败后，后续 attempt 机械复用全部 valid artifacts，只派发 dirty tasks。
4. 内容 identity 不含 attempt/run/timestamp；输入或 validator drift 能精确失效。
5. 同步 delivery 实际生成并验证四个 current 文件；相同 identity no-op。
6. 旧 Run、receipt、boundary、render-ready、detached launch、双主链代码和 active 文档全部删除。
7. 旧 `.producer-runs` 数据保持未修改且不影响 current pipeline；Project 删除仍可清理其 ownership roots。
8. settings UI 展示 Revision/task reuse/current delivery，不展示 audited Run。
9. 全部 focused、static、host 与 E2E 门禁通过，并复核完整 diff。
10. 本计划已归档，权威文档只描述已经验证的 current 实现。

## 9. 明确非目标

- 不实现平台上传、账号、发布、远程队列或远程 artifact store。
- 不把 repo 变成常驻 Agent scheduler；native child lifecycle 仍由运行环境管理。
- 不保存 child thread/agent identity、聊天、heartbeat 或 token 内容。
- 不重做视觉质量的主观审核模型。
- 不 promotion Project-local Scene 到共享 capability。
- 不删除或迁移用户现有 Project、媒体、delivery、历史 Run。
- 不承诺 TTS waveform bit-for-bit 可重复；只复用已验证 sealed bytes 和 provider-attempt identity。
