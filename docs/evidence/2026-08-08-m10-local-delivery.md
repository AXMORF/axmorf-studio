# M10 本地交付验收证据

> 日期：2026-08-08
>
> 作品：`product-comic-vertical`
>
> 范围：future-only M10 local delivery；不修改正式作品或批准 identity

## 结论

独立 `delivery:*` 能力已用现有正式批准的 ProductComicVertical 完成首个真实交付。交付视频是
获批 exact preview 的原字节副本，没有重新编码；两个封面由 Project-owned 4:3 / 3:4 Remotion
Still 独立构图并真实渲染。release 在固定 staging 内复验后原子封存，production 终点仍为
`preview-ready / awaiting-user-preview`。

## Current authority

- FinalAssembly：`sha256:47401e3499122f89e4eeb69b16b333101e793de223a19e4214540d69e599acb2`
- FinalPreviewEvidence：`sha256:d0e5a1ed1d78e166f9938881c577ad75247d64874b20be72ad17c5223786c514`
- FinalPreviewApproval：`sha256:836a7f16ddba659a69a6c28a4a9d591c31b64b0d8cdf4e35708226006661a66b`
- passing final-v2：`sha256:8a52e146c2edeb422a77136707a35c54fa9e5e787b0bcdd35e95b0650b8d41b2`
- approved preview / delivery MP4：
  `sha256:c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30`
- delivery specification：
  `sha256:0c0d1967345e95f24048da3d8d5fbb7b22b51ac8e154cf3d07905b63e805340b`

## Release

```text
deliveries/product-comic-vertical/
  release-9a9bc118683f61532d4243c80f49755db3b958800e6e25d09f25b41d44d11323/
```

媒体事实：

- `product-comic-vertical.mp4`：1080×1920、30 fps、5116 帧、一条 H.264 与一条 AAC、
  stereo 48 kHz、video 170.533333 秒、container 170.538667 秒、完整解码通过；
- `cover-4x3.png`：1600×1200，完整解码通过；
- `cover-3x4.png`：1200×1600，完整解码通过；
- 两张封面另以 400×300 与 300×400 缩略图目检，主标题、信息层级与批准标记仍可读。

`checksums.sha256`：

```text
045b009d763c10f0ced0c7f6f253ceb6121638cae95f6ce1513c6624c72eb455  cover-3x4.png
ad914920261912e7b370ea81065b2c0fc09029fb8582165da3e7dd510d5757bf  cover-4x3.png
624e431fa45f82529c74428c6358e852856936705cf1c85feb0ae5e471a15a74  HANDOFF.md
c70a25a898abe828e90664b061e2e18840420099bb82bbe33b49357642f05b30  product-comic-vertical.mp4
10b729412b477e539ee6c4e305cc337aa95e845a7f69d30e6dea897f1533e912  publishing.json
d241a7ce60ec974d8a3ae69fc1e4356b974c6a8c9258146d0bf66ab644089b53  release-manifest.json
```

## 自动化覆盖

测试覆盖 strict v1 contracts 与 CLI、malformed/stale/missing/checksum drift、错误批准、失败
final-v2、路径逃逸、符号链接、未知文件、原子失败、重复执行、容器时长漂移，以及删除
`deliveries/` 不影响 zero-Project core boundary。Project-owned 测试另验证 delivery spec、两个
Still 的固定 Composition ID、尺寸与独立比例构图源码。

最终验收命令与结果在本次本地提交前以最新工作树重新执行；详细命令见本文件末尾的
“最终验证”。

## 边界

- 未修改 Story、旁白、字幕、SemanticTiming、ScenePackage、FinalAssembly 或 approval；
- 未把 Project、媒体或 deliveries 加入 Git；
- 未上传、登录、联网或处理密钥/权限；
- 未执行 promotion、NarrativeCheck、Project 删除或 `out/` 清理；
- 未改变 `production:*` 或其 `preview-ready` 终点。

## 最终验证

以下命令均以本次提交前最新工作树执行并通过：

```text
M10 focused tests                                      17 pass / 0 fail
npm test                                               660 pass / 0 fail
npm run typecheck                                      pass
npm run lint                                           pass
npm run docs:check-links                               37 tracked Markdown / 67 local links current
npm run build                                          pass
npm run compositions                                   ProductComicVertical = 30 fps / 1080×1920 / 5116f
npm run check                                          static + host pass
npm run project:verify -- --project product-comic-vertical --scope full
                                                       8 Project-owned steps pass
npm run project:check -- --project product-comic-vertical --level final
                                                       final-v2 pass
npm run project:evidence:check -- --project product-comic-vertical
                                                       narrative + Scene + final evidence pass
npm run project:approval:check -- --project product-comic-vertical
                                                       approved/current
npm run delivery:build -- --project product-comic-vertical
                                                       current / noOp true
npm run delivery:check -- --project product-comic-vertical --release <current release>
                                                       current
cd <current release> && sha256sum -c checksums.sha256   6 files OK
```

提交前代码审查发现一个 Important 边界：检查现有 release 时，父级 `deliveries/` 被替换成
符号链接仍可能被跟随。先加入失败回归，再在 build/check 共同入口校验完整目录链；修复后相关
测试、typecheck、lint 和所有门禁重跑通过。最终审查没有剩余 Critical/Important 问题。
