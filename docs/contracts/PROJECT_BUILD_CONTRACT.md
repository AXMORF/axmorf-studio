# Project build contract

> 文档类型：current contract 说明
>
> 最后复核：2026-08-18

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

## Progress and read-only projection

`project-build-progress-v1` 位于
`deliveries/.staging/project-build/<storyId>/progress.generated.json`，以原子 rename 和自身 fingerprint
记录单个 current attempt 的准备、视频、4:3 Cover、3:4 Cover、验证与提升阶段。普通失败保留当前
阶段和固定安全提示，不把原始异常写入页面合同；同 buildId 重试覆盖 attempt 并标记复用媒体；成功
提升后删除该状态，由 `publish.json` 接管完成 authority。progress 不进入 buildId、authoring snapshot
或 current delivery。

配置页只读投影严格解析 publish schema，要求 exact 四文件的真实 file/type/path/size/checksum，并与
当前 source snapshot 比较。轮询不重复 FFmpeg/ffprobe/EOF decode；一致为 current，不一致为 stale，
任何 malformed、missing、unknown、symlink 或 checksum drift 均为 error。
