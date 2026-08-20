# Local delivery

> 文档类型：操作指南

Delivery 是 `project:produce:converge` 的同步末段，不是独立第二主链。正常生产不单独调用 render 或 Cover
命令。

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

DeliveryBuildId 由 `revisionId + artifactSetFingerprint + Composition metadata + build policy` 计算，不包含
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

## Run through convergence

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

只有 plan 返回的 current revisionId 可用。不能在 artifacts incomplete 或 materialized drift 状态下单独触发
delivery。不能把文件存在、Remotion process 启动、renderer exit 0 或聊天消息当成完成事实。

## Failure and inspection

- render 在 video 后失败：再次执行同 identity 时复验并复用 video，只生成缺失 media；
- current package malformed/drifted：不当作 no-op，重新 staging；上一目录只有在新 package 全绿后替换；
- materialized bytes 与 attestation 不一致：build 前 fail closed，不从 live drift 重新签名；
- unknown file、symlink、wrong codec/dimension/frame/checksum 或 EOF failure：fail closed。

Project 完整删除使用 [`project:delete`](../PRODUCTION_WORKFLOW.md#8-作品删除)，不要直接删除单个 MP4 或 broad
清理 delivery root。
