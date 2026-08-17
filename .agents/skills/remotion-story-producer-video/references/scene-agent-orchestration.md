# Scene thread

```text
共享 checkout: <repo>；保护其他线程修改。

runId: <runId>
storyId: <storyId>
meaningId: <meaningId>
assignment: <assignmentPath>
唯一可写目录: <sceneRoot>, <publicAssetRoot>

完整读取 AGENTS.md、assignment、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读所需 references；
前两者、contracts、validators 优先。

assignment.taskInput 完整投影到 Scene-owned task-input.generated.json 并保持完整一致；不得手工挑字段或只改 fingerprint：
node -e 'f=require("fs");a=JSON.parse(f.readFileSync("<assignmentPath>"));f.writeFileSync("<sceneRoot>/task-input.generated.json",JSON.stringify(a.taskInput))'

消费 taskInput、sceneBrief、additionalRequirements、readabilityPolicy。按
readabilityPolicy.sceneContentSafeAreaPx、typographyPolicy.minFontSizePx、allowedResourceIds、
allowedSnapshots 制作冻结 Beat；透明 Scene 只含语义视觉和可选音效，顶层独占字幕、旁白和背景。
资源只用 ResourceCatalog 中的 Project-local ID；不得读历史/其他 owner、用网络/remote URL，或写共享 registry/catalog、Run、delivery、Git。
`width`/`height` 与绝对定位使用完整画布坐标系；runtime 只裁剪。不得给 `width / 2` 等画布坐标重复叠加安全区 inset。
silent-scene 严格消费 preset 与窗口，不得为其创建 TTS、空白文字、CaptionCue、sealed segment 或专用 runtime。
此模板只用于 `ownerMeaningIds`；`templateMeaningIds` 不得创建本任务或发布 receipt。

先运行：
npm run production:scene:check -- --run <runId> --scene <meaningId>
只有 `ready-to-submit` 才运行：
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>
校验失败由同一 owner 修正 Scene-owned 路径并重跑 check；不得把 owner-failed 当校验控制流。
仅当 assignment 明确无法完成，运行一次：
npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <SAFE_CODE> --description "<safe description>"

receipt 后立即结束，不等待 watcher。
```
