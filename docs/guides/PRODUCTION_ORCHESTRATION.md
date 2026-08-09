# Production Orchestration

> 文档类型：操作指南
>
> 最后复核：2026-08-10

production 的唯一成功终点是 `render-ready / awaiting-automatic-delivery`。主 Agent随后进入
自动 delivery build；整个 Skill 的终点是 `delivery-render-started`。

## 固定命令

```bash
npm run production:preflight -- --project <storyId>
npm run production:start -- --project <storyId>
npm run production:narrative -- --run <runId>
npm run production:narrative -- --run <runId> --supersede <current-sealed-fingerprint>
npm run production:status -- --run <runId>
npm run production:scene:freeze -- --run <runId>
npm run production:scene:check -- --run <runId> --scene <meaningId>
npm run production:scene:submit -- --run <runId> --scene <meaningId>
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe>"
npm run production:global-visual:check -- --run <runId>
npm run production:global-visual:submit -- --run <runId>
npm run production:global-visual:fail -- --run <runId> --code <CODE> --description "<safe>"
npm run production:watch -- --run <runId>
npm run production:render-ready:check -- --run <runId>
```

未知、重复、缺失或额外参数均非零退出。真实 preflight、start、watch、Remotion、
`npm run compositions` 和 `npm run check` 首次必须直接使用宿主权限；不得用受限沙箱失败证明
VoxCPM/Chromium 不可用，不预热 TTS、不 fallback、不降低 Chromium sandbox。

沙箱诊断失败不能判定 VoxCPM 不可用。

## 当前 inputs 与 narrative

`production:start` 只接受 current authored inputs 和 strict
`production-requirements-current-v1`。preflight v2 在任何 Run write 前检查 VoxCPM `/health`、
`/ready` 与 Remotion Chromium，区分 resident、loading、offloaded 与 model-load-failed；offloaded
只表示首个真实生成请求会自动重载，不发送测试 TTS。选择 `denoise=true` 时还会在真实生成前
检查 resident denoiser 或 `/info` 的 configured capability，不可用则返回脱敏 external blocker。

`production:narrative` 固定完成 narration generation/seal、PCM measurement、SemanticTiming、
CaptionCue、ProjectRegistry、Narrative Baseline evidence 和 AutoCheck。sealed PCM 与
`pcm-cumulative-ceil-v1` 是时间 authority；工具不得拆分或重写 Agent-authored ttsChunks。
第二种命令只用于 Agent-owned Story 返工后的 fresh Run：调用者必须提供当前 active seal 的精确
fingerprint，底层 identity-safe seal 会拒绝缺失或 stale 值。失败 Run、旧 seal directory 与事件均
保持 immutable。
seal 替换后的 M3 evidence 只能由 narrative writer 重建：writer 可替换一个结构有效但 identity-stale
的旧 receipt；普通 evidence check 与 project check 仍 fail closed，禁止手改或删除 receipt 来继续。

## Freeze 与并行 owner

Narrative 到达 `baseline-ready` 后，主 Agent author current VisualStyleSpec、resource pool、
Scene brief、GlobalVisual brief，并执行 Scene freeze 与独立 Cover freeze。

每个 meaningId 得到一个 exclusive Scene assignment；每个 Story 得到一个 whole-film
GlobalVisual assignment。主 Agent并行分发 N Scene owners、一个 GlobalVisual owner 和一个
Cover owner。production watcher 只 join N+1 Scene/GlobalVisual immutable result contracts；
Cover lifecycle 独立。

每个 Scene owner authoring 前必须完整读取并使用 repository-local
`.agents/skills/remotion-best-practices/SKILL.md`，并加载 `remotion-markup/REFERENCE.md` 及当前
Renderer 需要的 routed references。AGENTS、assignment、contracts 与 validators 优先，Skill
不得扩大 exclusive ownership 或 runtime 边界。

Scene root 透明，只绘制 Beat 语义内容；Composition exactly once 提供 SceneSafeArea、全局背景、
字幕与旁白。GlobalVisual 不读取 Scene 输出，不拥有字幕、音频、可见文本或 Scene DSL。

owner 先运行固定 check，返工只修改 assignment-owned 路径。root 复检后串行 submit/fail。
Agent 不写中央 events/state/result/coverage/registry/Composition。repo 不保存 Agent/task/thread/
progress/heartbeat。

## Single writer 与失败语义

`.producer-runs/<runId>/` 包含 immutable manifest、append-only events、immutable Scene results、
one GlobalVisual result、derived state 和 writer lock。每次命令从 contracts、events、results 和
current fingerprints 重算状态；未知 event、gap、stale input、冲突 writer 或 hand-edited state
fail closed。

Agent-owned authoring rejection可返给原 owner；固定 workflow 缺陷不得 retry/resume/skip 或手工
补状态。应保存脱敏 incident，以 Red → minimal Green 修公共流，保持失败 Run immutable，然后
从 `production:start` 建 fresh Run。

## Render-ready handoff

全部 N+1 result ready 后，watcher 确定性生成/检查 Coverage、RendererRegistry、visual/sound
projections、GlobalVisualProjection、FinalAssembly、Composition、ProductionRenderPlan 和
ProductionRenderReady。这里不调用最终 Remotion render，也不创建媒体 evidence。

固定产物：

```text
src/projects/<storyId>/generated/production-render-plan.generated.json
src/projects/<storyId>/generated/production-render-ready.generated.json
```

成功 stdout 返回 `status: render-ready` 与 `handoff: awaiting-automatic-delivery`。
`production:render-ready:check` 只重算 current identities，必须 `noOp: true` 且不追加 event。

随后按 [自动本地交付指南](LOCAL_DELIVERY.md) 检查 Cover、运行 `delivery:build`，并在收到 OS
spawn acknowledgement 后结束。不得在 production 内等待或检查最终 MP4。

production 和 delivery 命令不会自动清理作品。用户明确要求删除一个、多个或全部 Project 时，
只使用 [`project:delete`](../PRODUCTION_WORKFLOW.md#7-作品删除) 删除这些 storyId 的完整本地生产
数据；不得手删 Run event/state 或用删除规避 failed/launch-ambiguous 语义。

## 验证

```bash
node --import tsx --test tests/production/*.test.ts
npm run check:static
npm run compositions
npm run check
```

`check:static` 是浏览器无关子集；`compositions` 与完整 `check` 直接使用宿主权限。
