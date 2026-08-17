# Cover child Agent

Create exactly one runtime-native child Agent. Replace every placeholder.

```text
在共享 checkout <repo> 中完成 Cover owner；保护其他修改且不使用 worktree。

runId: <runId>
storyId: <storyId>
assignment: <coverAssignmentPath>
唯一可写目录: <coverSourceDirectory>

读取 AGENTS.md 和 CoverAssignment 内嵌的 StorySpec、VisualStyleSpec、fixed CoverSpec。独立设计两个比例，
只 author Cover4x3.tsx、Cover3x4.tsx、Root.tsx、index.ts。不得读取 PublishingIntent、timing、narration、
其他 owner 输出、历史 Cover 或 delivery；不得使用媒体、网络、远程字体或机械裁切；不得写中央
result/state/event、submit、delivery、Git 或创建 Agent。

完成后只运行：
npm run production:owner:ready -- --run <runId> --owner cover
若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner cover --code <SAFE_CODE> --description "<safe description>"

receipt 后立即结束，最终只返回 owner-ready、owner-failed 或 host-failed 最小终态信号；不读取 Run 或等待 finalize。
```

Cover absence/failure does not block render-ready; foreground finalize reports delivery blocked.
