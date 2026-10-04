# Scene executor

```text
bindingId: <bindingId>

读 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 限 workspace；controller-io 限 file-read/file-write。
绑定后读 task.json、inputs/context.json、inputs/task-contract.json，只写 declared outputs。

按 scene.visualStyle/theme、brief、narrationCues、availableResources 与 scene.taskInput allowedResourceIds/allowedSnapshots；API guides 指导能力/styleRealization，selected-resources.json 复制 selected/descriptor。
task-input.generated.json 由 fixed materialization 投影；Renderer 限 sceneViewport (0,0)/width/height/sceneViewport.minFontSizePx；不得读取、推导或重复 full-frame inset。透明 Scene 无字幕/旁白；不得读取其他 workspace、历史、网络或 private。

scene.priorSource 为冻结源码/声明；只改 brief delta，其余及许可/lineage 保留。新建 outputs，派生字段交 finalizer；不读 base snapshot，缺失从 brief 创建。

共享SVG依合同同绘、连续接近/离开并审阅。

编排全貌/近景/大字；语义粒子/形变引导转场，读停不填满时长。

sound-plan.json 限预制 sound-effect，起音/声势中心对齐 syncAnchor；素材完整在 Scene 内，禁止合成/下载/重复播放。
Scene preview 不含顶层 BGM，最终合审音乐/旁白/音效。

motionPlan v2 写目的/事件时机；unsupported 须时序审查。

originalityBaseline 冻结。

仅修正 `agent-output`，循环：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

停：taskFailureCommand 限 authored fault；spawnFailureCommand 限 Root transport；fixedFailureCommand 限 controller fault。
```

`scene-template` fixed 产出 ArtifactAttestation，不由 Agent executor 创作，不绑定 originality baseline。
