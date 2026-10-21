# 文档导航

> 文档类型：唯一导航入口
>
> 最后复核：2026-10-19

先按问题选择文档，不要从历史计划或 evidence 反推 current implementation。

## 权威文档

| 问题                         | 文档                                           |
| ---------------------------- | ---------------------------------------------- |
| 最终产品目标与不可偷换边界   | [FINAL_PRODUCT_GOAL.md](FINAL_PRODUCT_GOAL.md) |
| 包、模块、数据流与写入所有权 | [ARCHITECTURE.md](ARCHITECTURE.md)             |
| 当前已实现与未实现事实       | [ITERATION_STATUS.md](ITERATION_STATUS.md)     |
| 下一阶段与发布门槛           | [ROADMAP.md](ROADMAP.md)                       |
| 精确名词边界                 | [TERMINOLOGY.md](TERMINOLOGY.md)               |

制作一部片的方法由 Workspace 里的 `axmorf-film` Skill 负责（仓库副本：
[`.agents/skills/axmorf-film/SKILL.md`](../.agents/skills/axmorf-film/SKILL.md)）。
文档冲突时先用 executable code/tests 确认 repo truth，再修正文档；不能把目标写成实现。

## 操作与维护指南

| 主题                                    | 文档                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| 主流 Agent 入口、最低能力与宿主适配边界 | [guides/AGENT_COMPATIBILITY.md](guides/AGENT_COMPATIBILITY.md) |
| 私有制作配置：渲染默认值、片头片尾、TTS | [guides/PRODUCER_CONFIG.md](guides/PRODUCER_CONFIG.md)         |
| 两道门的发布流程                        | [guides/RELEASE.md](guides/RELEASE.md)                         |

## 证据、方案与历史

- `evidence/` 记录发生时的验收证据，不定义 current runtime；例如
  [Edge TTS 请求节奏诊断](evidence/2026-10-15-edge-tts-pacing.md)。
- `promotions/` 保存实施中的方案：[Direct Film 生产方案](promotions/2026-10-14-direct-film-production.md)
  （0.3.0 发布后归档）、[审片渲染实测可读性提示](promotions/2026-10-20-review-readability-measurement.md)。
- [archive/](archive/README.md) 保存已完成或被取代的计划、0.2.0 之前的状态历史，以及 0.3.0 删除的
  Project production 主链文档与证据，仅供追溯。

## 管理规则

[DOCUMENTATION_POLICY.md](DOCUMENTATION_POLICY.md) 定义单一事实来源、目录生命周期、归档与完成门槛。
active Markdown 本地链接和 current 操作文档引用的 npm scripts 必须通过：

```bash
npm run docs:check-links
```
