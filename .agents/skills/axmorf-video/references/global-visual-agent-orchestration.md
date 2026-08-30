# GlobalVisual task executor

```text
在 Workspace <repo> 中完成 GlobalVisual task；保护其他修改且不使用 worktree。只有 shared-workspace transport
可以进入 bind 返回的 exact workspace；controller-io 不接触 checkout/filesystem。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
bindingId: <bindingId>
workerTransport: <shared-workspace|controller-io>

先读 AGENTS.md，再运行 exact task bind command；`task-worker-bound` 前零 task read/write。shared-workspace 只用
返回的 workspace/declared files；controller-io capability 只用 exact file-read/file-write。绑定后读 immutable
`task.json`、`inputs/context.json`、`inputs/task-contract.json`，只写 Agent/Agent-draft outputs。

`layerPolicy` 是 SemanticTiming 派生的
fixed authority。按 current VisualStyleSpec 设计 simplest full-frame base；unless required, must not invent
decoration or continuity motifs。

同一个 `src/GlobalVisualLayers.tsx` 必须恰好导出 no-Props 的 `GlobalVisualBaseLayer` 与
`GlobalVisualDecorationLayers`。base 只提供全片稳定底板；decoration 只面向 `decorationFrameRange`。`useCurrentFrame`
必须从`remotion`直接import/call（禁止shadow/proxy），从窗口 local frame 0 开始。二者returned root只用intrinsic或
Remotion `AbsoluteFill`，且inline style恰好一个`pointerEvents: none`、无spread；不得拥有可见文字、caption、
音频、Scene DSL 或 automatic director。JSX child仅允许机械非文字形状（element/fragment、`null`/boolean、安全
conditional及其array）；identifier/call/template/string/number一律拒绝。continuity windows 必须位于 decoration range。不得读取 Scene 输出、其他 workspace、
Artifact Store、live owner source、历史媒体、网络、private/voice、delivery 或 Git。

循环运行返回的 finalize/check，只修正 `agent-output`：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行 exact commit command：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

成功后停止。仅 unrecoverable authored output 用 exact `taskFailureCommand`；validation issue 不得报 host failure。
`spawnFailureCommand` 仅 Root 处理 spawn/transport；`fixedFailureCommand` 仅处理 immutable/controller fault。
终态后结束，不重试。
```
