# Independent Cover thread

Create exactly one `create_thread` task. Replace every placeholder.

```text
在共享 checkout <repo> 中完成 Cover owner 工作。你不是唯一线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
assignment: <coverAssignmentPath>
唯一可写目录: <coverSourceDirectory>

读取根 AGENTS.md 和 CoverAssignment 内嵌的 StorySpec、VisualStyleSpec、fixed CoverSpec。独立设计两个
比例的封面表达，只 author Cover4x3.tsx、Cover3x4.tsx、Root.tsx、index.ts。不得读取 PublishingIntent、
timing、narration、其他 owner 输出、历史 Cover 或 delivery；不得使用媒体、网络、远程字体或机械裁切；
不得写中央结果/state/event，不得 bootstrap、submit、delivery、Git 或创建 Agent。

完成后只运行：
npm run production:owner:ready -- --run <runId> --owner cover

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner cover --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

Cover absence/failure does not block production render-ready but does block automatic delivery. Root
only confirms task creation; the watcher later renders and seals Cover.
