# 工程结构与硬编码治理实施计划

> 文档类型：已完成实施计划
>
> 日期：2026-08-06
>
> 归档状态：2026-08-06 已完成；当前实现以代码、测试和 active authority docs 为准。

## 目标与不变量

本次只重组制作期工具、验证入口、兼容层和文档，不迁移或回填已有正式作品。新视频继续只走
`scripts/production/cli.ts` 与 `production:*` 命令；render runtime、Scene ownership、sealed PCM
时间权威、静态 registry 和用户批准边界不变。

## 受保护文件

以下路径在改动前已建立 356 个 tracked 文件的 SHA-256 基线；收尾必须逐文件复核零差异：

- `src/projects/gps-relativity/` 与 `src/projects/product-comic-vertical/`；
- `public/projects/gps-relativity/` 与 `public/projects/product-comic-vertical/`；
- 其中重点包括 sealed narration、SemanticTiming、全部 ScenePackage、coverage、RendererRegistry、
  FinalAssembly、FinalPreviewEvidence、FinalPreviewApproval、review 与正式媒体资产。

本次允许修改通用源码、测试、package scripts 和 active 文档，但不得通过 writer 重写上述路径。

## 历史目录逐文件审计

| 当前文件                                    | 分类                                   | 当前用途                                  | 迁移目标                                                              |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `scripts/m6-proof/generate-assets.ts`       | synthetic proof fixture writer/checker | 生成 proof 专属 PCM fixture               | `scripts/proofs/scene-runtime/generate-assets.ts`                     |
| `scripts/m6-proof/generate.ts`              | synthetic regression proof application | 生成/检查独立 Scene runtime proof         | `scripts/proofs/scene-runtime/generate.ts`                            |
| `scripts/m6-proof/evidence.ts`              | synthetic proof evidence checker       | 检查 still/render/receipt                 | `scripts/proofs/scene-runtime/evidence.ts`                            |
| `scripts/m7-gps/generate-local-audio.ts`    | GPS 项目专属制作工具                   | 历史 authoring；`check:host` 只读复验资产 | `scripts/project-tools/gps-relativity/scene-audio.ts`                 |
| `scripts/m7-gps/freeze-inputs.ts`           | GPS 项目专属声明投影                   | 历史 writer；当前只读检查冻结输入         | `scripts/project-tools/gps-relativity/scene-inputs.ts`                |
| `scripts/m7-gps/author-scenes.ts`           | 一次性 GPS Scene authoring 工具        | 测试保留；不再是公共生产 API              | `scripts/project-tools/gps-relativity/historical-scene-authoring.ts`  |
| `scripts/m7-gps/evidence.ts`                | GPS Scene evidence checker             | 正式作品 current evidence 门禁            | `scripts/project-tools/gps-relativity/scene-evidence.ts`              |
| `scripts/m8-gps/generate-global-audio.ts`   | GPS 项目专属制作工具                   | 历史 writer；当前只读复验全局音频         | `scripts/project-tools/gps-relativity/global-audio.ts`                |
| `scripts/m8-gps/freeze-inputs.ts`           | GPS final assembly 项目投影            | 历史 writer；当前只读复验                 | `scripts/project-tools/gps-relativity/final-inputs.ts`                |
| `scripts/m8-gps/evidence.ts`                | GPS final evidence adapter             | 正式作品 current evidence 门禁            | `scripts/project-tools/gps-relativity/final-evidence.ts`              |
| `scripts/m8-gps/approval.ts`                | GPS approval adapter                   | 只读检查用户批准；writer 仅历史追溯       | `scripts/project-tools/gps-relativity/approval.ts`                    |
| `scripts/m9-product/comic-design-system.ts` | Product Comic 项目声明校验             | 项目专属设计/overlay 合同                 | `scripts/project-tools/product-comic-vertical/design-system.ts`       |
| `scripts/m9-product/scene-audio.ts`         | Product Comic 项目专属制作工具         | 历史 writer；当前只读复验 Scene 音频      | `scripts/project-tools/product-comic-vertical/scene-audio.ts`         |
| `scripts/m9-product/global-audio.ts`        | Product Comic final 项目投影/音频      | 历史 writer；当前只读复验                 | `scripts/project-tools/product-comic-vertical/global-audio.ts`        |
| `scripts/m9-product/shotcraft-inventory.ts` | 项目专属历史来源与 inventory 工具      | 现有 source/coverage/fidelity 测试        | `scripts/project-tools/product-comic-vertical/shotcraft-inventory.ts` |
| `scripts/m9-product/scene-evidence.ts`      | Product Comic Scene evidence checker   | 正式作品 current evidence 门禁            | `scripts/project-tools/product-comic-vertical/scene-evidence.ts`      |
| `scripts/m9-product/final-evidence.ts`      | Product Comic final evidence adapter   | 正式作品 current evidence 门禁            | `scripts/project-tools/product-comic-vertical/final-evidence.ts`      |
| `scripts/m9-product/approval.ts`            | Product Comic approval adapter         | 只读检查用户批准；writer 仅历史追溯       | `scripts/project-tools/product-comic-vertical/approval.ts`            |

这些文件没有被新 production CLI 调用。迁移后测试也按 `proofs/` 与 `projects/<project-id>/`
组织，不再把 M6/M7/M8/M9 当作当前架构目录。历史 writer 不再暴露 `package.json` 公共命令；
其源码保留用于追溯和现有回归测试，目录 README 明确禁止作为新生产说明。

## 迁移与实现步骤

1. **结构红线测试**：先让测试声明禁止 `scripts/m6-proof|m7-gps|m8-gps|m9-product` 和对应
   milestone test 目录，并声明允许的稳定职责目录。
2. **语义目录迁移**：移动 proof、GPS 与 Product Comic 工具和测试，同步全部静态 imports；
   不触碰两正式项目与 `public/`。
3. **正式项目验证清单**：新增静态、版本化、schema 校验的 verification profile manifest，
   只保存枚举 step ID；固定 runner 显式映射已知 adapter，不扫描目录、不执行任意 shell。
   `check:host` 改为 Composition 门禁加 profile runner。新增项目只增 profile 与显式 adapter。
4. **语义化公共命令**：proof 改为 `proof:scene-runtime:*`；正式作品使用
   `project:verify`、`project:evidence:check`、`project:approval:check`。移除所有 `m6:*`、
   `m7:*`、`m8:*`、`m9:*` 公共脚本。
5. **readability 合同检查**：用 TypeScript AST/行为合同验证 shared Scene boundary 的 import、
   JSX ownership 和 policy property 使用；格式化、局部变量名和 import 排序不得影响结果，
   缺失 wrapper/provider/边界绑定仍 fail closed。
6. **scaffold 生成**：用一个结构化 options renderer 直接生成 narrative、v2 preview、v3 preview
   和 Scene runtime 模板；删除所有精确多行 `replaceRequired()` patch。输出仍 byte-stable、幂等，
   且只替换 byte-exact generated scaffold。
7. **兼容隔离**：新增 `scripts/compatibility/formal-project-artifacts-v1.ts`，集中 GPS legacy M3
   registry checksum 与 legacy final evidence path；通用 baseline/final checker 不再包含项目 ID
   分支。兼容映射只读，不迁移 v1/v2 文件。
8. **运行配置与 PCM 权威**：在 `production-run` 合同导出默认 policy 与 parser；默认仍为
   1000ms/30min，policy 已进入 Run fingerprint。两个 normalizer 读取
   `CANONICAL_NARRATION_PCM.sampleRate`，补行为测试。
9. **Skill 与文档测试**：增加 machine-readable Skill policy fixture，测试 heading、命令集合与
   policy IDs，不再锁定完整英文句子；保留 isolated Scene、fixed-flow、preflight、透明边界、
   mechanical preview 和 no-push 等机械政策。
10. **文档治理**：清理 bootstrap guide 本机路径；更新 README、Architecture、Deterministic、
    Workflow、Status、导航和项目工具历史说明；计划完成后归档并修复链接。

## 兼容边界

- `production-readability-v1`、`scene-composition-boundary-v1`、标准文件名、Story ID fail-closed
  binding、ProjectRegistry literal import 和 Remotion 精确版本继续保持有意冻结。
- GPS 继续读取 `m8-final-preview-evidence.generated.json`；Product Comic 继续读取 canonical
  `final-preview-evidence.generated.json`。两者冲突时仍 fail closed。
- GPS M3 legacy registry checksum 只通过版本化 compatibility map 解析；其他项目继续使用
  current generated entry checksum。
- 正式项目 profile 不降低任何现有检查：narrative、Scene inputs/evidence、global audio、
  final inputs/assembly/evidence/approval/final mechanical check 全部保留原顺序。

## 验证

每个迁移先跑对应聚焦测试。最终 fresh 验证至少包括：

```bash
npm run check:static
npm run check
npm run compositions
```

另执行正式项目 profile、proof check、文档链接、保护基线逐文件 SHA-256 对比、`git diff`、
`git status` 和敏感/临时文件审计。只有全部通过后才本地提交；不 push。
