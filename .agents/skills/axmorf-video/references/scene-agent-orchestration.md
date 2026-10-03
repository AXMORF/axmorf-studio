# Scene task executor

```text
bindingId: <bindingId>

读 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 限 workspace；controller-io 限 file-read/file-write。
绑定后读 task.json、inputs/context.json、inputs/task-contract.json，只写 declared outputs。

按 scene.visualStyle/theme、brief、narrationCues、availableResources 及 scene.taskInput allowedResourceIds/allowedSnapshots；依 API guides 声明能力或 styleRealization。selected-resources.json 复制 selected/descriptor；动作对齐 sync anchors。
task-input.generated.json 由 fixed materialization 投影；Renderer 限 SceneViewport (0,0)、width/height/sceneViewport.minFontSizePx；不得读取、推导或重复 full-frame inset。透明 Scene 只输出 Beat 视觉/音效；不得读取其他 workspace、历史、网络或 private。

scene.priorSource 冻结源码/声明；比新旧 brief 只改 delta，其余保留；outputs 需新建。许可/lineage 原样、派生字段交 finalizer。不读 base snapshot；缺失从 brief 创建。

共享SVG依合同同绘、连续接近/离开并审阅。

sound-plan.json 限预制 sound-effect，按 description 卡点；完整音效须在 Scene 内，Renderer 不重复播放。禁止合成/下载音频。

motionPlan v2 写目的/旁白或 visual authored event 时机；unsupported 须时序审查。

originalityBaseline 冻结。

仅修正 `agent-output`，循环：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

停：taskFailureCommand 报 authored fault；spawnFailureCommand 限 Root transport，fixedFailureCommand 限 controller fault。
```

`scene-template` fixed 产出 ArtifactAttestation，不由 Agent executor 创作，不绑定 originality baseline。
