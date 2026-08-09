# Independent Scene thread orchestration

Create one user-visible Codex task with `create_thread` for every frozen meaningId. Do not use a
subagent or worktree. All tasks share the current checkout, so each prompt must state that other tasks
are editing disjoint paths and that their work must be preserved.

## Self-contained prompt

Include the actual values for every placeholder:

The Scene owner must read and use repository-local
`.agents/skills/remotion-best-practices/SKILL.md` completely, then read
`.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md` and any renderer-specific references
selected by that router.

```text
在共享 checkout <repo> 中完成 Scene owner 工作。你不是唯一工作线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
meaningId: <meaningId>
assignment: <assignmentPath>
唯一可写目录:
- <sceneRoot>
- <publicAssetRoot>

先完整读取根 AGENTS.md、assignment、.agents/skills/remotion-best-practices/SKILL.md 和
.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md，再按 Renderer 需要读取 router
指定的 references。AGENTS、assignment、contracts、validators 优先。

只 author 当前 Beat 的透明 Scene 视觉和可选 Scene-local sound。不得读取历史 Scene/Composition/
still，或其他 owner 输出；不得写字幕、旁白、全局背景、共享 registry/catalog、Run state/event/result。
不得 bootstrap、production submit、delivery build、Git stage/commit、创建嵌套 Agent。

完成 authoring 后只运行：
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

The root only confirms that `create_thread` returned successfully. It does not read the task, wait for
it, audit its files, or submit its result. A missing receipt has no timeout. Another independent task
may later process the same immutable assignment; the watcher accepts the first identity-consistent
receipt and does not store task identity.
