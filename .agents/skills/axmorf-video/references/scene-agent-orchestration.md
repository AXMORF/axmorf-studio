# Scene task executor

```text
bindingId: <bindingId>

先完整读取 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

任何 task content 读写前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 只用返回的
workspace/declared files；controller-io 只用 file-read/file-write。绑定后读 `task.json`、
`inputs/context.json`、`inputs/task-contract.json`，只写 declared outputs。

读取 `context.visualStyle`；有 theme 时主文字、次文字与强调色使用其语义角色，背景由 Composition 绘制，不能再加整片底板。
完整消费 context.scene.taskInput 的 StoryBeat/timing/brief/requirements、sceneViewport、allowedResourceIds、
allowedSnapshots。`task-input.generated.json` 仅由 fixed materialization 投影。Renderer 从 SceneViewport `(0, 0)`
布局，只用 width/height/sceneViewport.minFontSizePx，不得读取、推导或重复应用 full-frame inset。透明 Scene
只含 Beat 视觉与音效；不得读取其他 workspace、历史作品、live source、网络或 private 内容。

`context.originalityBaseline` 是冻结 evidence；validator 检查全部 declared TS/TSX graph。

循环运行并仅修正 `agent-output`：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

成功即停。仅 authored output 用 `taskFailureCommand`；`spawnFailureCommand` 仅 Root 处理 transport，
`fixedFailureCommand` 仅处理 controller fault。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不由 Agent executor 创作，也不绑定 originality baseline。
