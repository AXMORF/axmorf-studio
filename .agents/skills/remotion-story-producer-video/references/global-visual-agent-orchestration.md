# Independent GlobalVisual thread orchestration

Create exactly one user-visible Codex task with `create_thread`, sharing the current checkout without a
worktree. Provide the frozen assignment path and its three exclusive paths.

```text
在共享 checkout <repo> 中完成 GlobalVisual owner 工作。你不是唯一工作线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
assignment: <globalVisualAssignmentPath>
只读冻结输入:
- <storyPath>
- <semanticTimingPath>
- <visualStylePath>
- <requirementsPath>
唯一可写路径:
- <planPath>
- <sourceDirectory>
- <publicDirectory>

读取根 AGENTS.md、assignment 和 current Story/timing/VisualStyleSpec。制作与 current
VisualStyleSpec 对齐的 simplest full-frame background board, aligned with the current VisualStyleSpec.
Unless the frozen brief requires it, it must not invent decoration, continuity motifs, or Beat-specific
changes。不得读取 Scene 输出、字幕、旁白、历史
Composition/still；不得写共享 registry/catalog、Run state/event/result。

GlobalVisualLayers 必须是 no-Props、无可见文字/音频/Scene DSL/automatic director，并只使用 Remotion
frame APIs。不得 bootstrap、production submit、delivery build、Git stage/commit、创建嵌套 Agent。

完成 authoring 后只运行：
npm run production:owner:ready -- --run <runId> --owner global-visual

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner global-visual --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

Root confirms only the `create_thread` call. Missing receipt remains waiting without timeout or retry.
