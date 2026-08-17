# Production orchestration

显式 audited production 使用运行环境原生子 Agent 创作，并由主 Agent等待全部 child 宿主终态后只调用
一次 foreground `production:finalize`。repository 不创建或监控 Agent；聊天终态不持久化，
assignment-bound receipt 是唯一 authority。

## 1. Freeze

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
```

真实 production preflight、narrative、foreground finalize 和 Chromium-backed gates 首次直接使用宿主权限；
不预热 TTS、不 fallback、不降低 Chromium sandbox，也不使用 `--no-sandbox`。沙箱内的诊断失败
不能据此判定 VoxCPM 不可用。

记录 `ownerMeaningIds`、`templateMeaningIds`、GlobalVisualAssignment 和 CoverAssignment。template-copy
Scene 由脚本机械验证/direct-result，不创建 child 或 receipt。

## 2. Delegate owners

在同一 checkout 使用 runtime-native child Agents：

- 每个 `ownerMeaningIds` Scene 一个 child；
- 整个 Story 一个 GlobalVisual child；
- 整个 Story 一个 Cover child。

每个 prompt 必须自包含 runId、assignment path、exclusive paths、必读 repository-local Skill/reference、
focused check 和 exact ready/failed receipt 命令。容量受限时可分批，但一 owner 一 child。无原生子 Agent
能力或不能共享 checkout 时 fail closed；主 Agent不得内联创作 owner，也不得使用 worktree 替代。
Scene child 必须完整读取 repository-local `remotion-best-practices` 及当前 Renderer 所需 reference。

Scene child 先取得 `production:scene:check` 的 `ready-to-submit`，再发布 one `owner-ready`；明确无法完成
时发布 one `owner-failed`。GlobalVisual/Cover 同样只写 assignment-exclusive paths 并发布一次 receipt。
所有 child 最终只返回 `owner-ready`、`owner-failed` 或 `host-failed` 最小终态信号。

## 3. Wait, then finalize once

主 Agent等待所有已派发 child 进入成功、明确失败或宿主失败终态。等待完成后，不读作品、不逐项 submit、
不调用 status 轮询、不代发 receipt；无论聊天结果暗示 receipt 是否齐全，都只执行一次：

```bash
npm run production:finalize -- --run <runId>
```

同一编排尝试不重复 finalize。fixed command 获取唯一 Run writer lock，先验证 inbox 和 required Scene /
GlobalVisual receipts。缺失时在任何 stage/result/event/state 写入前返回稳定排序的
`owner-receipts-incomplete`。required 齐全后，它串行 fixed check/submit、写 immutable OwnerResult 与
events、收敛 render-ready；Cover 在 render-ready 后处理。

结果语义：

| status | exit | 含义 |
| --- | ---: | --- |
| `delivery-render-started` | 0 | audited delivery detached spawn 已确认 |
| `owner-receipts-incomplete` | 2 | required receipt 缺失，ledger/results/state 未改 |
| `production-failed` | 2 | Scene/GlobalVisual 或 fixed production 已形成 terminal failure |
| `render-ready-delivery-blocked` | 2 | Cover missing/failed，render-ready 保留 |
| unexpected safe stderr | 1 | 合同、路径、锁或宿主异常，fail closed |

`delivery-render-started` 不是最终 MP4 完成、有效或已发布。intent-without-receipt 的 delivery launch 仍是
permanent `launch-ambiguous`，不得自动重试。

## 4. Read-only status

```bash
npm run production:status -- --run <runId>
```

status 使用同一 expected-owner 规则，区分 render-ready required 与 delivery-only Cover receipts，
template-copy 不会误报。它只读，不创建 child、不调用 finalize、不修复 state。
