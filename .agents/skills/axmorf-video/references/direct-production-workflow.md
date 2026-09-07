# Direct production workflow

Agents author; fixed scripts validate and build.

## 1. Create or revise Project inputs

Pass one strict repository-relative input. Omit `sceneTemplates` to inherit ProducerConfig;
user silence must never become `null`:

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Creation atomically preserves silent/narrated semantics and freezes the pre-existing Scene source graph. A legacy
Project without a baseline stops before inspect until the user authorizes this zero-provider, locked migration:

```bash
npm run project:originality:freeze -- --project <storyId>
```

Never infer an empty baseline. A `ttsChunk` above 72 `caption-display-unit-v1` half-units fails with
`authoring-validation-failed`/`caption-display-budget-exceeded`; shorten or semantically split it. Revisions follow
their reference.

## 2. Load the optional external-asset MCP slot

Activate only when the Root can call one MCP's `get_provider_status`, `search_images`, `preview_images`, and
`acquire_image` with an import-compatible receipt. Query Catalog first; acquire only missing imagery:

```bash
npm run project:asset:import -- --project <storyId> --receipt <absolute-receipt-path> --asset <assetId>
```

If the MCP is absent, omit this entire stage without error, placeholder task, prompt, estimate, or DAG node. Task
executors never receive it. Receipts/candidates stay at the adapter; only Project-owned manifest IDs and
fingerprints proceed.

## 3. Resolve execution once

只解析 prompt 的 explicit execution fields；其余按 settings、内置 `subagents`/4 继承。除非明确要求，不保存。
先按 [host capability probe](execution-capabilities.md) 验证 native child 读写与可用容量，再传入下列 host flags。

```bash
npm run project:execution:resolve -- [--mode inline|subagents] [--max-concurrency <n>] [--require-exact-concurrency] [--runtime-max-concurrency <n>] [--worker-transport shared-workspace|controller-io]
```

Inline 只需当前 shell-capable Agent。subagents 要求 runtime capacity 与 verified `shared-workspace`/
`controller-io`；capacity unknown 按 1，transport 缺失/zero capacity/exact mismatch 阻塞，ceiling 4。transport 不持久化，解析诊断不
进入 content identity。

## 4. Inspect read-only, then prepare explicitly

```bash
npm run project:produce:inspect -- --project <storyId>
```

Report read-only readiness, cost/reuse, and invalidation before:

```bash
npm run project:produce:prepare -- --project <storyId>
```

Prepare derives the ProductionRevision, Task DAG, and `dirtyAgentTasks`. Reuse valid artifacts; execute only dirty
Agent-owned tasks, never `scene-template`. Attempt IDs never enter TaskRevision; diagnostics own no content identity.

## 5. Execute dirty Agent tasks

每个 TaskRevision 只归属一个 executor。`inputs/task-contract.json` 是 immutable、attempt-neutral 的 exact output
contract，不包含 host command。

先运行 prepare 的 exact attempt-bound bind；这是 zero-write gate，`task-worker-bound` 前禁止 task read/write。
之后只使用返回的 capability 与 commands：

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

`shared-workspace` 仅访问返回的 workspace。`controller-io` 无 filesystem access，只能用 file-read/file-write；
write 通过 strict `{ "contentBase64": "..." }` stdin。finalize 生成 fixed fields；只修正 `agent-output`，commit
复验并提升 ArtifactAttestation。

- `inline`：Root 每次完成一个 task 的 bound terminal 后再处理下一个。
- `subagents`：以 `effectiveMaxConcurrency` 维护 bounded pool；原生 wait-any 完成即补位；原生同步批量返回后发下一批。
  每批不超过容量；不轮询 child，聊天不是 receipt。

真实 spawn/transport failure 只用 exact `spawnFailureCommand`，immutable/controller fault 只用
`fixedFailureCommand`；两者不能访问 task content。普通 failure 要 full binding；no automatic inline fallback。完成
inline tasks 或 child admission 后立即 continuation。

## 6. Suspend Root in the fixed continuation

After dispatch, Root launches prepare's exact `continuationCommand`:

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

It claims once while Root suspends and rejects duplicates. Failure stops; all success converges once. The one-hour
deadline starts at attempt creation. No repair, retry, or Root re-entry.

Convergence read-only replans, safely materializes attested bytes, then verifies `video.mp4`, `cover-4x3.png`,
`cover-3x4.png`, and `publish.json` by checksum and EOF-decode. A matching delivery returns
`project-production-current` without rewrite.

Candidate completion and promotion follow the revision reference.

terminal failed attempt immutable。明确恢复时先报告 read-only、zero-provider inspection，再为 same current
Revision reissue fresh attempt：

```bash
npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>
npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>
```

Reissue 不要求 current delivery；复用 valid artifacts/drafts，返回 fresh bindings/continuation，并拒绝 active、
stale 或 fixed-flow recovery。它不是 automatic retry。

Run `npm run compositions` and `npm run check` with host permissions first. Sandbox failures cannot prove VoxCPM
unavailable or justify weakening Chromium sandbox.
