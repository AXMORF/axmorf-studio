# 本地交付指南

> 文档类型：操作指南
>
> 最后复核：2026-08-16
>
> 默认适用范围：current Project 已有可渲染 authoring source 与 sealed narration。

## 默认 Project build

```bash
npm run project:build -- --project <storyId>
```

该命令同步等待最终视频和两个 Cover 完成，验证实际媒体后写 `publish.json`，最后从 staging 受控替换：

```text
deliveries/<storyId>/
├── video.mp4
├── cover-4x3.png
├── cover-3x4.png
└── publish.json
```

`publish.json` 绑定 run-independent buildId/source snapshot、实际 repository paths、SHA-256、size、
codec、声道、尺寸、fps、frameCount 与 EOF decode。普通 Scene/GlobalVisual/Cover source 修改不创建
ProductionRun、不派发 owner、不执行 audited finalize、不重做旁白。相同 snapshot 且 current delivery 完整时
no-op；失败时上一版不动，同 buildId 重试复用已验证 staged media。

以下章节只适用于用户显式选择的 audited production/launch 流程，不是默认 rebuild。

## Audited Cover 生命周期

主 Agent 在 VisualStyleSpec current 后只冻结 Cover assignment：

```bash
npm run delivery:cover:freeze -- --project <storyId>
```

CoverAssignment 只嵌入 current StorySpec、VisualStyleSpec 和固定 CoverSpec。独立 owner 在
`src/projects/<storyId>/delivery/cover/` 制作 1600×1200 和 1200×1600 两个纯代码 Composition，
不得读取 PublishingIntent、SemanticTiming、Scene/GlobalVisual 输出、FinalAssembly、历史封面
或已有 deliveries。

owner 不运行 check/submit。foreground finalize 内部的 fixed check 真实渲染临时全尺寸 PNG 并验证尺寸和完整
decode；随后重复验证并原子封存 package、
exact PNG 与 result。Cover 缺失或 stale 不阻止 production render-ready，但会阻止 delivery build。

## Audited detached build

Cover owner 通过 `production:owner:ready -- --run <runId> --owner cover` 发布 receipt。主 Agent 等待全部
已派发子 Agent 到达宿主终态后只调用一次 `production:finalize`；脚本到达 render-ready 后串行执行
Cover check/submit，Cover current 后自动执行：

```bash
npm run delivery:build -- --project <storyId>
```

输入固定为 current VideoBrief、StorySpec、SemanticTiming、PublishingIntent、ProductionRenderPlan、
ProductionRenderReady、CoverResult，以及 render plan 实际使用资源从绑定 ResourceCatalog 投影的
`asset-attributions-v1`。`deliveryId` 确定性绑定这些 identity、attribution fingerprint/checksum、
Composition、exact render argv 与 `detached-spawn-acknowledgement-v1`。

`publishing.json` 使用 `delivery-publishing-v2`：title 来自 StorySpec，
description/topics/collection/chapter names 来自 PublishingIntent；`outputFileName` 固定为
`<storyId>.mp4`，`coverFileNames` 固定映射 `cover4x3` → `cover-4x3.png`、`cover3x4` →
`cover-3x4.png`。每章只对应 narrated Scene，直接取 SemanticTiming 的绝对 startFrame；timecode 按
`startFrame / fps` 向下取整为 `HH:MM:SS`。frameCount 等于
`SemanticTiming.durationInFrames`，只保存 `plannedDurationSeconds = frameCount / fps`，
不保存媒体实测时长。

build 顺序不可交换：

1. 在唯一 staging 中复制 exact Cover PNG；
2. 写 canonical publishing、`asset-attributions.json`、launch manifest、handoff、render launch
   intent 和 checksum ledger；
3. 对非 MP4 package 做完整 current check；
4. 原子提升为每个 Project 唯一的 `deliveries/<storyId>/`；identity 变化时替换旧 package；
5. 再次确认新 package 尚未包含计划 MP4；
6. 用 `shell: false`、固定 cwd/argv/log、`detached: true` spawn Remotion；
7. 只等待 child 的 `spawn` 或 `error`；`spawn` 后 `unref()`；
8. 收到 `spawn` 后以同目录 fsynced temporary + atomic exclusive publish 写 receipt，并返回
   `delivery-render-started`。

固定 package：

```text
deliveries/<storyId>/
├── cover-4x3.png
├── cover-3x4.png
├── publishing.json
├── asset-attributions.json
├── delivery-launch-manifest.json
├── HANDOFF.md
├── immutable-checksums.sha256
├── render-launch-intent.json
└── render-launch-receipt.json
```

计划 MP4 与 package 同目录，但不属于 immutable ledger；render log 独立位于 `out/`：

```text
deliveries/<storyId>/<storyId>.mp4
out/<storyId>/delivery-render/<deliveryId>.log
```

## Exactly-once 与歧义

- launch intent 必须在 spawn 前且只能写一次。
- receipt 只能在 OS 发出 `spawn` 后写一次。
- receipt 已存在且 identity 相同时，重复 build 只读复验并返回 `noOp: true`。
- receipt 已存在且 current inputs 产生新 identity 时，build 通过 staging 受控替换该 Project 的
  唯一 package，不保留旧 delivery 目录，然后启动新 render 覆盖固定 MP4 路径。
- intent 存在但 receipt 缺失时，无法证明 child 是否启动；该 delivery 永久
  launch-ambiguous，所有 build/check 都 fail closed，绝不自动重试。
- spawn acknowledgement 后 child 即使很快失败，也不改写 receipt；仓库没有后台监控状态机。

## 复验边界

audited detached 流程在 `delivery:build` 返回后立即结束，不再调用任何命令；下面的 check 只保留为用户
显式运行的独立只读诊断。

```bash
npm run delivery:check -- --project <storyId>
```

check 重读 current inputs，验证 delivery identity、固定 package 文件集、canonical bytes、
checksums、Cover equality、attribution、manifest、intent 和 receipt。它允许 exact 计划 MP4 文件出现，但不
stat、read、hash、probe 或 decode 该文件，也不把它的存在解释为完成。

未知文件、路径逃逸、symlink、input drift 或缺失 receipt fail closed。不上传平台、
不访问网络、不处理账号/密钥，也不清理 `out/`。用户明确要求删除整个作品时，改用
[`project:delete`](../PRODUCTION_WORKFLOW.md#8-作品删除) 一次清理该 storyId 的 Project、媒体、
narration work、Runs、out 与 deliveries；它不是 delivery 重试或歧义恢复手段。
