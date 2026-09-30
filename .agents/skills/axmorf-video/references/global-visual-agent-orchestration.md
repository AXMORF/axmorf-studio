# GlobalVisual task executor

```text
完成 GlobalVisual task；保护其他修改。shared-workspace 仅访问 bind workspace；controller-io 仅使用授权 I/O。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
bindingId: <bindingId>
workerTransport: <shared-workspace|controller-io>

先读 AGENTS.md，运行 exact task bind command；`task-worker-bound` 前零 task read/write。绑定后读取 immutable
`task.json`、`inputs/context.json`、`inputs/task-contract.json`，仅按绑定能力写 Agent/Agent-draft outputs。

`layerPolicy` 是 fixed authority。读 current VisualStyleSpec；有 theme 时 base 直接返回 null，Composition 绘制背景并在正文后方限 8% group opacity 合成装饰。legacy 无 theme 才设计 simplest full-frame base；unless required, must not invent decoration or continuity motifs。

同一个 `src/GlobalVisualLayers.tsx` 必须恰好导出 no-Props 的 `GlobalVisualBaseLayer` 与
`GlobalVisualDecorationLayers`。base 只提供全片稳定底板；decoration 只面向 `decorationFrameRange`。`useCurrentFrame`
必须从`remotion`直接import/call（禁止shadow/proxy），从窗口 local frame 0 开始。除 themed null base 外，returned root只用intrinsic或
Remotion `AbsoluteFill`，且inline style恰好一个`pointerEvents: none`、无spread；不得拥有可见文字、caption、
音频、Scene DSL。JSX child仅允许可证明非文字的element/fragment、null/boolean、条件及array。continuity windows 不越出 decoration range。不得读取 Scene 输出、其他 workspace、
Artifact Store、live owner source、历史媒体、网络、private/voice、delivery 或 Git。

循环运行返回的 finalize/check，只修正 `agent-output`：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行 exact commit command：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

终态后停止，不重试。`taskFailureCommand` 仅 authored fault，`spawnFailureCommand` 仅 Root spawn/transport，
`fixedFailureCommand` 仅 immutable/controller fault；校验问题不冒充 host failure。
```
