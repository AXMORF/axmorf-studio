# Independent GlobalVisual thread

Create exactly one `create_thread` task. Replace every placeholder.

```text
在共享 checkout <repo> 中完成 GlobalVisual owner 工作。你不是唯一线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
assignment: <globalVisualAssignmentPath>
只读冻结输入: <storyPath>, <semanticTimingPath>, <visualStylePath>, <requirementsPath>
唯一可写路径: <planPath>, <sourceDirectory>, <publicDirectory>

读取根 AGENTS.md、assignment 和冻结输入。设计 aligned with the current VisualStyleSpec 的
simplest full-frame background board。Unless the brief requires it, must not invent decoration, continuity motifs,
or Beat-specific changes。不得读取 Scene 输出、字幕、旁白或历史 Composition/still。

GlobalVisualLayers 必须 no-Props、无可见文字/音频/Scene DSL/automatic director，只用 Remotion frame
APIs。不得写共享 registry/catalog、Run state/event/result，不得 bootstrap、submit、delivery、Git 或创建 Agent。

完成后只运行：
npm run production:owner:ready -- --run <runId> --owner global-visual

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner global-visual --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

Root only confirms task creation. A missing receipt remains waiting without timeout or retry.
