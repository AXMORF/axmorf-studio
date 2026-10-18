# Ubuntu npm Workspace production acceptance

> 文档类型：可复核实施证据
>
> 验收日期：2026-08-30

## Scope

本次在 repository 外从当前 patch 生成两个真实 npm tarballs，并用 creator 创建全新普通 Workspace。验收使用
Ubuntu 24.04 x86_64、Linux `7.0.0-28-generic`、Node.js `24.16.0`、npm `11.13.0` 与官方 npm registry。
source baseline 是 `59f5c9bf642953e16ffef7bc1c3f521d3c3ca658`；本文件与 package-boundary fixes 在同一提交中。
临时 Workspace、Project、provider cache、artifacts 与 Delivery 均位于 `/tmp`，没有进入 Git。

## Package receipt

| Tarball | SHA-256 |
| --- | --- |
| `axmorf-studio-0.1.0.tgz` | `00593875c32f7190deeb5ea99d106b1b7c0f58a0077494d9e0283ab32b2da1f1` |
| `create-axmorf-studio-0.1.0.tgz` | `27888006068fe66c19d8590a580241808ea187632bbf793a88c1ffd59ddef432` |

creator 默认 install、lockfile 与 bootstrap/doctor 通过；生成 Workspace 的 official-registry audit 为 0 finding。
public contracts/Remotion imports 与三个 compositions 通过。lockfile 中 `@axmorf/studio` 为 `0.1.0`，`remotion`、
`@remotion/cli`、`@remotion/renderer` 均精确为 `4.0.489`。同日官方 registry 查询仍对
`@axmorf/studio` 与 `create-axmorf-studio` 返回 E404，因此没有把本地 tarball 验收表述为已公开发布。

## Production receipt

- Project：`ubuntu-npm-acceptance`
- Revision：`revision-ff078187ee1ed2c5c894a678a4645b8d29127491420df86ce2ae62dda6a1b5a4`
- Attempt：`a1120894-54c8-4153-aafa-87cbea77f2b4`
- DeliveryBuild：`delivery-477a8a68d6906d315ad336edfc06866fdaa2cc09b677c3d31f170b1ac60cc3b0`
- Execution：显式 `subagents`，repository ceiling 4，四个 dirty Agent tasks 全部由各自 validator commit；失败 0
- Actual cost projection：2 provider requests、2 provider cache hits、4 Agent tasks、3 delivery media
- Fixed terminal：`project-production-complete`，attempt state `succeeded`，delivery status `verified`

Root 在 inspect 后报告 readiness/cost/reuse，再运行 prepare；四个 Agent tasks admission 后只启动 prepare 返回的
one-shot continuation。continuation 自行等待 immutable terminal events、converge、render、验证并提升 current
Delivery，没有 Root 轮询、二次 continuation 或失败 attempt retry。

## Exact Delivery

Delivery directory exact 只有以下四个 regular files，没有 symlink：

| File | Bytes | SHA-256 | Media facts |
| --- | ---: | --- | --- |
| `video.mp4` | 3,020,570 | `36e894ce38f3c7453f7ee86f82781c94682d421384ba298b5c6ecdfff83a7275` | H.264/AAC, 1080×1920, 30 fps, 48 kHz stereo |
| `cover-4x3.png` | 115,007 | `00a1a4045357ed3c1ffeb5ab8b4b2415a53b1f507d4b03fe9ff2eba9eab924f0` | PNG, 1600×1200 |
| `cover-3x4.png` | 155,889 | `e9d50d346e7a4c9414d7ab8748159f4dec7d9635e40718ec5647c9cd4f9806f7` | PNG, 1200×1600 |
| `publish.json` | 2,097 | `0bfb256878fc787ecca956bdb5904f94da58c72e33c4b65478e5aeef17c7bdcc` | publish-last identity and checksums |

Fixed validation re-probed codecs/channels/dimensions/fps/frame count, verified checksums, and decoded the complete video and
both Covers to EOF before returning `project-production-complete`.

## Acceptance fixes

真实 packed flow 暴露并修复四个 package boundary defects：

1. creator manifest 补齐 inspect 前必需的 `project:execution:resolve` script，并加 scaffold regression；
2. bundled FFmpeg 没有 raw `s16le` muxer，因此 normalization/mastering 改为写 PCM WAV，Node 严格解码后重建
   canonical WAV，保留 exact sample-frame authority；
3. Workspace configuration snapshot 支持 creator 生成的 `remotion.config.mjs` 与源码 Workspace 的
   `remotion.config.ts`，并要求恰有一个配置文件；
4. bundled FFmpeg 不提供默认 `wrapped_avframe` encoder，因此 video/Cover EOF checks 显式选择
   `rawvideo`/`pcm_s16le` output encoders，避免把 output negotiation failure 误报为输入 decode failure。

focused regressions、真实 narration normalization/mastering、bundled FFmpeg MP4/PNG EOF decode 与完整
`npm run check` 均通过。公开 npm publish、Git push、tag 与 GitHub Release 不属于本次验收，均未执行。
