# Remotion Story Producer Roadmap

> 文档类型：未来工作权威
>
> 最后复核：2026-08-07
>
> 当前阶段：M1–M9.5 与 production hardening（含 parallel GlobalVisual contracts）已完成；
> M10 尚未开始

## 用途

本文只回答下一步做什么、进入条件是什么、完成门槛是什么。已完成事实只保留摘要，详细过程
由 evidence 和 archive 保存，不在 Roadmap 重复维护。

## 已完成里程碑

| 阶段      | 结果                                                       |
| --------- | ---------------------------------------------------------- |
| M0        | 产品边界、架构、流程和依赖顺序收口                         |
| M1        | 数据合同、fingerprint 和确定性时间内核                     |
| M2        | 真实 VoxCPM 旁白生成、实测与封存                           |
| M3        | Narrative Baseline runtime 与静态 Story 注册               |
| M4        | 机械 AutoCheck 与失效矩阵                                  |
| M5        | ScenePackage 视听制作规格                                  |
| M6        | ResourceCatalog、Scene contract 和 runtime foundation      |
| M7        | GPS 完整 ScenePackage 集合与正常速度证据                   |
| M8        | Global sound/visual、FinalAssembly、用户批准与 final-v2    |
| M9        | ProductComicVertical 第二主题泛化与 final-v2               |
| M9.5      | 合同驱动生产 CLI、single-writer watcher 与机械 Preview     |
| Hardening | v3 preflight、统一可读性、Composition-owned Scene boundary；future-only v4 N+1 GlobalVisual contracts |

当前实现细节以 [ITERATION_STATUS.md](ITERATION_STATUS.md) 为准；历史计划见
[archive/implementation-plans/](archive/implementation-plans/README.md)。

## 下一里程碑：M10 本地发布收口

M10 必须单独规划并获得授权后才开始。

目标是生成一个可追溯、可复验的本地交付包，而不是连接平台账号或自动发布到网络。

建议范围：

- 冻结被批准作品的 Composition、媒体和 evidence identity；
- 生成本地 release manifest、文件清单和校验和；
- 生成封面/缩略图等明确列入计划的交付资产；
- 提供从 clean checkout 复验交付包的固定命令；
- 更新 changelog/交接说明和发布前检查。

明确排除：

- 代签 `FinalPreviewApproval`；
- 平台上传、账号登录、远程发布、密钥或权限管理；
- 以发布名义修改已封存旁白、字幕、时间线或 Scene；
- 自动执行 promotion 或 NarrativeCheck。

完成门槛：

- 用户已经对 exact current preview 作出明确批准；
- release manifest 与所有文件 checksum 可从仓库事实重算；
- clean checkout 的静态与宿主门禁通过；
- 交付包不包含私有配置、voice profile、临时文件或未跟踪输入；
- 文档和交接明确说明已知限制与复验命令。

## 独立后续能力

以下能力不隐含在 M10 中，必须分别规划：

- NarrativeCheck；
- 用户预览后的定点 Scene 修改循环；
- Scene overlap transition handles；
- Catalog 的预览图、画幅、适用限制和 render cost 元数据；
- 已批准 promotion proposal 的共享能力迁移。

## 全局硬边界

- 只使用宿主机 Node.js/npm、FFmpeg 和 Remotion CLI，不新增 Docker。
- 所有 `remotion` 与 `@remotion/*` 保持相同精确版本。
- sealed PCM 是绝对时间权威，`ttsChunks` 不被工具机械重切。
- JSON 不包含 JSX、代码、动态模块路径或可执行表达式。
- render runtime 不调用 Agent、Skill、MCP、Git、网络或目录扫描。
- ScenePackage、CaptionLayer、GlobalSoundPlan 与 GlobalVisualLayers 的所有权不得重叠。
- 共享能力 promotion 必须有具体 proposal 和用户对范围/API/文件/目标位置的明确批准。
