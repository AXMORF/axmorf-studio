# Direct production workflow

Root only. Assigned workers follow [task protocol](task-execution-protocol.md).

create-context/inspect 汇报后同轮继续工具。Hermes 用 assistant text 搭配下一次 tool call，单独 final 会结束轮次。暂停/yield 按 Skill。

## 1. Create or revise Project inputs

strict input 用仓库相对路径；省略 `sceneTemplates` 继承 ProducerConfig；user silence must never become `null`：

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Create 保留 silent/narrated/visual 语义，冻结 Scene baseline。legacy 缺失时 inspect 前须用户授权零 provider、持锁迁移：

```bash
npm run project:originality:freeze -- --project <storyId>
```

不伪造 baseline。Root 预定 `outgoingHandoff.subject`；v1 给 `trackedState`。child 对照
`continuity.handoffs`；fixed template 不连续。字幕与修订按 Skill。

## 2. Load the optional external-asset MCP slot

Activate only when the Root can call one MCP's `get_provider_status`, `search_images`, `preview_images`, and
`acquire_image` with an import-compatible receipt. Query Catalog first; acquire only missing imagery:

```bash
npm run project:asset:import -- --project <storyId> --receipt <absolute-receipt-path> --asset <assetId>
```

If the MCP is absent, omit this entire stage without error, placeholder task, prompt, estimate, or DAG node. Task
executors never receive it. Receipts/candidates stay at the adapter; only Project-owned manifest IDs and
fingerprints proceed.

## 3. Resolve each production once

每次 live/candidate production（含同请求自主 revision）重验 [host probe](execution-capabilities.md)：helper 给完整路径/prompt，验证 I/O/容量并释放槽位；不沿用上轮。inspect 前成功 resolve 一次。explicit prompt → settings → `subagents`/4；未要求不保存。

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>] [--worker-transport shared-workspace|controller-io]
```

Inline 只需当前 shell-capable Agent；subagents 须已知 runtime capacity 与 verified `shared-workspace`/`controller-io`。unknown/missing transport/zero capacity/exact mismatch 在 prepare 前阻塞；ceiling 4。transport 不持久化，解析诊断不入 content identity。

## 4. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Inspect 后报告 `sourceState`、cost/reuse、结构化 invalidation；前置计划不算报告，二者不合并。局部修订若无关 tasks dirty，先缩小 patch、validate/create 新 candidate，重走第 3 步；全重做不算局部 reuse：

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare 返回 ProductionRevision、Task DAG、`dirtyAgentTasks`；复用 artifacts，只执行 dirty Agent tasks，never `scene-template`。Attempt IDs never enter TaskRevision；diagnostics 无 content identity。

## 5. Execute dirty Agent tasks

每 TaskRevision 只归属一个 executor。`inputs/task-contract.json` 是 immutable、attempt-neutral exact output contract，无 host command。Root 按 transport 整段转发 prepare `workerPrompts` 的完整角色/路径/bind。
短 ordinal 从 exact attempt immutable dirty task snapshots 解析，完整 binding gate 不变；保留旧 full task/binding CLI，禁止混用。

先运行 prepare 的 exact attempt-bound bind；这是 zero-write gate，`task-worker-bound` 前禁止 task read/write。
之后只使用返回的 capability 与 commands：

```bash
npm run project:task:bind -- --project <storyId> --attempt <attemptId> --assignment <ordinal> --transport shared-workspace|controller-io
npm run project:task:describe -- --project <storyId> --attempt <attemptId> --assignment <ordinal>
npm run project:task:finalize -- --project <storyId> --attempt <attemptId> --assignment <ordinal>
npm run project:task:check -- --project <storyId> --attempt <attemptId> --assignment <ordinal>
npm run project:task:commit -- --project <storyId> --attempt <attemptId> --assignment <ordinal>
npm run project:task:fail -- --project <storyId> --attempt <attemptId> --assignment <ordinal> --kind task|host|fixed
npm run project:task:file-read -- --project <storyId> --attempt <attemptId> --assignment <ordinal> --path <logicalPath>
npm run project:task:file-write -- --project <storyId> --attempt <attemptId> --assignment <ordinal> --path <declaredOutputPath>
```

`shared-workspace` 仅访问返回的 workspace。`controller-io` 无 filesystem access，只能用 file-read/file-write；
write 通过 strict `{ "contentBase64": "..." }` stdin。finalize 生成 fixed fields；只修正 `agent-output`，commit
复验并提升 ArtifactAttestation。

- `inline`：Root 每次完成一个 task 的 bound terminal 后再处理下一个。
- `subagents`：以 `effectiveMaxConcurrency` 维护 bounded pool；原生 wait-any 完成即补位；原生批量返回或整批完成通知后发下一批。
  每批不超过容量；不轮询 child，聊天不是 receipt。

真实 spawn/transport failure 只用 exact `spawnFailureCommand`，immutable/controller fault 只用
`fixedFailureCommand`；两者不能访问 task content。普通 failure 要 full binding；no automatic inline fallback。完成
inline tasks 或 child admission 后立即 continuation。

## 6. Supervise through the fixed continuation

After dispatch, Root launches prepare's exact `continuationCommand`:

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

Claim 一次，拒绝重复。Root 阻塞等原进程/通知，普通超时只续等；不轮询 child、反复读日志或重复汇报。错误才诊断并指导原 executor，不代写/commit。失败退出，all success converges once；deadline 从 attempt 创建起一小时。

Converge: read-only replan, attested materialization, checksum/EOF-decode for `video.mp4`, `cover-4x3.png`, `cover-3x4.png`, `publish.json`.
Valid matching delivery returns `project-production-current` without rewrite.

Fixed success 后汇报路径并结束；需独立复验用 `npm run project:check -- --project <storyId> --level final`。revision context 只用于已授权范围内修改。Candidate promotion 按 revision reference。

terminal failed attempt immutable。按 [recovery](agent-rework-and-system-hardening.md) 诊断，视频创作错误每个请求最多恢复一次；旧 workers 全退出后报告 read-only、zero-provider inspection，ready 才 same Revision reissue：

```bash
npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>
npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>
```

Reissue 无需 current delivery；复用 valid artifacts/drafts，返回 fresh bindings/continuation，派 fresh workers；拒绝 active/stale/fixed-flow recovery，不重开旧 attempt。系统/外部故障只诊断报告。

Run `npm run compositions` and `npm run check` with host permissions first. Sandbox failures cannot prove VoxCPM
unavailable or justify weakening Chromium sandbox.
