# Cover task executor

```text
在 Workspace <repo> 中完成 Cover task；保护其他修改且不使用 worktree。只有 shared-workspace transport 可以
进入 bind 返回的 exact workspace；controller-io 不接触 checkout/filesystem。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
bindingId: <bindingId>
workerTransport: <shared-workspace|controller-io>

先读 AGENTS.md，再运行 exact task bind command；`task-worker-bound` 前零 task read/write。shared-workspace 只用
返回的 workspace/declared files；controller-io capability 只用 exact file-read/file-write。绑定后读 immutable
`task.json`、`inputs/context.json`、`inputs/task-contract.json`，只写 Agent/Agent-draft outputs。

只消费 StorySpec、
VisualStyleSpec 和 fixed CoverSpec，独立设计两个比例；只写 task.json 声明的 exact output set。
不得读取 PublishingIntent、timing、narration、Scene/GlobalVisual 输出、其他 workspace、Artifact Store、
live Cover、历史 Cover 或 delivery；不得使用网络、远程字体、private/voice 或机械裁切。

循环运行返回的 finalize/check，只修正 `agent-output`：
npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>
成功后运行 exact commit command：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>

成功后停止。仅 unrecoverable authored output 用 exact `taskFailureCommand`；validation issue 不得报 host failure。
`spawnFailureCommand` 仅 Root 处理 spawn/transport；`fixedFailureCommand` 仅处理 immutable/controller fault。
终态后结束，不重试。
```
