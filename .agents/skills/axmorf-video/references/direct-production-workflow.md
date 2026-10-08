# Direct production workflow

Root only. Assigned workers follow [task protocol](task-execution-protocol.md).

create-context/inspect 汇报后同轮继续。Hermes 的 assistant text 须搭配下一次 tool call，单独 final 会结束轮次；暂停/yield 按 Skill。

## 1. Create or revise Project inputs

strict input 用仓库相对路径；省略 `sceneTemplates` 继承 ProducerConfig；user silence must never become `null`：

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

Create 保留 silent/narrated/visual 语义，冻结 Scene baseline。legacy 缺失时 inspect 前须用户授权零 provider、持锁迁移：

```bash
npm run project:originality:freeze -- --project <storyId>
```

不伪造 baseline。先写全片 filmPlan，再将连续正文 meaningIds 按 visualScenes 分组；所有 Beat 的 brief 仍保留。
一个分组一个 owning task/source graph，sceneFrame 不在 Beat 边界重置。纯动效用 visual-scene/帧数/null 旁白，
或显式 authored-frames/silent scene-owner/preset 帧；均无 provider/旁白/字幕，首尾模板独立。
Root 预定跨 owner 的 `outgoingHandoff.subject`；v1 给 `trackedState`。child 对照
`continuity.handoffs`；scene-owner 可交接，fixed 不连续，仅组尾定义外部接缝。

## 2. Load the optional external-asset MCP slot

仅当 Root 实际可调用同一 MCP 的 `get_provider_status`、`search_images`、`preview_images`、`acquire_image`
且 receipt 兼容 import 才启用。先查 Catalog，仅获取缺少的图片：

```bash
npm run project:asset:import -- --project <storyId> --receipt <absolute-receipt-path> --asset <assetId>
```

If the MCP is absent, omit this entire stage without error, placeholder task, prompt, estimate, or DAG node.
child 不接收 MCP/receipt/candidate；仅导入后的 Project-owned manifest IDs and fingerprints 进入生产。

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

Prepare 返回 ProductionRevision/Task DAG/`dirtyAgentTasks`；复用有效 artifacts，仅执行 dirty Agent tasks，never `scene-template`。
Attempt IDs never enter TaskRevision；diagnostics 不入 content identity。

## 5. Execute dirty Agent tasks

每 TaskRevision 只归属一个 executor。`inputs/task-contract.json` 是 immutable、attempt-neutral exact output contract，无 host command。Root 按 transport 整段转发 prepare `workerPrompts` 的完整角色/路径/bind。
短 ordinal 只解析 exact attempt 的 immutable task；不混用 full binding 参数。

仅用 prepare 的 exact commands，见 [task protocol](task-execution-protocol.md)。先 zero-write gate bind，
`task-worker-bound` 前零读写，之后仅 capability 允许范围，不手抄身份：

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
- `subagents`：以 `effectiveMaxConcurrency` 维护 bounded pool；原生 wait-any 完成即补位；原生批量返回或整批完成通知后发下一批。
  每批不超过容量；不轮询 child，聊天不是 receipt。

真实 spawn/transport failure 只用 exact `spawnFailureCommand`，immutable/controller fault 只用
`fixedFailureCommand`；两者不能访问 task content。普通 failure 要 full binding；no automatic inline fallback。完成
inline tasks 或 child admission 后立即 continuation。

提前审片可原生等待全部 workers 终态，在唯一 continuation 前运行 `project:preview`（candidate 携 exact `--candidate`）。
草稿要求有效 fixed/owner artifacts，只在私有 view 物化/缩放渲染；无 provider/attempt/live/current/promotion 写入。
审后启动原 exact continuation 一次，不暂停/重启，不重置 deadline。receipt 不代替观看/听审；已提交 artifact 不覆盖。

## 6. Supervise through the fixed continuation

Root 启动 prepare 的 exact `continuationCommand`：

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

Claim 一次，拒绝重复。Root 阻塞等原进程/通知，普通超时只续等；不轮询 child、反复读日志或重复汇报。错误才诊断并指导原 executor，不代写/commit。失败退出，all success converges once；deadline 从 attempt 创建起一小时。

Converge：read-only replan、attested 物化，四文件 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json` 经 checksum/EOF-decode。
完整同 BuildId 返回 `project-production-current`，只读 no-op。

Fixed success 后一次汇报路径并结束；复验用 `npm run project:check -- --project <storyId> --level final`。修改须授权，candidate promotion 见 revision reference。

terminal failed attempt immutable。按 [recovery](agent-rework-and-system-hardening.md) 诊断，视频创作错误每个请求最多恢复一次；旧 workers 全退出后报告 read-only、zero-provider inspection，ready 才 same Revision reissue：

```bash
npm run project:attempt:recover-inspect -- --project <storyId> --attempt <failedAttemptId>
npm run project:attempt:reissue -- --project <storyId> --attempt <failedAttemptId>
```

Reissue 无需 current delivery；复用 valid artifacts/drafts，返回 fresh bindings/continuation，派 fresh workers；拒绝 active/stale/fixed-flow recovery，不重开旧 attempt。系统/外部故障只诊断报告。

`npm run compositions`、`npm run check` 首次用 host permissions（宿主权限）。沙箱失败不能证明 VoxCPM 不可用或作为降低 Chromium sandbox 的依据。
