---
name: axmorf-video
description: Produce videos with bounded workers, event-driven supervision, and task recovery.
---

# AXMORF Studio Video

已有 exact attempt-bound bind 的 worker 直接走 [task protocol](references/task-execution-protocol.md)，不重跑 Root 流程；其余由 Root 执行。

## Create the Project when needed

新建先用 `npm run project:create:context -- --project <storyId>`；按 `fieldExamples` 写附加要求对象，按 `durationBudget` 预算旁白并报告实测偏差。

Read [policy](policy.json), [workflow](references/direct-production-workflow.md), and
[Producer config](references/producer-config.md). 报告首尾 Scene 的继承、选择或禁用。
User silence means inheritance：省略 `sceneTemplates`，never infer `null`；新建用 `project:create`，修改走隔离 revision。
新建 `visualStyle.theme` 默认 dark；可选 light 或四角色自定义 hex。按已校验主题设计全片，不能用 palette 文案覆盖主题；固定首尾形状/字体/动画不改。

`project:create` 冻结 originality baseline；legacy 缺失时必须显式 zero-provider `project:originality:freeze`，不伪造。
修复 `authoring-validation-failed`：`caption-display-budget-exceeded` 时缩短或拆分 `ttsChunk`，每段最多 72 `caption-display-unit-v1` half-units；不降低 validator。

修改用 [revision workflow](references/project-revision.md); never edit live authoring.

## Load optional Agent capabilities

Inspect 前仅看 current Agent's actually callable tools。同一 MCP 暴露 `get_provider_status`、`search_images`、
`preview_images`、`acquire_image` 且 receipt 兼容 import 才启用；config, shell, another Agent's tools do not count。
缺失时完整省略，不报错、不造 placeholder/DAG node。启用后先查 Catalog，再 `project:asset:import`；MCP 数据不进入 child、artifact、delivery 或 runtime。

## Resolve Agent execution

按 [host probe](references/execution-capabilities.md) 用 helper 生成完整路径和派发提示，验证 I/O 并释放全部探测槽位，再在 inspect 前执行 `project:execution:resolve`：prompt → settings → `subagents`/4。override
只作用本次 production，除非用户要求保存。inline 串行且无需 child；subagents 要求 bounded runtime-native children、
本次 verified `shared-workspace`/`controller-io`，capacity 未知阻塞，ceiling 4。一个 I/O probe 成功不代表最大容量是 1；读取原生工具可用槽位。unverified transport、
exact mismatch 或 zero capacity 在 prepare 前阻塞。transport 不持久化、不进入 identity。

## Inspect before cost

Run read-only `project:produce:inspect`；返回后转述 `agentHandoff` 的 readiness、cost/reuse 与失效原因，再 prepare；CLI 输出不算报告，未知保持未知。

## Prepare content-addressed tasks

报告后运行 `project:produce:prepare`，它可能调用 provider 并创建 ExecutionAttempt。Diagnostics 不进入 identity；复用 artifacts，仅执行 `dirtyAgentTasks`。

## Execute dirty Agent tasks

按已解析模式与 [Scene](references/scene-agent-orchestration.md)、
[GlobalVisual](references/global-visual-agent-orchestration.md), or [Cover](references/cover-agent-orchestration.md)
prompt; 优先完整转发 prepare 的对应 `workerPrompts`，不手抄 task/binding hash；never Agent-author `scene-template`. 按 [task protocol](references/task-execution-protocol.md) 在任何 task
read/write 前运行 exact attempt-bound bind；只有 `task-worker-bound` 才能通过返回的 transport 访问三个 immutable
inputs 与 declared outputs，并运行 bound commands。TaskExecutionContract attempt-neutral；the validated ArtifactAttestation
与 task-terminal events 才是 durable authority。

Prepare 前确认宿主进程能跨工具超时存活；按 host probe reference 的完整结果/原句柄等待示例执行。Hermes continuation 用原生 background/notify；Codex 不丢 session/cell ID，也不把 wait-any 的部分完成当整批完成。后台启动回执不是完成。

Inline Root executes exactly one workspace at a time. Subagent mode admits at most `effectiveMaxConcurrency`
runtime-native children；原生 wait-any 即时补位，原生批量返回或整批完成通知后发下一批；不轮询 child 或信任 chat。真实 spawn/
transport failure 由 Root 运行 `spawnFailureCommand`；immutable/controller fault 用 `fixedFailureCommand`；两者都不
授予 task content access 或切换模式。全部 dirty task 执行/admit 后立即 continue。

## Hand off to fixed continuation

Root starts the exact `continuationCommand` once per attempt. 用原进程阻塞等待或完成通知做低 token 监督；普通超时只继续等待，不查日志、不推理进度。Code claims once and watches immutable events.
Task failure exits nonzero without converge; all-success converges exactly once; deadline 从 attempt 创建起一小时。
错误通知才唤醒 Root 诊断并指导原 executor；不接管 workspace、不 direct converge、不重启当前 continuation。修复与恢复按下方 hardening。

## Preserve production invariants

- Sealed PCM samples 定义 timing；Composition 拥有 captions、narration、background。
- Scene/GlobalVisual/Cover 隔离；template 固定生产；Scene root 透明。
- TS/TSX 不可重复 frozen baseline 或同 revision source graph；template-copy 豁免。
- Diagnostics 不改变 authority；保护 private/voice/其他 Project/history。
- Delivery：`video.mp4`、两张 PNG Cover、`publish.json`，全部通过 EOF。

## Classify failure by task owner

中断无终态先报告；用户明确恢复后，`project:attempt:interrupt-inspect` 证明 owner/子进程死亡才执行返回的
`project:attempt:interrupt`，再走 recovery。禁止手删 lock/claim；legacy ownership 阻塞。细节见下方 hardening。

按 [hardening](references/agent-rework-and-system-hardening.md) 诊断并指导原 executor 修正 `agent-output`。terminal failure 后旧 workers 全退出，read-only `project:attempt:recover-inspect` ready 才 zero-provider same-Revision `project:attempt:reissue`，无需 current delivery。每个请求最多恢复一次；未知、无进展、系统/外部故障只诊断报告。

## Finish with verified delivery

执行前报告 mode/capacity、IDs、inspect、cost 与 TaskRevisions；Root 只按 fixed 结果报告一次交付或阻塞，忽略迟到的重复成功通知。
Only `project-production-complete` or `project-production-current` proves delivery. Do not publish, push, or use
`git add .`.
