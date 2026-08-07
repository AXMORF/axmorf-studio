# M10 本地交付指南

> 适用范围：future-only v2 作品在 Story 阶段已有 current PublishingIntent，独立 Cover 已
> `cover-ready`，用户已经批准 exact current preview，且 Project 的 source、media、evidence、
> approval 与 `final-mechanical-check-v2` 均可复验。

M10 v2 把发布内容和封面制作前移；批准后的 `delivery:build` 是纯脚本复制与封存，不调用
Agent、不渲染或重新编码视频，也不重新渲染或设计封面。M10 仍不属于 `production:*`：production
只根据 N 个 Scene result 加一个 GlobalVisual result 到达
`preview-ready / awaiting-user-preview`，Cover missing/failed 不改变该状态。

历史 `delivery-specification-v1` 和 `delivery-release-manifest-v1` 不迁移、不回填、不改 identity。
`delivery:check` 根据 manifest 版本对已有 v1 release 做自包含、只读复验；新的 build 只产生 v2。

## Story 阶段 PublishingIntent

每个 future-only v2 Project 在 Story 阶段一次创作：

```text
src/projects/<storyId>/publishing-intent.json
```

`publishing-intent-v1` 绑定 current Story fingerprint，但不重复保存 title；title 始终来自
`StorySpec.title`。它只保存 description、6–7 个唯一 topics、自由文本 collection，以及按 Story
顺序覆盖全部 StoryBeat 的 `meaningId + 中文章节名`。章节名必须包含中文，最多 11 个 Unicode
字符；不得保存 startFrame 或 timecode。

## 独立 Cover 生命周期

VisualStyleSpec 当前后，主 Agent 执行：

```bash
npm run delivery:cover:freeze -- --project <storyId>
```

生成的 future-only `delivery-cover-assignment-v2` 只嵌入 current StorySpec、current
VisualStyleSpec 和固定 CoverSpec。它禁止读取 PublishingIntent、SemanticTiming、旁白、字幕、
ScenePackage、Scene/GlobalVisual 输出、FinalAssembly、preview、evidence、approval 或旧封面。

一个独立 Cover owner 同时负责固定目录中的两个独立源码构图：

```text
src/projects/<storyId>/delivery/cover/
├── assignment.generated.json
├── Cover4x3.tsx             # 1600×1200 独立 Composition
├── Cover3x4.tsx             # 1200×1600 独立 Composition
├── Root.tsx
└── index.ts
```

只能使用纯代码图形；禁止图片、视频、音频、网络、远程字体、Scene/GlobalVisual 输出、共用
Composition 或机械裁切。owner 执行：

```bash
npm run delivery:cover:check -- --project <storyId>
npm run delivery:cover:submit -- --project <storyId>
```

check 真实渲染两张临时全尺寸 PNG，并验证 320×240、240×320 缩略图完整解码；submit 重复同一
验证后把 `delivery-cover-package-v2`、两张 exact PNG 和
`delivery-cover-result-v2` 原子封存在 assignment-fingerprint 目录。主 Agent 复检源码与画面并
复跑命令。repo CLI 不创建或监控 Agent，也不保存 task/thread/progress/heartbeat。

## 纯脚本构建

用户明确批准最终视频后只接受：

```bash
npm run delivery:build -- --project <storyId>
```

命令要求 current PublishingIntent、current immutable Cover result、current FinalAssembly、
FinalPreviewEvidence、checksum-bound 用户 FinalPreviewApproval 和 passing
`final-mechanical-check-v2`。之后它：

1. 原字节复制获批 preview 为 `<storyId>.mp4`，不重新渲染或编码；
2. 原字节复制 Cover result 已封存并重新校验的两个 exact PNG；
3. 确定性投影 `publishing.json`：title 来自 StorySpec；内容字段来自 PublishingIntent；章节
   startFrame 来自 current SemanticTiming；timecode 将 frame/fps 小数秒向下取整并输出
   `HH:MM:SS`；fps/总帧数来自 FinalAssembly；实际时长来自交付 MP4 的 FFprobe 实测；
4. 生成 canonical `release-manifest.json`、`HANDOFF.md` 和 `checksums.sha256`；
5. 在固定 staging 内完整复验后原子封存。

固定输出：

```text
deliveries/<storyId>/<releaseId>/
├── <storyId>.mp4
├── cover-4x3.png
├── cover-3x4.png
├── publishing.json
├── release-manifest.json
├── checksums.sha256
└── HANDOFF.md
```

v2 `releaseId` 绑定 approval fingerprint、FinalAssembly fingerprint 和
`delivery-specification-v2` fingerprint；后者进一步绑定 PublishingIntent fingerprint、Cover
result fingerprint 和固定 archive policy。已有相同内容只读复验并返回 `noOp: true`，不会覆盖。

## 复验

```bash
npm run delivery:check -- --project <storyId> --release <releaseId>
cd deliveries/<storyId>/<releaseId> && sha256sum -c checksums.sha256
```

v2 check 重读 current Project authority，并验证 release identity、固定文件集、canonical JSON、
所有 checksum/大小、H.264/AAC 流、画幅、fps、帧数、视频和容器实际时长、采样率、声道、完整
EOF 解码，以及两个 PNG 与 current Cover result 完全一致。v1 check 不要求 current v2 inputs，
仅按原 manifest/ledger/媒体 identity 做只读兼容复验。

## 失败语义与边界

- PublishingIntent、Cover assignment/package/result、approval 或媒体 missing/malformed/stale 都
  fail closed；Cover missing/stale 只阻止 delivery，不阻止 production preview-ready；
- checksum drift、未知文件、路径逃逸、符号链接、残留 staging 和目标冲突全部 fail closed；
- 失败构建只清理本次唯一 staging，不留下可冒充 release 的半成品；
- `deliveries/` 是 ignored 本地叶节点，不进入 Git；删除它不影响 core 健康，但显式 check 失败；
- 不上传平台、不登录账号、不访问网络、不处理密钥或权限，也不执行 promotion、
  NarrativeCheck、Project 删除或 `out/` 清理。
