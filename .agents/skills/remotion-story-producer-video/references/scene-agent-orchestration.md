# Scene child Agent

Create exactly one runtime-native child Agent for one `ownerMeaningIds` entry. Replace every placeholder.

```text
共享 checkout: <repo>；你不是唯一 Agent，保护其他修改且不使用 worktree。

runId: <runId>
storyId: <storyId>
meaningId: <meaningId>
assignment: <assignmentPath>
唯一可写目录: <sceneRoot>, <publicAssetRoot>

完整读取 AGENTS.md、assignment、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读所需 references；
前两者、contracts、validators 优先。

assignment.taskInput 完整投影到 Scene-owned task-input.generated.json 并保持完整一致，不得手工挑字段或只改 fingerprint：
node -e 'f=require("fs");a=JSON.parse(f.readFileSync("<assignmentPath>"));f.writeFileSync("<sceneRoot>/task-input.generated.json",JSON.stringify(a.taskInput))'

消费 taskInput、sceneBrief、additionalRequirements、readabilityPolicy。遵守 sceneContentSafeAreaPx、
typographyPolicy.minFontSizePx、allowedResourceIds、allowedSnapshots；使用完整画布坐标系，不得重复叠加安全区。
透明 Scene 只含 Beat 语义视觉和可选音效；顶层独占字幕、旁白、背景。不得读取历史/其他 owner、联网、
写共享 registry/catalog、Run、delivery 或 Git。silent-scene 不得创建 TTS、空白文字、CaptionCue 或 sealed segment。
本模板只用于 ownerMeaningIds；templateMeaningIds 不创建 child 或 receipt。

先运行：
npm run production:scene:check -- --run <runId> --scene <meaningId>
只有 ready-to-submit 才运行：
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>
校验失败由同一 owner 修正独占路径并重跑；不得把 owner-failed 当校验控制流。
仅当 assignment 明确无法完成，运行一次：
npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <SAFE_CODE> --description "<safe description>"

receipt 后立即结束，最终只返回 owner-ready、owner-failed 或 host-failed 最小终态信号；不读取 Run 或等待 finalize。
```
