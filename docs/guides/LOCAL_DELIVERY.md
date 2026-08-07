# M10 本地交付指南

> 适用范围：用户已经批准 exact current preview，且当前 Project 的 source、media、evidence、
> approval 与 `final-mechanical-check-v2` 均可复验。

M10 是批准后的独立本地封存能力，不属于 `production:*`。production 仍停止在
`preview-ready / awaiting-user-preview`；脚本和 Agent 都不能创建或代签
`FinalPreviewApproval`。

## Project-owned 输入

每个可交付 Project 必须自有以下固定输入：

```text
src/projects/<storyId>/delivery/
├── delivery-spec.json
├── Covers.tsx
├── Root.tsx
└── index.ts
```

`delivery-spec.json` 使用 `delivery-specification-v1`，声明 Story/Composition、标题、简介、
6–7 个唯一主题词、显式 collection 和章节起始帧。collection 是作品自有自由文本，不使用
仓库级固定枚举。第一章必须从 frame 0 开始，章节帧严格递增且位于视频内，章节名最多
11 个 Unicode 字符。

`index.ts` 是仅供 Remotion Still CLI 使用的独立入口；`Root.tsx` 必须注册：

- `<CompositionId>Cover4x3`：1600×1200；
- `<CompositionId>Cover3x4`：1200×1600。

两个比例应各自构图，不把同一画面机械裁切。三个 source 文件的 checksum 进入交付规格
identity；修改封面源码会确定性地产生新 release ID。

## 构建

只接受以下精确形式：

```bash
npm run delivery:build -- --project <storyId>
```

命令会先运行该 Project 的完整 final verification，要求 current approval 精确绑定 current
preview checksum、FinalPreviewEvidence 与 FinalAssembly，并要求 persisted
`final-mechanical-check-v2` aggregate pass。之后它：

1. 把获批 preview 原字节复制为 `<storyId>.mp4`，不重新编码；
2. 渲染并检查两个 Project-owned PNG Still；
3. 生成 canonical `publishing.json`、`release-manifest.json` 和 `HANDOFF.md`；
4. 生成 `checksums.sha256`；
5. 在固定 `.staging` 内完整复验后，原子封存最终目录。

输出只能是：

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

`releaseId` 只由 approval fingerprint、FinalAssembly fingerprint 和交付规格 fingerprint
派生。已有相同 release 时 build 退化为只读复验并返回 `noOp: true`；它不会覆盖目录。

## 复验

只接受以下精确形式：

```bash
npm run delivery:check -- --project <storyId> --release <releaseId>
```

随后执行 manifest 给出的 checksum 命令，例如：

```bash
cd deliveries/<storyId>/<releaseId> && sha256sum -c checksums.sha256
```

check 会重新读取 current Project authority，并验证 release ID、固定文件集、canonical JSON、
所有 checksum/大小、H.264/AAC 流、画幅、fps、帧数、视频和容器实际时长、采样率、声道、
完整 EOF 解码，以及两个 PNG 的尺寸和完整解码。`release-manifest.json` 不递归记录自身或
checksum ledger，避免自引用；`checksums.sha256` 作为外层绑定同时覆盖 manifest 和其余六个
payload 文件。

## 失败语义与边界

- missing、malformed、stale、错误 approval、失败 final-v2、checksum drift、未知文件、符号
  链接、绝对路径、`..`、残留 staging 和目标冲突全部 fail closed；
- 失败构建会清理本次唯一 staging，不留下可冒充 release 的半成品；
- `deliveries/` 是 ignored 本地产物，不进入 Git，也不成为默认 core 检查前置条件；
- 删除 `deliveries/` 不影响 core 健康，但显式 `delivery:check` 会失败；
- 不上传平台、不登录账号、不访问网络、不处理密钥或权限，也不执行 promotion、
  NarrativeCheck、Project 删除或 `out/` 清理。
