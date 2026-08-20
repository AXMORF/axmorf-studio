# Production orchestration

> 文档类型：操作指南

Root 负责 authoring、plan、dirty-only delegation、child terminal barrier 和一次 converge。repository 不创建或
监控 Agent；聊天不持久化，ArtifactAttestation 才是 authority。

## 1. Plan

```bash
npm run project:produce:plan -- --project <storyId>
```

真实 project-production preflight 首次使用宿主权限。沙箱诊断不能证明 VoxCPM 不可用，不得降低 Chromium
sandbox、预热 TTS 或增加 fallback。

保存输出的 `revisionId`、summary 和 `dirtyAgentTasks`。相同 inputs 的 valid artifact 必须显示 `reused`。
planner 会为 non-reused tasks 建 `.producer-work/<storyId>/<taskRevision>/`，其中 `task.json` 与
`inputs/context.json` 是 immutable fixed inputs。

## 2. Dispatch only dirty Agent tasks

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

## 3. Wait, then converge once

等待全部已派发 child 到达 committed/current、明确 task failure 或 host failure。无论聊天暗示 artifact 是否
齐全，一次编排尝试只运行一次：

```bash
npm run project:produce:converge -- --project <storyId> --revision <revisionId>
```

converge 自行重新计划和检查 Artifact Store。stale revision 或 incomplete artifacts 在任何 live mutation 前
返回；不信任聊天。齐全后 fixed code 受控物化、刷新 derived Project、复验 attested bytes，并同步构建和验证
current delivery。

| outcome | 含义 |
| --- | --- |
| `producer-revision-stale` | authoring inputs 已变化，本次 revision 不可采用 |
| `producer-artifacts-incomplete` | 至少一个 required artifact 缺失或无效，未完成交付 |
| `project-production-complete` | 新四文件 package 已同步生成、复验并提升 current |
| `project-production-current` | 同 identity current package 已复验，media 未重写 |

若 attempt 失败，重新 plan；valid earlier artifacts 自动 reused，只派发仍 dirty tasks。不要复制 identity、手改
manifest 或绕过 validator。

## 4. Host verification

实现改动按风险运行：

```bash
npm run check:static
npm run compositions
npm run check
```

真实 media/Chromium checks 首次使用宿主权限；沙箱 loopback/browser 失败不等于 provider/runtime 缺陷。
