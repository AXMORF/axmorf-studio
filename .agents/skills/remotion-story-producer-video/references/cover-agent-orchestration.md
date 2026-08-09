# Independent Cover thread orchestration

Create exactly one user-visible Codex task with `create_thread`, sharing the checkout. Cover is consumed
by the detached watcher: it does not block production render-ready, but it blocks automatic delivery.

```text
在共享 checkout <repo> 中完成 Cover owner 工作。你不是唯一工作线程，不得覆盖其他线程修改。

runId: <runId>
storyId: <storyId>
assignment: <coverAssignmentPath>
唯一可写目录: <coverSourceDirectory>

只读取根 AGENTS.md 和 CoverAssignment 内嵌的 StorySpec、VisualStyleSpec、fixed CoverSpec。不得读取
PublishingIntent、timing、narration、Scene/GlobalVisual 输出、历史 Cover 或 delivery。

只 author Cover4x3.tsx、Cover3x4.tsx、Root.tsx、index.ts。两个比例独立 code-only，不用图片、视频、
音频、网络、远程字体或机械裁切。不得写 results、Run state/event/result，不得 bootstrap、Cover
submit、delivery build、Git stage/commit、创建嵌套 Agent。

完成 authoring 后只运行：
npm run production:owner:ready -- --run <runId> --owner cover

若 assignment 明确无法完成，只运行一次：
npm run production:owner:failed -- --run <runId> --owner cover --code <SAFE_CODE> --description "<safe description>"

receipt 发布后立即结束，不等待 watcher。
```

Only after production is render-ready, the watcher performs the real Cover render/check/seal serially.
Root never runs Cover check or submit, and a Cover failure never changes production to failed.
