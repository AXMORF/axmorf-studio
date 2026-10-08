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

2026-10-08 当前源码新增整片 filmPlan、连续正文 visualScenes、authored-frame 时间轴、确定性相机/形变/语义重定时、
artifact-backed 草稿与参考节奏诊断。它保留唯一 production/artifact/four-file delivery 主链；源码工程验证记录见
[连续视频验收](evidence/2026-10-08-continuous-video-acceptance.md)。1270项测试和最新 packed Workspace 的 native3工程
生产和1dirtyScene/5reuse的局部修订、自动提升与幂等复验通过；完整音频混音输出、无字幕布局和 authored narration-root
absence 修订合同已验证。本次未发布，既有 Project 不自动迁移，
公开包不能用源码检查或内部工程生产结果直接视为已升级。下一步独立 release/first-use gate 必须覆盖分组创建、无 provider 时间轴、
正式导出前草稿、局部 owning Scene 修订复用、candidate 提升与真实 H.264/AAC 声道检查。

从 `foundation@e52d2a5` 开始的
[npm Workspace 开源方案](archive/implementation-plans/2026-08-30-npm-workspace-open-source-implementation-plan.md)
已经完成并归档。最初 `@axmorf/studio@0.1.3`、`create-axmorf-studio@0.1.3` 与 GitHub `v0.1.3` Release 通过
Trusted Publisher 纯 OIDC 公开发布；package-owned shared Workspace media、Organization transfer、default branch
与 provenance workflow 均已完成。精确实现和验收事实只由
[ITERATION_STATUS.md](ITERATION_STATUS.md) 与
[v0.1.3 Mixkit bookend audio release](evidence/2026-09-05-v0.1.3-mixkit-bookend-audio-release.md) 维护。
最近完成的两包公开安装验收记录为 0.1.17，详见 ITERATION_STATUS 和对应 v0.1.17-publication evidence；
该已发布记录与本次未发布源码升级分开维护。

当前用户入口是 README 的“快速开始”，或者复制一句 Agent prompt，让 Agent 根据项目最新 README 在指定
路径完成 Workspace 搭建与可用性验收。Workspace ready 后，generated README 的独立视频 prompt 才负责接收创作需求。

视觉质量的下一项验收是两种未参与调试的中文 AI 概念，使用相同脚本、旁白 bytes、素材和渲染设置做旧版/新版
正式生产对照。记录创作和修订预算，保留首次结果，分别报告 Agent 自主修正与人工逐帧指导。完整连续观看、听审
和重复渲染须独立记录；两主题通过只构成初步泛化证据，多次独立生成后才评估稳定性。边界播放与音乐包络还需
通过正式 candidate 制作、promotion 和整片听审验证，不能用 schema/单测通过代替成片验收。

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
