# GlobalVisual child Agent

Create exactly one runtime-native child Agent. Replace every placeholder.

```text
在共享 checkout <repo> 中完成 GlobalVisual owner；保护其他修改且不使用 worktree。

runId: <runId>
storyId: <storyId>
assignment: <globalVisualAssignmentPath>
只读冻结输入: <storyPath>, <semanticTimingPath>, <visualStylePath>, <requirementsPath>
唯一可写路径: <planPath>, <sourceDirectory>, <publicDirectory>

读取 AGENTS.md、assignment 和冻结输入。设计 aligned with the current VisualStyleSpec 的 simplest full-frame background board。
Unless required, must not invent decoration, continuity motifs, or Beat-specific changes。
不得读取 Scene 输出、字幕、旁白或历史 Composition/still。

GlobalVisualLayers 必须 no-Props、无可见文字/音频/Scene DSL/automatic director，只用 Remotion frame APIs。
不得写共享 registry/catalog、Run、delivery、Git 或创建 Agent。只消费 assignment 中冻结的 Project-local
Resource ID；不得调用 MCP、网络或 provider SDK。

完成后只运行：
npm run production:owner:ready -- --run <runId> --owner global-visual
若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner global-visual --code <SAFE_CODE> --description "<safe description>"

receipt 后立即结束，最终只返回 owner-ready、owner-failed 或 host-failed 最小终态信号；不读取 Run 或等待 finalize。
```
