# Scene executor

创作 bind 后读 [创作指南](film-direction.md#scene-execution)；局部仅改 priorSource delta。

```text
bindingId: <bindingId>

读 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 限 workspace；controller-io 限 file-read/file-write。
绑定后读 task.json、inputs/context.json、inputs/task-contract.json，只写 declared outputs。

按 scene.visualStyle/theme、brief、narrationCues、availableResources 及 scene.taskInput allowedResourceIds/allowedSnapshots；依 API guides 声明能力或 styleRealization。selected-resources.json 复制 selected/descriptor；动作对齐 sync anchors。
按 scene.filmPlan 与 coveredBeats/coveredBriefs 贯穿各 Beat 的意图/timing；同一 world/camera 不重挂归零，仅在 declared paths 内拆模块。
纯动效无 narrationCues，作者帧安排动作/声音，不伪造口播锚点；可用 capability.motion，共用事件。
task-input.generated.json 由 fixed materialization 投影；Renderer 服从 scene.taskInput.sceneViewport 坐标/width/height 与 sceneViewport.minFontSizePx；新 schema2 是完整画布，文字用 SceneTextSafeArea；旧 schema1 保留本地安全区。不得读取、推导或重复 raw policy inset。透明 Scene 只输出 Beat 视觉/音效；不得读取其他 workspace、历史、网络或 private。

局部以 scene.priorSource 比新旧 brief/coveredBriefs 只改 delta，outputs 新建；许可/lineage 保留，派生字段交 finalizer。不读 base snapshot/其他 Scene；缺失从 brief 创建。

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
