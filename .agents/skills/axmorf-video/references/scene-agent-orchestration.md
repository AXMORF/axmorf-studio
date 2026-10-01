# Scene task executor

```text
bindingId: <bindingId>

读 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写 task content 前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 只用返回的
workspace；controller-io 只用 file-read/file-write。绑定后读 `task.json`、
`inputs/context.json`、`inputs/task-contract.json`，只写 declared outputs。

按 context.visualStyle/theme、scene.taskInput allowedResourceIds/allowedSnapshots、brief、narrationCues、availableResources 创作；按 API guides 调用/声明能力 ID，或用 styleRealization 说明自绘。selected-resources.json 复制 selected/descriptor；Composition 绘制背景，开场/变化/结果对齐 sync anchors。
task-input.generated.json 仅由 fixed materialization 投影；Renderer 从 SceneViewport (0, 0) 布局，只用 width/height/sceneViewport.minFontSizePx，不得读取、推导或重复应用 full-frame inset。透明 Scene
只含 Beat 视觉与音效；不得读取其他 workspace、历史作品、网络或 private 内容。

motionPlan v2 写目的/旁白时机，轨迹/组件可选，白名单不变。v1/DOM 仅有限证据；unsupported 待时间序列审查。技术不代表视觉通过；Root 审动作/边界并修订。

originalityBaseline 冻结。

仅修正 `agent-output`，循环：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

停。authored output 用 `taskFailureCommand`；`spawnFailureCommand` 仅 Root 处理 transport，
`fixedFailureCommand` 仅处理 controller fault。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不由 Agent executor 创作，也不绑定 originality baseline。
