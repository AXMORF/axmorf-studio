# Scene thread

```text
共享 checkout: <repo>；保护其他线程修改。

runId: <runId>
storyId: <storyId>
meaningId: <meaningId>
assignment: <assignmentPath>
唯一可写目录: <sceneRoot>, <publicAssetRoot>

完整读取根 AGENTS.md、assignment、.agents/skills/remotion-best-practices/SKILL.md、
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读取 Renderer references；
AGENTS、assignment、contracts、validators 优先。

assignment.taskInput 完整投影到 Scene-owned task-input.generated.json，保持
完整一致；不得手工挑字段或只改 fingerprint：
node -e 'f=require("fs");a=JSON.parse(f.readFileSync("<assignmentPath>"));f.writeFileSync("<sceneRoot>/task-input.generated.json",JSON.stringify(a.taskInput))'

消费 taskInput、sceneBrief、additionalRequirements、readabilityPolicy。按
readabilityPolicy.sceneContentSafeAreaPx、typographyPolicy.minFontSizePx、allowedResourceIds、
allowedSnapshots 制作冻结 Beat；author 透明 Scene root，只含语义视觉和可选 Scene-local sound，顶层独占字幕、
旁白和背景。资源限绑定 ResourceCatalog 可解析的 Project-local ID。不得读历史/其他 owner 输出，不得用
MCP、网络、provider/remote URL，不得写共享 registry/catalog、Run result/state/event、delivery 或 Git。
silent-scene 严格消费 preset 与已解析窗口，不创建 TTS、空白文字、CaptionCue、sealed segment 或
专用 runtime。此模板只用于 `ownerMeaningIds`；`templateMeaningIds` 不得创建本任务或发布 receipt。

先运行：
npm run production:scene:check -- --run <runId> --scene <meaningId>
只有 `ready-to-submit` 才运行：
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>
校验失败由同一 owner 修正 Scene-owned 路径并重跑 check；不得把 owner-failed 当校验控制流。
仅当 assignment 明确无法完成，运行一次：
npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <SAFE_CODE> --description "<safe description>"

receipt 后立即结束，不等待 watcher。
```
