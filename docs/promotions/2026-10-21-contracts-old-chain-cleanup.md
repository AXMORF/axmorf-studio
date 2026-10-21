# 清理 contracts 中的旧主链残留

> 文档类型：实施计划
>
> 状态：已实施（2026-10-21，维护者确认；未发布，随 0.3.0 正式版前的 rc 一并验收）。完成并记入
> [ITERATION_STATUS.md](../ITERATION_STATUS.md) 后移入 `docs/archive/implementation-plans/` 并补归档说明。

## 1. 目标

0.3.0 删除了 Project production 主链，但 `packages/studio/src/contracts/` 仍导出旧主链的 Story、语义时序、
资源目录、Scene 可读性等合同（约 3 千行）。2026-10-21 逐个导出名检索（`packages/studio/src` 非 contracts 部分、
`scripts/`、`settings/`、`src/`、`tests/`、creator 的 `src`/`scripts`/`template`）：296 个导出中 181 个在任何地方都无引用，
旧主链模块几乎整体只被彼此或测试引用。本批把它们从 `@axmorf/studio/contracts` 删除，属于 0.3.0 范围内的
公开导出破坏性变更（维护者已确认）。

## 2. 现有引用（需要保留或迁移的活引用）

| 模块                     | 仍被产品代码使用的导出                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene-readability`      | `CAPTION_MAX_DISPLAY_HALF_UNITS`、`countCaptionDisplayHalfUnits`（`film.ts` 的 72 half-units 预算）                                              |
| `semantic-timing`        | `pauseMsToSampleFrames`（`scripts/narration/domain/pcm-wav.ts`）                                                                                 |
| `resource-catalog`       | `ResourceIdSchema`、`ResourceAssetDescriptor(Schema)`、`ResourceDescriptor`、`assertResourceAllowedForUse`（片头片尾模板、音效库、共享素材清单） |
| `scene-motion`           | `MotionObjectState`、`SceneMotionPlan`、`resolveMotionTrackState`（公开的 `ProducerMotionObject`）                                               |
| `scene-template`         | `SceneTemplateIdSchema`（`producer-config`）                                                                                                     |
| `background-music`       | `AutomaticBackgroundMusicSchema`（`producer-config` 兼容保留字段）                                                                               |
| `visual-theme`、`assets` | 片头片尾主题与共享素材清单                                                                                                                       |

只被测试引用的旧导出：`StorySpecSchema`、`TTSChunk`、`computeGenerationInputFingerprint`、`computeStoryFingerprint`、
`SceneViewport`（`tests/contracts/fingerprint.test.ts`、`tests/narration/private-config.test.ts`、
`tests/narration/voxcpm-client.test.ts`、`tests/fixtures/narrative.ts`、`tests/runtime/scene-templates.test.tsx`）。

## 3. 设计

1. **迁移活引用**：caption half-unit 计数与上限移入 `film.ts`（或一个小的 caption 模块，由 `film.ts` 使用）；
   `pauseMsToSampleFrames` 移到旁白相关的 contracts 模块或 `scripts/narration` 内部。名称与行为保持不变。
2. **删除整模块**：`story`、`semantic-timing`、`scene-readability`、`generation-input`、`generated-artwork`、`render`，
   以及迁移后不再被需要的其他文件。
3. **裁剪保留模块**：`resource-catalog`、`scene-motion`、`scene-primitives`、`scene-template` 只保留第 2 节活引用及其
   传递依赖；删除只被已删模块使用的导出。
4. **不做全量 dead-export 清扫**：`film`、`producer-config`、旁白/音色（`narration*`、`sealed-narration`、
   `mastered-narration`、`tts-provider-registry`）、`synthesized-music`、`visual-theme`、`assets`、`fingerprint`、
   `primitives` 是 film、Web 配置与旁白的当前合同，本批只删除仅被第 2 步删除模块引用的导出，其他导出保持不变。
5. **测试**：只测试已删合同的用例删除；用已删类型做 fixture、实际验证现行行为的测试改用现行类型（例如 voxcpm
   测试用结构等价的本地类型）。不得为了让测试通过而保留已删合同。
6. **公开 Remotion 面不变**：`@axmorf/studio/remotion` 的导出（含 `ProducerMotionObject`）不变。

## 4. 涉及文件

- `packages/studio/src/contracts/`（含 `index.ts`）
- 迁移活引用涉及的 `packages/studio/src/remotion/capabilities/**`、`scripts/narration/domain/pcm-wav.ts` 的 import
- 第 2 节列出的测试文件
- 文档：`docs/ITERATION_STATUS.md` 新增未发布条目；`docs/ARCHITECTURE.md` 第 2 节 contracts 描述如有不准确则改；
  `packages/studio/README.md` 的 contracts 描述保持准确

不改：依赖、版本号、`@axmorf/studio/remotion` 导出、film/Web/旁白行为、交付、Skill。

## 5. 验收

- 上述模块删除或裁剪后，`grep` 不再能在 `packages/`、`scripts/`、`settings/`、`src/`、`tests/` 中找到已删导出名
  （归档文档除外）。
- `npm run check` 通过（基线：2026-10-20 审片可读性改动后 330 项测试通过）；报告测试数变化及每个删除测试的理由。
- `npm --workspace @axmorf/studio run build:types` 生成的 `dist/contracts.d.ts` 不再包含 `StorySpec`、`SemanticTiming`
  等旧名；报告 `dist` 中 contracts 产物体积前后对比。
- `film:check` 的 72 half-units 规则与旁白停顿 PCM 换算的现有测试保持通过且行为不变。

## 6. 风险

- 外部代码 import 已删合同会编译失败：0.3.0 本就是破坏性版本，creator 模板与 Skill 不引用这些名称；
  旧 Project 源码在 `src/projects/` 中不被注册，`film:check` 的 TypeScript program 只包含 film 文件（`scripts/films/check.ts`）。
- 误删仍被使用的导出：以 `npm run check`（typecheck、构建与宿主 compositions）为准。

## 7. 基线

分支 `axmorf/review-readability`（自 `origin/axmorf/npm-workspace-open-source` 的 `1ac6458` 创建），审片可读性改动
已作为单独提交在本批之前完成。不推送、不发布。
