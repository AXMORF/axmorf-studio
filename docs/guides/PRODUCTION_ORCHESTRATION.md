# Production orchestration

> 文档类型：操作指南

Root 负责 authoring、执行策略解析、inspect-and-report、explicit prepare 与 dirty-only execution。Root 串行执行
完或完成 bounded admission 后挂起；attempt-bound fixed continuation 独占 terminal barrier 和单次 converge。

## 1. Project optional Agent capabilities

Project 已创建或 authoring edit 完成后、inspect 之前，Root 只检查自己当前实际 callable 的 tools。若同一
外部图片 MCP 暴露 `get_provider_status`、`search_images`、`preview_images`、`acquire_image`，并能产出
`project:asset:import` 接受的 receipt，则启用 external-asset acquisition slot。仅本机安装/配置、shell 能
发现或其他 Agent 可调用都不构成启用条件。

启用后先用 `catalog:query` 查本地资源；确有素材缺口时才 search/preview/acquire，并在 inspect 前完成固定
准入。若当前 Agent 没有该 MCP，整个阶段从本次编排中省略，不报错，也不生成 placeholder、child prompt、
estimate 或 DAG node。该 slot 只属于 Root 的 pre-inspect authoring plane；Scene/GlobalVisual/Cover child、
ProductionRevision、Artifact Store、continuation 和 runtime 都不加载 MCP。下游只看 import 后的 Project
manifest identity 与 bytes fingerprint。

## 2. Resolve Agent execution

当前用户提示词中明确提出的 mode/max concurrency 字段优先；提示词没有的字段继承配置页，再继承内置默认。
全新 checkout 的内置默认是无需 child runtime 的 `inline`。override 只用于当前 production，除非用户明确要求保存：

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>]
```

只有 prompt/settings 选择 subagents 时才需要 runtime capacity；已知值必须传入，未知时按 1，明确为 0 时
阻塞。仓库安全上限为 4。非 exact 请求可 clamp 但必须报告；无法满足的 exact 请求在 prepare 前阻塞。
解析结果不进入 production identity。

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
`dirtyAgentTasks`。相同 inputs 的 valid artifact 必须显示 `reuse`。prepare 只为 dirty Agent tasks 建
`.producer-work/<storyId>/<taskRevision>/`，其中 `task.json` 与 `inputs/context.json` 是 immutable fixed inputs。

## 5. Execute only dirty Agent tasks

只执行 dirty `scene-owner`、`global-visual-owner`、`cover-owner`。一个 TaskRevision 只归属一个 executor，
共享当前 checkout，不使用 worktree。`scene-template` 与 narration/convergence/delivery fixed tasks 不由 Agent 创作。

每个 executor prompt 必须包含 storyId、revisionId、taskRevision、attemptId、唯一 workspace、必读 Skill/reference、
focused check 和 prepare 返回的 commit/failure commands。Scene child 完整读取 repository-local
`remotion-best-practices`。

executor 只能在自己的 workspace 循环：

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>
npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task|host
```

check 是只读；commit 重跑同一 validator。校验失败由同一 executor 在宣告终态前修正 workspace 后重跑。
inline 模式下 Root 一次只处理一个 workspace。subagents 模式按 `effectiveMaxConcurrency` 维护 bounded pool；
队列未空时仅 wait-any 释放 admission slot，不轮询全部 child。spawn hard failure 运行 exact
`hostFailureCommand`，不自动改为 inline。聊天不是 terminal receipt。

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

| outcome | 含义 |
| --- | --- |
| `producer-revision-stale` | authoring inputs 已变化，本次 revision 不可采用 |
| `producer-artifacts-incomplete` | 至少一个 required artifact 缺失或无效，未完成交付 |
| `project-production-complete` | 新四文件 package 已同步生成、复验并提升 current |
| `project-production-current` | 同 identity current package 已复验，media 未重写 |

若 attempt 失败，重新 inspect、向用户报告、再显式 prepare；valid earlier artifacts 自动 reuse，只派发仍
dirty tasks。这不是自动 retry。不要 provider fallback、跨 Project reuse、复制 identity、手改 manifest 或绕过
validator。

## 7. Host verification

实现改动按风险运行：

```bash
npm run check:static
npm run compositions
npm run check
```

真实 media/Chromium checks 首次使用宿主权限；沙箱 loopback/browser 失败不等于 provider/runtime 缺陷。
