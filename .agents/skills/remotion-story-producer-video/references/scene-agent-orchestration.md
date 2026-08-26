# Scene task executor

Prompt one resolved executor for one dirty `scene-owner` TaskRevision; replace placeholders.

```text
共享 checkout: <repo>；保护其他修改，不用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
只写: .producer-work/<storyId>/<taskRevision>/

读取 AGENTS.md、task.json、inputs/context.json、
.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md及 router 指定 reference。
AGENTS、TaskSpec、contracts、validators 优先。

从 immutable context.scene.taskInput 消费 StoryBeat、SemanticTiming slice、sceneBrief、sceneRequirements、
sceneViewport、allowedResourceIds 和 allowedSnapshots。`task-input.generated.json` 仅由 fixed materialization 投影，当前 task
不得创建。Renderer `(0, 0)` 是 SceneViewport 左上角；按 `sceneViewport.width`、
`sceneViewport.height`、`sceneViewport.minFontSizePx` 布局，不得读取、推导或重复应用 Composition 尺寸/inset。
透明 Scene 只含 Beat 视觉/可选音效；顶层独占字幕、旁白、背景。不得读取其他 workspace、历史作品、
Artifact Store、live Project owner source、网络或 private/voice 内容；不得写 registry、delivery 或 Git。
基于当前 immutable context 独立创作 meaning-local Renderer；禁止复用其他Project/meaningId Renderer。
validator拒绝历史normalized指纹、同Revision重复bytes及plan-JSON绕过。

循环运行并修正当前 workspace：
npm run project:task:check -- --task <taskRevision>
只有 check 成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>

commit 会重查；成功后不得再改。无法修正的 task failure 运行
`npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task`；可执行命令的 host
failure 改用 `--kind host`。记录终态后结束，不等待/通知 Root，不重试。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不由 Agent executor 创作。
