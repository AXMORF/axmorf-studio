# 初始化与迁移清单

> 文档类型：维护指南
>
> 最后复核：2026-08-06
>
> 仅用于新仓库初始化或白名单迁移，不是当前实现状态清单。

## 新仓库

- 目录：`<repo-root>`
- 脚手架：`create-video@4.0.489` blank template
- 包管理：npm
- 运行方式：宿主机 Node.js/Remotion CLI，不使用 Docker

## 能力来源

- 来源仓库：`<source-repo>`（当次白名单迁移使用的外部仓库）
- 来源 commit：`bbfc7cba898a419838f05e5358ccf36417db8ce6`
- 提取方式：只读取该 commit 的已提交内容，不读取来源仓库的未提交能力修改

白名单：

```text
src/remotion/camera        -> src/remotion/capabilities/camera
src/remotion/effects       -> src/remotion/capabilities/effects
src/remotion/media         -> src/remotion/capabilities/media
src/remotion/motion        -> src/remotion/capabilities/motion
src/remotion/sound         -> src/remotion/capabilities/sound
src/remotion/styles        -> src/remotion/capabilities/styles
src/remotion/transitions   -> src/remotion/capabilities/transitions
src/remotion/primitives    -> src/remotion/capabilities/visual-components
```

迁入后的视觉组件继续按职责细分：旧 `scenes`、`media`、`transitions` 子目录分别成为
`scene-patterns`、`media-layouts`、`transition-components`，避免与顶层 runtime media、transition
preset 及 copy-on-configure `scene-templates` 产生同名边界。

迁入后仅有一处基础适配：`sound/library.ts` 的资产 manifest 类型引用改为新仓库
`packages/studio/src/contracts/assets.ts`。其余白名单源码与来源 commit 一致。

明确排除：

- `camera/fixtures/CameraStageShowcase.tsx`；
- 所有旧生产 Scene、Composition、Studio 注册、生成音频和 render 输出；
- 旧 Story-to-Shot v1/v2 合同、receipts 与历史兼容层；
- 来源仓库中的未提交修改；
- 私有 voice/model、stock candidate 与项目级本地数据。

目标设计根据原项目根目录 `VIDEO_STRUCTURE_DESIGN.md` 整理后写入本仓库权威文档；
不复制其“尚未批准实现”的旧项目状态。
