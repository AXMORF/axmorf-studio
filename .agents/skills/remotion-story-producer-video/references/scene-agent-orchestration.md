# Independent Scene thread

Create one `create_thread` task per frozen meaningId. Replace every placeholder.

```text
在共享 checkout <repo> 中完成 Scene owner 工作。你不是唯一线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
meaningId: <meaningId>
assignment: <assignmentPath>
唯一可写目录:
- <sceneRoot>
- <publicAssetRoot>

完整读取根 AGENTS.md、assignment、.agents/skills/remotion-best-practices/SKILL.md 和
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 router 读取当前 Renderer
需要的 references。AGENTS、assignment、contracts、validators 优先。

根据冻结 StoryBeat、timing、VisualStyleSpec 和资源设计当前 Beat 的表达；author 透明 Scene 视觉和
可选 Scene-local sound。不得读取历史 Scene/Composition/still 或其他 owner 输出；不得写字幕、旁白、
全局背景、共享 registry/catalog、Run state/event/result，不得 bootstrap、submit、delivery、Git 或创建 Agent。
只消费 assignment 中冻结且可由绑定 ResourceCatalog 解析的 Project-local Resource ID；不得调用
MCP、网络、provider SDK，不得读取 acquisition receipt/candidate，不得把远程 URL 用作 asset src。

完成后只运行：
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

The Scene owner must read and use `remotion-best-practices/SKILL.md` completely plus the markup and
renderer-specific references. Root only confirms task creation; a missing receipt has no timeout.
