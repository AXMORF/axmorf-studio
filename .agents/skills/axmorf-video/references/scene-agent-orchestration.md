# Scene task executor

```text
bindingId: <bindingId>

先完整读取 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写 task content 前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 只用返回的
workspace；controller-io 只用 file-read/file-write。绑定后读 `task.json`、
`inputs/context.json`、`inputs/task-contract.json`，只写 declared outputs。

读取 context.visualStyle；有 theme 时文字与强调色使用其语义角色，背景由 Composition 绘制。完整消费 scene.taskInput（allowedResourceIds/allowedSnapshots）、brief、visualStyle、narrationCues 与 availableResources；评估 API guides 后选能力，或在 styleRealization 说明自绘理由。选用能力必须调用/挂载并声明 ID，selected-resources.json 复制 selected/descriptor。按旁白设计开场、变化、结果，替换 Renderer 并对齐 sync anchors。
task-input.generated.json 仅由 fixed materialization 投影；Renderer 从 SceneViewport (0, 0) 布局，只用 width/height/sceneViewport.minFontSizePx，不得读取、推导或重复应用 full-frame inset。透明 Scene
只含 Beat 视觉与音效；不得读取其他 workspace、历史作品、网络或 private 内容。

originalityBaseline 冻结，检查 TS/TSX graph。

循环运行并仅修正 `agent-output`：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

成功即停。authored output 用 `taskFailureCommand`；`spawnFailureCommand` 仅 Root 处理 transport，
`fixedFailureCommand` 仅处理 controller fault。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不由 Agent executor 创作，也不绑定 originality baseline。
