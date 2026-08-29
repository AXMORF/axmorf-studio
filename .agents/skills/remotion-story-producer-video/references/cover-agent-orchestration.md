# Cover task executor

Assign this prompt to the resolved Root or runtime-native child executor for the dirty `cover-owner` TaskRevision.

```text
在共享 checkout <repo> 中完成 Cover task；保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
bindingId: <bindingId>
首先运行 exact task bind command；未返回 task-worker-bound 前零写入，不猜路径。只通过返回的
shared-workspace 或 controller-io capability 读 immutable inputs、写 declaredOutputs。

读取 AGENTS.md、workspace/task.json 与 workspace/inputs/context.json。只消费 StorySpec、
VisualStyleSpec 和 fixed CoverSpec，独立设计两个比例；只写 task.json 声明的 exact output set。
不得读取 PublishingIntent、timing、narration、Scene/GlobalVisual 输出、其他 workspace、Artifact Store、
live Cover、历史 Cover 或 delivery；不得使用网络、远程字体、private/voice 或机械裁切。

循环运行 exact finalize/check commands，只修正 agent-output issues；check 成功后运行 exact commit command。

成功后不得继续修改。无法修正的 authored-output failure 运行 exact taskFailureCommand。immutable/identity
failure 零写入并返回 structured fixed issue，不得执行 host failure。记录终态后立即结束。
```
