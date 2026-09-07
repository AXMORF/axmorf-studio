# Production orchestration

> 文档类型：操作指南

Root 负责全局 doctor/preflight、authoring、执行策略解析、inspect-and-report、explicit prepare 与 dirty-only execution。
已分派 worker 直接走 exact bind 与 task contract，不重跑这些全局入口或调用 provider。每次派发附完整 Workspace root、
exact bind 和本地 worker 指南入口，不依赖父会话继承；模板见 [worker handoff](../../.agents/skills/axmorf-video/references/execution-capabilities.md#give-each-worker-a-complete-assignment)。Root 串行执行
完或完成 bounded admission 后挂起；attempt-bound fixed continuation 独占 terminal barrier 和单次 converge。

修改现有 Project 时先完成 [`PROJECT_REVISION.md`](PROJECT_REVISION.md) 的 context → validate → isolated candidate。
live authoring 禁止原地编辑。candidate 仍使用下述唯一主链；Root 只消费 create/prepare 返回的 exact
candidate-routed commands，不能手工移除或替换 `--candidate`。

新 Project 的 `project:create` 已同事务冻结 Scene originality baseline。旧 Project 若缺该文件，必须在 inspect
前停止并取得用户明确迁移授权，再运行零 provider、持 repository lock 的
`npm run project:originality:freeze -- --project <storyId>`；不得由 inspect/prepare 静默补空 baseline。

## 1. Project optional Agent capabilities

新 Project 已创建且尚未进入 inspect 时，Root 只检查自己当前实际 callable 的 tools。若同一
外部图片 MCP 暴露 `get_provider_status`、`search_images`、`preview_images`、`acquire_image`，并能产出
`project:asset:import` 接受的 receipt，则启用 external-asset acquisition slot。仅本机安装/配置、shell 能
发现或其他 Agent 可调用都不构成启用条件。

启用后先用 `catalog:query` 查本地资源；确有素材缺口时才 search/preview/acquire，并在 inspect 前完成固定
准入。若当前 Agent 没有该 MCP，整个阶段从本次编排中省略，不报错，也不生成 placeholder、child prompt、
estimate 或 DAG node。该 slot 只属于 Root 的 pre-inspect authoring plane；Scene/GlobalVisual/Cover child、
ProductionRevision、Artifact Store、continuation 和 runtime 都不加载 MCP。下游只看 import 后的 Project
manifest identity 与 bytes fingerprint。revision candidate 本轮没有独立 asset import；它只引用 base snapshot
已经准入的 Project-owned media，不在 candidate flow 中激活该 slot。

## 2. Resolve Agent execution

当前用户提示词中明确提出的 mode/max concurrency 字段优先；提示词没有的字段继承配置页，再继承内置默认。
全新 scaffolded Workspace 的内置默认是 `subagents`、最大并发 4；明确选择 `inline` 时不要求 child runtime。
先按 [host probe](../../.agents/skills/axmorf-video/references/execution-capabilities.md) 让原生 child 完成临时 challenge 读写，
Root 复验 bytes 并释放 probe slot，再把真实可用 capacity 与 transport 传给 resolver。override 只用于当前 production，除非用户明确要求保存：

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>] [--worker-transport shared-workspace|controller-io]
```

解析为 subagents 时需要 runtime capacity 和 verified worker transport；已知容量必须传入，
未知时按 1，明确为 0 时阻塞。`shared-workspace`/`controller-io` 是本次宿主能力证据，不是配置项，也不持久化。
仓库安全上限为 4。未验证 transport 或无法满足 exact request 都在 prepare 前阻塞。解析结果不进入
production identity。

## 3. Inspect and report before cost

```bash
npm run project:produce:inspect -- --project <storyId>
```

inspect 严格只读且零 provider call：不取 mutation lock，不创建/刷新 cache、artifact、workspace、attempt 或
delivery。它返回 sourceState、baseline、estimated provider/cache/Agent/delivery cost、task explanations 与
nextAction；unknown 必须保持 `null`。前后 source snapshot 漂移时返回 `inspection-source-drift`，不自动 retry。

Root 在任何有成本操作前先向用户报告 readiness、预计成本、reuse、direct changes、dependency propagation、
artifact state 与 blockedBy。explanation/baseline 只用于诊断，不决定或改变 production identity/dispatch。

真实 project-production preflight 首次使用宿主权限。沙箱诊断不能证明 VoxCPM 不可用，不得降低 Chromium
sandbox、预热 TTS 或增加 fallback。

## 4. Prepare explicitly

```bash
npm run project:produce:prepare -- --project <storyId>
```

prepare 是唯一允许 provider/cache/seal/master/timing、fixed artifact、dirty workspace 与 ExecutionAttempt 写入
的 public production 入口。它先完成所有可只读验证；若 narration 后仍缺 timing-bound authoring，返回
`project-authoring-required` 和 logical missing inputs，不创建 owner workspace 或假 Revision。

production inputs ready 时保存 `attemptId`、`revisionId`、summary、estimated/actual cost、taskExplanations 和
`dirtyAgentTasks`。每项包含 `bindingId`、`bindCommands.sharedWorkspace/controllerIo`、describe/finalize/check/
commit、task/fixed/spawn failure commands。相同 inputs 的 valid artifact 必须显示 `reuse`。prepare 只为 dirty
Agent tasks 建 `.producer-work/<storyId>/<taskRevision>/`，其中 `task.json`、`inputs/context.json` 与
`inputs/task-contract.json` 是 immutable fixed inputs。TaskExecutionContract 是 attempt-neutral task content，不嵌入
transport、binding、failure 或 command template。

## 5. Execute only dirty Agent tasks

只执行 dirty `scene-owner`、`global-visual-owner`、`cover-owner`。一个 TaskRevision 只归属一个 executor且不使用
worktree。shared-workspace executor 只能进入 bind 返回的 exact relative workspace；controller-io executor 没有
checkout/filesystem access，只能调用 bound file-read/file-write。`scene-template` 与 narration/convergence/delivery
fixed tasks 不由 Agent 创作。

每个 executor prompt 必须包含 storyId、revisionId、taskRevision、attemptId、bindingId、transport、必读 Skill/reference、
bind 与 prepare 返回的 exact commands。Scene child 完整读取 repository-local
`remotion-best-practices`。

任何 task content read/write 前先运行 exact bind command。bind 以零 task writes 校验 binding、task/active attempt、
三个 immutable inputs 的 checksum 与 TaskExecutionContract；只有 `task-worker-bound` 授予 capability：

```bash
npm run project:task:bind -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport shared-workspace|controller-io
npm run project:task:describe -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --kind task|host|fixed
npm run project:task:file-read -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --path <logicalPath>
npm run project:task:file-write -- --task <taskRevision> --attempt <attemptId> --binding <bindingId> --path <declaredOutputPath>
```

shared-workspace 只允许返回的 relative workspace/declared files。controller-io 没有 filesystem access：file-read
只允许 immutable inputs/已有 declared outputs；file-write 从 strict `{ "contentBase64": "..." }` stdin 写 declared
output，并复验大小、parent/no-symlink 与 regular file。describe/finalize/check/commit/authored task failure 需要 full
binding。finalize 只投影 fixed derived fields 后运行同一 validator；`agent-output` issue 由同一 executor 修正。
inline 模式下 Root 一次只处理一个 workspace。subagents 中不同 TaskRevision 使用全新 native child/session；
已完成 child 不通过 follow-up/resume 接新任务。原 owning executor 只可在同任务 terminal 前修正输出。
subagents 模式按 `effectiveMaxConcurrency` 维护 bounded pool；
原生支持 wait-any 时完成即释放 slot 并补位；原生批量时每批不超过容量，同步调用返回或原生整批完成通知后提交下一批。
两者都是真实 native children，不能用 shell 后台或新聊天模拟，也不轮询全部 child。真实 spawn/transport/permission failure 运行
Root-only exact `spawnFailureCommand`；immutable/controller fault 运行 `fixedFailureCommand`。二者 authority 更窄，
只能记录 exact terminal event，不能读写 task content。不自动改为 inline；聊天不是 terminal receipt。

## 6. Hand off to fixed continuation

inline 全部执行完或 subagents 全部 admission 后，Root 的最后一个生产动作是启动 exact `continuationCommand`：

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

这是 bounded fixed process，不是常驻 Agent/scheduler。它先对 exact attempt 原子创建 one-shot claim，再监听
immutable event log；重复启动 fail closed，不依赖 `progress.generated.json` 通知。它保持宿主任务运行；Root
同时挂起，不轮询、推理或消耗 token 监督。任一 task failure 直接终止且不 converge；全部成功才内部
converge 一次；从 ExecutionAttempt 创建起一小时总 deadline 内缺 terminal 会写 timeout failure；fixed failure 直接退出，不重试或
重新进入 Root。

converge 使用 read-only current replan 检查 Revision 与 Artifact Store；不调用 provider、不创建 workspace 或
new attempt。stale revision 或 incomplete artifacts 在任何 live mutation 前返回；不信任聊天。齐全后 fixed
code 受控物化、刷新 derived Project、复验 attested bytes，并同步构建和验证 current delivery。

candidate scope 的 exact-four Delivery 只是 promotion prerequisite。continuation 随后自动尝试 fixed promotion；
promotion 在锁内重验 base/current 与 expected candidate tuple，受控替换 source/public/narration/delivery、刷新并
复验 Registry/Catalog。失败 rollback 并保留 candidate，只使用 `project:revision:promote` 重试，不 reissue 已完成
的 candidate attempt。

| outcome                         | 含义                                              |
| ------------------------------- | ------------------------------------------------- |
| `producer-revision-stale`       | authoring inputs 已变化，本次 revision 不可采用   |
| `producer-artifacts-incomplete` | 至少一个 required artifact 缺失或无效，未完成交付 |
| `project-production-complete`   | 新四文件 package 已同步生成、复验并提升 current   |
| `project-production-current`    | 同 identity current package 已复验，media 未重写  |

terminal failed attempt 永远 immutable。显式 recovery 先运行并报告严格只读、零 provider inspection：

```bash
npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>
npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>
```

recover inspection 只在 failed terminal、无其他 active attempt、same current Revision 且 current plan 没有
dirty/blocked fixed tasks 时返回 `attempt-recovery-ready`。reissue 在 lock 内重检，不要求 current delivery，复用
valid artifacts/drafts，创建 fresh attempt/bindings 并返回 `project-production-reissued` 与 continuation。active/
stale/fixed-flow failure 拒绝；这不是自动 retry。不要 provider fallback、跨 Project reuse、复制 identity、手改
manifest 或绕过 validator。

## 7. Host verification

实现改动按风险运行：

```bash
npm run check:static
npm run compositions
npm run check
```

真实 media/Chromium checks 首次使用宿主权限；沙箱 loopback/browser 失败不等于 provider/runtime 缺陷。
