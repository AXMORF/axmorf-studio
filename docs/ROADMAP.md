# Remotion Story Producer Roadmap

> 文档类型：未来工作权威
>
> 最后复核：2026-08-08
>
> 当前阶段：M1–M10 与 production hardening（含 parallel GlobalVisual contracts）已完成

## 用途

本文只回答下一步做什么、进入条件是什么、完成门槛是什么。已完成事实只保留摘要，详细过程
由 evidence 和 archive 保存，不在 Roadmap 重复维护。

## 已完成里程碑

| 阶段      | 结果                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| M0        | 产品边界、架构、流程和依赖顺序收口                                                                    |
| M1        | 数据合同、fingerprint 和确定性时间内核                                                                |
| M2        | 真实 VoxCPM 旁白生成、实测与封存                                                                      |
| M3        | Narrative Baseline runtime 与静态 Story 注册                                                          |
| M4        | 机械 AutoCheck 与失效矩阵                                                                             |
| M5        | ScenePackage 视听制作规格                                                                             |
| M6        | ResourceCatalog、Scene contract 和 runtime foundation                                                 |
| M7        | GPS 完整 ScenePackage 集合与正常速度证据                                                              |
| M8        | Global sound/visual、FinalAssembly、用户批准与 final-v2                                               |
| M9        | ProductComicVertical 第二主题泛化与 final-v2                                                          |
| M9.5      | 合同驱动生产 CLI、single-writer watcher 与机械 Preview                                                |
| M10       | exact approved preview 的不可覆盖本地 release、双比例封面、发布元数据与固定复验                     |
| Hardening | v3 preflight、统一可读性、Composition-owned Scene boundary；future-only v4 N+1 GlobalVisual contracts |

当前实现细节以 [ITERATION_STATUS.md](ITERATION_STATUS.md) 为准；历史计划见
[archive/implementation-plans/](archive/implementation-plans/README.md)。

## M10 已完成边界

M10 以独立 `delivery:*` 层完成本地发布收口：固定读取 current、checksum-bound、用户已批准的
exact preview 与 passing `final-mechanical-check-v2`，输出到 ignored
`deliveries/<storyId>/<releaseId>/`。release 不可覆盖，相同 identity 只做幂等复验；交付包
包含原字节 H.264/AAC MP4、两个 Project-owned Remotion Still 封面、publishing metadata、
release manifest、checksum ledger 和 handoff。

该里程碑没有代签批准、改写正式作品、扩张 `production:*`、连接平台、登录账号、使用网络或
密钥，也没有执行 promotion、NarrativeCheck、Project 删除或 `out/` 清理。首个真实证明使用
`product-comic-vertical`，详见 [M10 evidence](evidence/2026-08-08-m10-local-delivery.md)。

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
