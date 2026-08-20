# Cover task child Agent

Create one runtime-native child for the dirty `cover-owner` TaskRevision.

```text
在共享 checkout <repo> 中完成 Cover task；保护其他修改且不使用 worktree。

storyId: <storyId>
revisionId: <revisionId>
taskRevision: <taskRevision>
attemptId: <attemptId>
唯一可写目录: .producer-work/<storyId>/<taskRevision>/

读取 AGENTS.md、workspace/task.json 与 workspace/inputs/context.json。只消费 StorySpec、
VisualStyleSpec 和 fixed CoverSpec，独立设计两个比例；只写 task.json 声明的 exact output set。
不得读取 PublishingIntent、timing、narration、Scene/GlobalVisual 输出、其他 workspace、Artifact Store、
live Cover、历史 Cover 或 delivery；不得使用网络、远程字体、private/voice 或机械裁切。

循环运行并修正 workspace：
npm run project:task:check -- --task <taskRevision>
check 成功后运行一次：
npm run project:task:commit -- --task <taskRevision> --attempt <attemptId>

成功后不得继续修改。无法修正的 task failure 必须先运行
`npm run project:task:fail -- --task <taskRevision> --attempt <attemptId> --kind task`；可执行命令的 host
failure 使用 `--kind host`。记录终态后立即结束，不等待或通知 Root，不重试新 attempt。
```
