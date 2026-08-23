# Local delivery

> 文档类型：操作指南

Delivery 是 `source-current` 之后的 fixed use case，不是 Agent task，也不是独立第二主链。`automatic` policy 在 fixed
continuation 内同步进入 DeliveryBuild；`manual` policy 在 source-current 停止，用户可稍后通过 Desktop public `rsp`
surface 显式生成 Delivery。Root 不单独调用 converge、render 或 Cover 命令。

## Current package

```text
deliveries/<storyId>/
├── video.mp4
├── cover-4x3.png
├── cover-3x4.png
└── publish.json
```

directory 必须 exact 只有四个 regular files。`publish.json` 绑定 revisionId、artifactSetFingerprint、
DeliveryBuildId、Composition metadata、publishing projection 以及三个 media 的 repository path、size、checksum
和 probe facts。

## Build identity and staging

DeliveryBuildId 由 source-current、`rendererRuntimeFingerprint`、Composition metadata、publishing projection 与 build
policy 计算，不包含
ExecutionAttempt、时钟或绝对路径。builder 在 render 前后复验 materialized Project bytes 与
ArtifactAttestation。

staging 属于 exact DeliveryBuildId。若某个 media 已存在并通过当前 inspect，它可在同 identity 的后续尝试中
复用；无效项被精确重做。捕获到的 render/probe/write/promotion failure 不替换上一 current package。

## Synchronous validation

builder 等待所有子进程完成后验证：

1. `video.mp4` 是 H.264 video + AAC audio，声道合法；
2. width/height/fps/frame count 与 current RenderSpec/Composition 一致；
3. video 可 decode 到 EOF；
4. `cover-4x3.png` 是 1600×1200 PNG，`cover-3x4.png` 是 1200×1600 PNG，均可完整 decode；
5. exact paths、file sizes、checksums 与 `publish.json` 一致；
6. `publish.json` 最后写，完整 staging 再 controlled replace current directory。

相同 DeliveryBuildId 的 current package 若全部复验通过，返回 `project-production-current`，不重写任何媒体；
新 identity 成功提升返回 `project-production-complete`。

## Run through fixed controller

```bash
npm run project:produce:continue -- --project <storyId> --revision <revisionId> --attempt <attemptId>
```

repository contributor 命令显式采用 `automatic` policy；只有 plan 返回的 current revisionId 可用。Desktop manual
production 到 source-current 后，later explicit build 使用：

```bash
./.rsp/bin/rsp delivery build --project <storyId>
```

显式 build 必须从 current source attestation 开始，不创建 provider call、Agent task、task workspace 或
ExecutionAttempt。不能在 artifacts incomplete、source stale 或 materialized drift 状态下触发 delivery。不能把文件
存在、Remotion process 启动、renderer exit 0 或聊天消息当成完成事实。

## Failure and inspection

- render 在 video 后失败：再次执行同 identity 时复验并复用 video，只生成缺失 media；
- current package malformed/drifted：不当作 no-op，重新 staging；上一目录只有在新 package 全绿后替换；
- materialized bytes 与 attestation 不一致：build 前 fail closed，不从 live drift 重新签名；
- unknown file、symlink、wrong codec/dimension/frame/checksum 或 EOF failure：fail closed。

Project 完整删除使用 [`project:delete`](../PRODUCTION_WORKFLOW.md#8-作品删除)，不要直接删除单个 MP4 或 broad
清理 delivery root。

## Desktop App current split

Phase B 已通过显式 contract 把 `source-current` 与 DeliveryBuild clean-break：默认 `manual` 只物化并复验 source，
用户点击后才构建本节 exact four-file package；`automatic` 在 source-current 后继续构建。Preview Player 只播放
verified current Delivery，manual 阶段没有视频时明确显示 unavailable。两种策略复用相同 DeliveryBuild identity、
staging、probe、checksum 与 EOF gates，不新增第二条 render 主链。

hosted macOS 15 arm64 packaged gate 已真实验证 manual source-current 无 Delivery、later explicit Delivery、automatic
Delivery、Preview playback 以及 success/failure/Quit/reopen cleanup。产品与剩余发行边界见
[Desktop App 产品架构](../DESKTOP_APP_PRODUCT.md) 和 [Iteration Status](../ITERATION_STATUS.md)。
