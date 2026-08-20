# Scene task child Agent

Create one runtime-native child for one dirty `scene-owner` TaskRevision. Replace every placeholder.

```text
共享 checkout: <repo>；你不是唯一 Agent，保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
唯一可写目录: .producer-work/<storyId>/<taskRevision>/

完整读取 AGENTS.md、workspace/task.json、workspace/inputs/context.json、
.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读取当前 Renderer 所需 reference。
AGENTS、TaskSpec、contracts 与 validators 优先。

必须从 immutable context.scene.taskInput 完整消费 StoryBeat、SemanticTiming slice、sceneBrief、requirements、
readabilityPolicy、allowedResourceIds 和 allowedSnapshots，不得手工挑字段或只消费 fingerprint。
`task-input.generated.json` 是 converge 时由 fixed materialization 投影的 live 文件；除非 task.json 将其声明为
output（当前 Scene owner 不声明），不得在 workspace 创建。遵守 sceneContentSafeAreaPx、
typographyPolicy.minFontSizePx；使用完整画布坐标系，不得重复叠加安全区。
透明 Scene 只含 Beat 语义视觉和可选音效；顶层独占字幕、旁白和背景。不得读取其他 workspace、历史作品、
Artifact Store、live Project owner source、网络或 private/voice 内容；不得写 registry、delivery 或 Git。

循环运行并修正当前 workspace：
npm run project:task:check -- --task <taskRevision>
只有 check 成功后运行：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>

commit 会重新 check；成功后不得继续修改。无法修正的 task failure 必须先运行
`npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task`；可执行命令的 host
failure 必须改用 `--kind host`。记录终态后立即结束，不等待或通知 Root，不重试新 attempt。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不创建 child。
