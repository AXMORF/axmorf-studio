# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

当前架构基线是单一 Project production 主链：ProductionRevision → content-addressed Task DAG → reusable
ArtifactAttestation → atomic materialization → synchronous exact four-file delivery。旧执行账本与异步交付不再是
active runtime authority。公开入口已分为 atomic create、strict read-only inspect、explicit costly prepare、
attempt-bound zero-write task bind、bound describe/finalize/check/commit/fail、explicit failed-attempt recovery/reissue
与 fixed continuation；现有作品修改使用 strict exact-base revision candidate 和受控 promotion；converge 是
continuation 内部 application，不是 Root 命令。

基线门槛包括：

- identity 不含 attempt/clock/process/absolute path；
- create existing/partial/conflicting target fail closed，相同 creation identity 只读 current，零 provider/media；
- revision context 同时复验 current Revision 与 exact-four Delivery；candidate 隔离所有 Project-owned mutable roots，
  promotion 前不得改 live，promotion failure 完整 rollback 且只允许独立 promote retry；
- Root 在任何成本前报告 inspect 的 source readiness、unknown-safe estimate、reuse 与逐任务失效解释；
- prepare 才允许 provider/fixed artifact/workspace/attempt mutation；converge 不允许这些 preparation 副作用；
- diagnostic explanation/baseline/attempt 不进入或改变 production/artifact/delivery authority；
- execution mode 按用户提示词、settings、内置 `subagents`/4 默认解析；inline 一次一个 workspace，subagents bounded pool
  最多四个且需要本次 verified `shared-workspace` 或 `controller-io` transport；transport 不持久化；一个 dirty
  task 只归属一个 executor，template task 不由 Agent 创作；
- Composition exactly once 拥有 raw readability/insets 与 SceneViewport mount；Scene child 只看到
  safe-area-local viewport dimensions/min font size，不得恢复 full-frame authority；
- 每个 dirty Agent task 绑定 immutable、attempt-neutral TaskExecutionContract；新 contract 只让对应 task artifact
  一次失效，current delivery 不动；
- `task bind` 在任何 content read/write 前以零写入校验 exact attempt/contract。shared-workspace 只授予 declared
  workspace capability；controller-io 只授予 strict bound file read/write。describe/finalize/check/commit/task failure
  要求 full binding；spawn/fixed failure 仅有更窄的 exact terminal authority；
- continuation 启动后 Root 以原进程阻塞等待/事件通知低 token 监督，错误时诊断并指导原 executor；bounded fixed continuation 以 atomic claim 单消费者运行，failure/attempt 创建起一小时
  timeout fail-fast，all-success 只 converge 一次；
- artifact hit 严格复验 exact file set、no-symlink、size/checksum/dependencies/policy；
- convergence stale/incomplete/drift fail closed 且 materialization 有 rollback；
- delivery 同步等待和验证 exact four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用；
- 每个用户请求最多自动恢复一次已证明的视频任务错误；旧 continuation/workers 全退出后，显式 read-only/zero-provider
  recover inspection ready 才 same-Revision reissue，使用 fresh workers。旧 attempt immutable，reissue 不要求 current delivery；
  active/stale/fixed-flow recovery fail closed，系统/外部/未知故障只诊断报告。

## 当前里程碑状态

从 `foundation@e52d2a5` 开始的
[npm Workspace 开源方案](archive/implementation-plans/2026-08-30-npm-workspace-open-source-implementation-plan.md)
已经完成并归档。当前 `@axmorf/studio@0.1.3`、`create-axmorf-studio@0.1.3` 与 GitHub `v0.1.3` Release 已通过
Trusted Publisher 纯 OIDC 公开发布；package-owned shared Workspace media、Organization transfer、default branch
与 provenance workflow 均已完成。精确实现和验收事实只由
[ITERATION_STATUS.md](ITERATION_STATUS.md) 与
[v0.1.3 Mixkit bookend audio release](evidence/2026-09-05-v0.1.3-mixkit-bookend-audio-release.md) 维护。

当前用户入口是 README 的“快速开始”，或者复制一句 Agent prompt，让 Agent 根据项目最新 README 在指定
路径完成 Workspace 搭建与可用性验收。Workspace ready 后，generated README 的独立视频 prompt 才负责接收创作需求。

下一版本的 release gate 是：

1. 版本号、changelog/release notes、tag 与两个 package manifest 使用同一 exact version；
2. root/package/template README、Agent instructions、Skill 和 active docs 与当前 package surface 一致；
3. focused package/scaffold/docs gates、完整 `npm run check`、fresh packed consumer install 与 registry audit Green；
4. 通过 Trusted Publisher 运行纯 OIDC `npm publish --provenance`，并复验 registry integrity、provenance 与 signatures；
5. 不把人工 token 重新引入 workflow；每个 live publish 都以 Trusted Publisher OIDC receipt 为准。

## 不以里程碑名义引入

- compatibility shim、双主链、历史执行数据迁移；
- 远程 scheduler/database/artifact store；
- child chat/identity/heartbeat/token persistence；
- 常驻 Agent、child-lifecycle watcher 或 scheduler，以及自然语言的新建/修改判断表；bounded per-attempt
  filesystem event continuation 不属于常驻服务；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 跨 Project TTS/Scene/media reuse 或 Project clone；
- 主观 aesthetic approval 冒充 deterministic acceptance。
