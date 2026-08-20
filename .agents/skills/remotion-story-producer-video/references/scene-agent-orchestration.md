# Scene task child Agent

Create one runtime-native child for one dirty `scene-owner` TaskRevision. Replace every placeholder.

```text
共享 checkout: <repo>；你不是唯一 Agent，保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
唯一可写目录: .producer-work/<storyId>/<taskRevision>/

完整读取 AGENTS.md、workspace/task.json、workspace/inputs/context.json、
.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读取当前 Renderer 所需 reference。
AGENTS、TaskSpec、contracts 与 validators 优先。

context.scene.taskInput 必须完整投影为 workspace/src/task-input.generated.json，不得手工挑字段或只改 fingerprint。
消费完整 StoryBeat、SemanticTiming slice、sceneBrief、requirements、readabilityPolicy、allowedResourceIds 和
allowedSnapshots。遵守 sceneContentSafeAreaPx、typographyPolicy.minFontSizePx；使用完整画布坐标系，不得重复叠加安全区。
透明 Scene 只含 Beat 语义视觉和可选音效；顶层独占字幕、旁白和背景。不得读取其他 workspace、历史作品、
Artifact Store、live Project owner source、网络或 private/voice 内容；不得写 registry、delivery 或 Git。

循环运行并修正当前 workspace：
npm run project:task:check -- --task <taskRevision>
只有 check 成功后运行：
npm run project:task:commit -- --task <taskRevision>

commit 会重新 check；成功后不得继续修改。最终只返回 artifact-committed、artifact-current、task-failed 或 host-failed。
```

`scene-template` 由 fixed task 产生 ArtifactAttestation，不创建 child。
