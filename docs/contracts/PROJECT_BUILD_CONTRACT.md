# Project build contract

> 文档类型：current contract 说明
>
> 最后复核：2026-08-16

`project-publish-v1` 是默认最终交付合同。它不读取或迁移旧 Run、旧 delivery launch manifest、
CoverResult 或 receipt。

## Identity

`ProjectBuildId` 由 storyId、authoring source snapshot、Composition ID、width/height/fps/frameCount 与
`synchronous-atomic-project-build-v1` 导出。snapshot 覆盖 Project source、Project-owned public media、
shared contracts/runtime 和 Remotion dependency lock；assignment、receipt、ProductionRenderPlan/Ready、
owner result 与 mechanically refreshed package projection 不进入 identity。

## Publish commit

`publish.json` 只能在三个媒体均已完整渲染和复验后写入，包含：

- buildId、sourceSnapshotFingerprint、sourceFileCount；
- `video.mp4`、`cover-4x3.png`、`cover-3x4.png` 的固定 repository path、checksum 和 size；
- video 的 H.264/AAC、声道、尺寸、fps、frameCount 与 EOF decode；
- Cover 的 PNG、固定尺寸与 EOF decode；
- current PublishingIntent 投影的 title、description、topics、collection 与 narrated chapters。

current slot 只允许上述三个媒体和 `publish.json`。同 snapshot no-op 仍需重读 schema、hash、probe 和
decode；任何缺失、unknown file、symlink、path drift、checksum/media drift 都使 delivery 不完整并触发
同 identity artifact rebuild。

## Failure and promotion

buildId-owned staging 允许跨失败执行复用已验证媒体。render/inspect/source-drift/publish/check 任一失败
都不会提前替换 current slot。只有 staging exact 四文件复验通过后才执行目录 promotion；捕获到的
替换失败恢复上一版。固定 real-directory slot 的替换需要两次 rename，因此 host 在两步之间被强杀
不属于 crash-atomic 保证。该合同不定义通用 DAG、后台 retry、detached PID/receipt 或平台发布。
