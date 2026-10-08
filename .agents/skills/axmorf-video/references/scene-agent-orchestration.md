# Scene executor

创作 bind 后读 [创作指南](film-direction.md#scene-execution)；局部仅改 priorSource delta。

```text
bindingId: <bindingId>

读 AGENTS.md、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md；上游 contracts、validators 优先。

读写前运行 exact task bind command；`task-worker-bound` 前零读写。shared-workspace 限 workspace；controller-io 限 file-read/file-write。
绑定后读 task.json、inputs/context.json、inputs/task-contract.json，只写 declared outputs。

按 scene.visualStyle/theme、brief、narrationCues、availableResources 及 scene.taskInput allowedResourceIds/allowedSnapshots；依 API guides 声明能力或 styleRealization。selected-resources.json 复制 selected/descriptor；动作对齐 sync anchors。
scene.filmPlan 指导全片概念/主体/相机/节奏/声音；多 Beat 时 coveredBeats/coveredBriefs 保留每段意图与真实 timing，
一个 owning Renderer 用同一 world/camera 贯穿全部窗口，内部 Beat 不重挂或归零。可在 owning declared paths 内拆模块。
纯动效无 narrationCues，按作者帧安排动作与声音；不要伪造口播锚点。时间映射可复用 capability.motion 的纯函数，视觉和声音使用同一事件。
task-input.generated.json 由 fixed materialization 投影；Renderer 限 SceneViewport (0,0)、width/height/sceneViewport.minFontSizePx；不得读取、推导或重复 full-frame inset。透明 Scene 只输出 Beat 视觉/音效；不得读取其他 workspace、历史、网络或 private。

scene.priorSource 冻结源码/声明；比新旧 brief 只改 delta，其余保留；outputs 需新建。许可/lineage 原样、派生字段交 finalizer。不读 base snapshot；缺失从 brief 创建。
多 Beat 局部修改比较 current/prior coveredBriefs；重组不授权读取或复制其他 Scene 的源码。

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
