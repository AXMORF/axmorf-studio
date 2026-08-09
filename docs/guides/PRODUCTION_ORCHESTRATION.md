# Production Orchestration

> 文档类型：操作指南
>
> 最后复核：2026-08-10

主 Agent 的终点是 watcher 获得 OS spawn acknowledgement 且全部 owner `create_thread` 调用成功；
后台 production 终点是 `render-ready / awaiting-automatic-delivery`，watcher 自动继续到
`delivery-render-started`。

## Root 固定命令

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:status -- --run <runId>
npm run production:scene:freeze -- --run <runId>
npm run delivery:cover:freeze -- --project <storyId>
npm run production:watch:start -- --run <runId>
```

真实 production preflight、narrative、watch start 和 Chromium-backed gates 首次直接使用宿主权限；不预热 TTS、
不 fallback、不降低 Chromium sandbox，也不使用 `--no-sandbox`。沙箱内的诊断失败不能据此判定
VoxCPM 不可用。watch start
exactly once 写 intent，再以 fixed cwd/argv/log、
`shell:false`、`detached:true` spawn；只有 OS `spawn` 后写 receipt。intent-only 永久 ambiguous。

## 独立 owner task

watcher receipt 写入后，主 Agent 使用 Codex `create_thread` 创建：

- 每个 meaningId 一个 Scene task；
- 一个 whole-film GlobalVisual task；
- 一个 Cover task。

所有任务共享 checkout，不用 worktree/branch/merge，写入路径互不重叠。prompt 必须包含 runId、
assignment path、exclusive paths；Scene prompt 必须完整读取 repository-local
`.agents/skills/remotion-best-practices/SKILL.md` 及 assignment 所需 reference。owner 只使用以下
唯一完成命令：

```bash
npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>
npm run production:owner:ready -- --run <runId> --owner global-visual
npm run production:owner:ready -- --run <runId> --owner cover

npm run production:owner:failed -- --run <runId> --owner scene --scene <meaningId> --code <CODE> --description "<safe>"
npm run production:owner:failed -- --run <runId> --owner global-visual --code <CODE> --description "<safe>"
npm run production:owner:failed -- --run <runId> --owner cover --code <CODE> --description "<safe>"
```

owner 不 bootstrap、不运行 submit/delivery、不写中央 state/event/result/registry、不 stage/commit。
root 不运行 check/submit，不调用 `wait_threads`、`read_thread` 或 status polling；全部创建调用成功后
立即结束。部分派发失败时报告未派发 assignment，已启动 watcher 不取消。

## Inbox 与 single writer

receipt 按 assignment identity 隔离，绑定 run/story/owner/meaningId、assignment/task/requirements、
排序后的规范化 output manifest/checksum 与 receipt fingerprint。同内容 replay no-op；冲突、
malformed、stale、symlink、escape、unknown file 或 checksum drift fail closed。repository 不存
threadId/taskId/progress/heartbeat/chat。

缺失 receipt 时状态固定为 `waiting-for-owner-results`，无 timeout、heartbeat、retry 或 replacement
task。外部可以为同一 immutable assignment 新建任务。explicit failed receipt immutable。

detached watcher 是唯一中央 writer：它串行验证 receipts，执行 fixed Scene/GlobalVisual/Cover
check/submit，写 formal results/events，汇合 registry/projections/Composition，创建 render plan/ready。
Cover 缺失不阻止 render-ready，但阻止 delivery。Cover ready 后 watcher 自动调用 `delivery:build`，
到 `delivery-render-started` 后停止，不等待、读取、hash、probe 或 decode MP4。

## 只读状态

```bash
npm run production:status -- --run <runId>
```

status 明确列出 `missingOwnerAssignments`。它只读，不触发 timeout、retry、thread creation 或状态修复。

## 验证

```bash
node --import tsx --test tests/production/*.test.ts
npm run check:static
npm run compositions
npm run check
```

`check:static` 是 browser-free 子集；完整 `check` 首次直接使用宿主权限。
