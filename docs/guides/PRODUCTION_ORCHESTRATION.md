# Production orchestration

> 文档类型：操作指南

Root 负责 authoring、inspect-and-report、explicit prepare、dirty-only delegation、当前任务内的 child terminal
barrier 和一次 converge。repository 不创建或监控 Agent；聊天不持久化，ArtifactAttestation 才是 authority。

## 1. Inspect and report before cost

```bash
npm run project:produce:inspect -- --project <storyId>
```

inspect 严格只读且零 provider call：不取 mutation lock，不创建/刷新 cache、artifact、workspace、attempt 或
delivery。它返回 sourceState、baseline、estimated provider/cache/Agent/delivery cost、task explanations 与
nextAction；unknown 必须保持 `null`。前后 source snapshot 漂移时返回 `inspection-source-drift`，不自动 retry。

Root 在任何有成本操作前先向用户报告 readiness、预计成本、reuse、direct changes、dependency propagation、
artifact state 与 blockedBy。explanation/baseline 只用于诊断，不决定或改变 production identity/dispatch。

真实 project-production preflight 首次使用宿主权限。沙箱诊断不能证明 VoxCPM 不可用，不得降低 Chromium
sandbox、预热 TTS 或增加 fallback。

## 2. Prepare explicitly

```bash
npm run project:produce:prepare -- --project <storyId>
```

prepare 是唯一允许 provider/cache/seal/master/timing、fixed artifact、dirty workspace 与 ExecutionAttempt 写入
的 public production 入口。它先完成所有可只读验证；若 narration 后仍缺 timing-bound authoring，返回
`project-authoring-required` 和 logical missing inputs，不创建 owner workspace 或假 Revision。

production inputs ready 时保存 `attemptId`、`revisionId`、summary、estimated/actual cost、taskExplanations 和
`dirtyAgentTasks`。相同 inputs 的 valid artifact 必须显示 `reuse`。prepare 只为 dirty Agent tasks 建
`.producer-work/<storyId>/<taskRevision>/`，其中 `task.json` 与 `inputs/context.json` 是 immutable fixed inputs。

## 3. Dispatch only dirty Agent tasks

只派发 dirty `scene-owner`、`global-visual-owner`、`cover-owner`。一个 TaskRevision 一个 runtime-native
child，共享当前 checkout，不使用 worktree。`scene-template` 与 narration/convergence/delivery fixed tasks
不创建 child。

每个 child prompt 必须包含 storyId、revisionId、taskRevision、唯一 workspace、必读 Skill/reference、
focused check 和 commit command。Scene child 完整读取 repository-local `remotion-best-practices`。

child 只能在自己的 workspace 循环：

```bash
npm run project:task:check -- --task <taskRevision>
npm run project:task:commit -- --task <taskRevision>
```

check 是只读；commit 重跑同一 validator。校验失败由同一 child 修正 workspace 后重跑，不把失败状态当
控制流。commit 成功后 child 停止写入，只返回 artifact-committed/artifact-current；明确不能完成返回
task-failed，宿主失败返回 host-failed。Root 不读取其他 child workspace、不代 commit、不内联替代 dirty task。

## 4. Wait, then converge once

只在当前任务内等待全部已派发 child 到达 committed/current、明确 task failure 或 host failure；不创建常驻
Agent、watcher 或 scheduler。无论聊天暗示 artifact 是否齐全，一次编排尝试只运行一次：

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

converge 使用 read-only current replan 检查 Revision 与 Artifact Store；不调用 provider、不创建 workspace 或
new attempt。stale revision 或 incomplete artifacts 在任何 live mutation 前返回；不信任聊天。齐全后 fixed
code 受控物化、刷新 derived Project、复验 attested bytes，并同步构建和验证 current delivery。

| outcome | 含义 |
| --- | --- |
| `producer-revision-stale` | authoring inputs 已变化，本次 revision 不可采用 |
| `producer-artifacts-incomplete` | 至少一个 required artifact 缺失或无效，未完成交付 |
| `project-production-complete` | 新四文件 package 已同步生成、复验并提升 current |
| `project-production-current` | 同 identity current package 已复验，media 未重写 |

若 attempt 失败，重新 inspect、向用户报告、再显式 prepare；valid earlier artifacts 自动 reuse，只派发仍
dirty tasks。这不是自动 retry。不要 provider fallback、跨 Project reuse、复制 identity、手改 manifest 或绕过
validator。

## 5. Host verification

实现改动按风险运行：

```bash
npm run check:static
npm run compositions
npm run check
```

真实 media/Chromium checks 首次使用宿主权限；沙箱 loopback/browser 失败不等于 provider/runtime 缺陷。
