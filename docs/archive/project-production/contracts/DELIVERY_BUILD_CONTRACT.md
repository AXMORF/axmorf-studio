# DeliveryBuild contract

> 文档类型：current contract 说明
>
> 最后复核：2026-10-08（当前源码升级未发布）

同步 `DeliveryBuild` 是唯一最终交付合同。它只消费当前 ProductionRevision、已验证 ArtifactSet、
Composition metadata、build policy 与 PublishingIntent；不读取或迁移旧 Run、receipt、render-ready 或
detached launch 数据。

## Identity

`DeliveryBuildId` 由 storyId、revisionId、artifactSetFingerprint、Composition ID、width/height/fps/frameCount
与同步 build policy 导出。ExecutionAttempt、时间戳、workspace、历史 Run 和诊断不进入 identity。

## Publish commit

`publish.json` 只能在三个媒体均已完整渲染和复验后写入，包含：

- deliveryBuildId、revisionId、artifactSetFingerprint；
- `video.mp4`、`cover-4x3.png`、`cover-3x4.png` 的固定 repository path、checksum 和 size；
- video 的 H.264/AAC、声道、尺寸、fps、frameCount 与 EOF decode；
- Cover 的 PNG、固定尺寸与 EOF decode；
- current PublishingIntent 投影的 title、description、topics、collection 与逐 content Beat 的 chapters；authored-frame 可显式为空。

纯视觉 authored-frame 成片同样要求 H.264/AAC；无声音时 Remotion `enforceAudioTrack` 生成静音音轨。
正式/草稿共用 PCM mix → 单次 AAC/MP4 编码，保留 priming/skip 元数据，声道在编码时选择；
原 H.264 帧只 stream copy，绝对时间和字幕不偏移。media staging 完成后才替换输出。
统一禁止 parallel encoding；帧渲染可并发，编码使用完整帧序列，极短片仍须通过精确 fps/frame count。
原布局/fps/帧数/声音的低像素 draft 有独立 source/artifacts/profile identity 与 preview receipt；它在私有 view
物化，不修改 current，不参与 DeliveryBuildId，不代替 exact-four 验证或 subjective motion/listening review。

current slot 只允许上述三个媒体和 `publish.json`。同 DeliveryBuildId no-op 仍需重读 schema、hash、probe
和 decode；任何缺失、unknown file、symlink、path drift、checksum/media drift 都使 delivery 不完整。

## Failure and promotion

DeliveryBuildId-owned staging 允许跨失败 attempt 复用已验证媒体。render/inspect/materialized-byte-drift/
publish/check 任一失败
都不会提前替换 current slot。只有 staging exact 四文件复验通过后才执行目录 promotion；捕获到的
替换失败恢复上一版。固定 real-directory slot 的替换需要两次 rename，因此 host 在两步之间被强杀
不属于 crash-atomic 保证。该合同不定义通用 DAG、后台 retry、detached PID/receipt 或平台发布。

## Progress and read-only projection

`.producer-attempts/<storyId>/<attemptId>/` 只以 immutable base、append-only events 和可重建 progress
记录 plan/cache/task outcome 与 delivery result。普通失败只保存稳定脱敏 code；Attempt 不进入
DeliveryBuildId、ArtifactAttestation 或 current delivery authority。

fixed continuation 只在 exact attempt 的全部 Agent task terminal 为 committed/current 后调用一次 delivery 所属
convergence；它必须先获得 one-shot atomic claim，并从 immutable event log 判定 barrier。任一 failed terminal、
attempt 创建起一小时 missing-terminal timeout 或 fixed failure 都直接结束该 process，不在原 attempt retry。Root 以原进程
等待/通知监督，按 Skill 诊断故障；只有视频任务错误可经有界 recovery gate 创建新 attempt，底层程序缺陷只诊断报告。

配置页只读投影严格解析 publish schema，要求 exact 四文件的真实 file/type/path/size/checksum，并与
current Revision 比较。轮询不重复 FFmpeg/ffprobe/EOF decode；一致为 current，不一致为 stale，
任何 malformed、missing、unknown、symlink 或 checksum drift 均为 error。
