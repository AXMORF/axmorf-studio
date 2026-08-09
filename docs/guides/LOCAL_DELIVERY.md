# 自动本地交付指南

> 文档类型：操作指南
>
> 最后复核：2026-08-10
>
> 适用范围：current Project 已有 current PublishingIntent、ProductionRenderPlan、
> ProductionRenderReady 和 immutable CoverResult。

自动交付准备一个不可覆盖的非 MP4 package，并发起 detached Remotion render。成功终点是
`delivery-render-started`，只表示操作系统确认 child 已 spawn，不表示渲染完成。

## 独立 Cover 生命周期

主 Agent 在 VisualStyleSpec current 后执行：

```bash
npm run delivery:cover:freeze -- --project <storyId>
```

CoverAssignment 只嵌入 current StorySpec、VisualStyleSpec 和固定 CoverSpec。独立 owner 在
`src/projects/<storyId>/delivery/cover/` 制作 1600×1200 和 1200×1600 两个纯代码 Composition，
不得读取 PublishingIntent、SemanticTiming、Scene/GlobalVisual 输出、FinalAssembly、历史封面
或已有 deliveries。

```bash
npm run delivery:cover:check -- --project <storyId>
npm run delivery:cover:submit -- --project <storyId>
```

check 真实渲染临时全尺寸 PNG 并验证尺寸和完整 decode；submit 重复验证后原子封存 package、
exact PNG 与 result。Cover 缺失或 stale 不阻止 production render-ready，但会阻止 delivery build。

## 自动 build

production 到达 `render-ready / awaiting-automatic-delivery` 后直接执行：

```bash
npm run delivery:build -- --project <storyId>
```

输入固定为 current StorySpec、SemanticTiming、PublishingIntent、ProductionRenderPlan、
ProductionRenderReady 和 CoverResult。`deliveryId` 确定性绑定这些 identity、Composition、exact
render argv 与 `detached-spawn-acknowledgement-v1`。

`publishing.json` 的 title 来自 StorySpec，description/topics/collection/chapter names 来自
PublishingIntent；每章 startFrame 来自 SemanticTiming，timecode 按 `startFrame / fps` 向下取整
为 `HH:MM:SS`。只保存 `plannedDurationSeconds = frameCount / fps`，不保存媒体实测时长。

build 顺序不可交换：

1. 在唯一 staging 中复制 exact Cover PNG；
2. 写 canonical publishing、launch manifest、handoff、render launch intent 和 checksum ledger；
3. 对非 MP4 package 做完整 current check；
4. 原子提升为 `deliveries/<storyId>/<deliveryId>/`；
5. 再次确认计划 MP4 与 log 不预存；
6. 用 `shell: false`、固定 cwd/argv/log、`detached: true` spawn Remotion；
7. 只等待 child 的 `spawn` 或 `error`；`spawn` 后 `unref()`；
8. 收到 `spawn` 后以同目录 fsynced temporary + atomic exclusive publish 写 receipt，并返回
   `delivery-render-started`。

固定 package：

```text
deliveries/<storyId>/<deliveryId>/
├── cover-4x3.png
├── cover-3x4.png
├── publishing.json
├── delivery-launch-manifest.json
├── HANDOFF.md
├── immutable-checksums.sha256
├── render-launch-intent.json
└── render-launch-receipt.json
```

计划 MP4 与 package 同目录，但不属于 immutable ledger；render log 独立位于 `out/`：

```text
deliveries/<storyId>/<deliveryId>/<storyId>.mp4
out/<storyId>/delivery-render/<deliveryId>.log
```

## Exactly-once 与歧义

- launch intent 必须在 spawn 前且只能写一次。
- receipt 只能在 OS 发出 `spawn` 后写一次。
- receipt 已存在时，重复 build 只读复验并返回 `noOp: true`。
- intent 存在但 receipt 缺失时，无法证明 child 是否启动；该 delivery 永久
  launch-ambiguous，所有 build/check 都 fail closed，绝不自动重试。
- spawn acknowledgement 后 child 即使很快失败，也不改写 receipt；仓库没有后台监控状态机。

## 复验边界

正常自动流程在 `delivery:build` 返回后立即结束，不再调用任何命令；下面的 check 只保留为用户
显式运行的独立只读诊断。

```bash
npm run delivery:check -- --project <storyId> --delivery <deliveryId>
```

check 重读 current inputs，验证 delivery identity、固定 package 文件集、canonical bytes、
checksums、Cover equality、manifest、intent 和 receipt。它允许 exact 计划 MP4 文件出现，但不
stat、read、hash、probe 或 decode 该文件，也不把它的存在解释为完成。

未知文件、路径逃逸、symlink、input drift、缺失 receipt 或目标冲突 fail closed。不上传平台、
不访问网络、不处理账号/密钥，也不清理 `out/`。用户明确要求删除整个作品时，改用
[`project:delete`](../PRODUCTION_WORKFLOW.md#7-作品删除) 一次清理该 storyId 的 Project、媒体、
narration work、Runs、out 与 deliveries；它不是 delivery 重试或歧义恢复手段。
