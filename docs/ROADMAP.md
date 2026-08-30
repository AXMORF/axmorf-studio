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
- execution mode 按用户提示词、settings、内置 `inline` 默认解析；inline 一次一个 workspace，subagents bounded pool
  最多四个且需要本次 verified `shared-workspace` 或 `controller-io` transport；transport 不持久化；一个 dirty
  task 只归属一个 executor，template task 不由 Agent 创作；
- Composition exactly once 拥有 raw readability/insets 与 SceneViewport mount；Scene child 只看到
  safe-area-local viewport dimensions/min font size，不得恢复 full-frame authority；
- 每个 dirty Agent task 绑定 immutable、attempt-neutral TaskExecutionContract；新 contract 只让对应 task artifact
  一次失效，current delivery 不动；
- `task bind` 在任何 content read/write 前以零写入校验 exact attempt/contract。shared-workspace 只授予 declared
  workspace capability；controller-io 只授予 strict bound file read/write。describe/finalize/check/commit/task failure
  要求 full binding；spawn/fixed failure 仅有更窄的 exact terminal authority；
- continuation 启动后 Root 挂起且不监督；bounded fixed continuation 以 atomic claim 单消费者运行，failure/attempt 创建起一小时
  timeout fail-fast，all-success 只 converge 一次；
- artifact hit 严格复验 exact file set、no-symlink、size/checksum/dependencies/policy；
- convergence stale/incomplete/drift fail closed 且 materialization 有 rollback；
- delivery 同步等待和验证 exact four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用；
- terminal failed attempt 只允许显式 read-only/zero-provider recover inspection 后 same-Revision reissue；旧 attempt
  immutable，reissue 不要求 current delivery，active/stale/fixed-flow recovery fail closed。

## 当前里程碑状态

已从 `foundation@e52d2a5` 在 `axmorf/npm-workspace-open-source` 分支实现
[npm Workspace 开源方案](promotions/2026-08-30-npm-workspace-open-source-implementation-plan.md)：把 current
repository-native production core 提取为可发布 npm runtime/CLI package，并提供独立脚手架创建用户 Workspace。
Agent 通过 Workspace-local、宿主无关的 Skill 调用 npm 主链创作用户级 Project；Foundation 当前 Web 收敛为本地
配置/诊断/状态/Delivery 控制台，Remotion Studio 继续负责实时画面预览。
用户入口以 `npm create axmorf-studio@latest <name>` 为准：默认完成依赖安装、lockfile、bootstrap/doctor，
之后进入目录运行 `npm run dev`，不要求 global install 或 source clone。
Agent 负责准备声明的 Node.js/npm 与宿主前置条件，生成 Workspace 的 `doctor` 是当前环境 capability gate；OS 不作为
预设 allowlist，未认证宿主可以 best-effort 运行，但不得通过修改 package internals、精确依赖或 validator 制造 Green。

该里程碑保持 ProductionRevision → Task DAG → ArtifactAttestation → exact four-file Delivery 主链，不引入第二条
authority。目标产品不含 Desktop、Electron、Runtime Pack、App session、workspace-local `rsp` 或原生 installer；
Remotion 和其他第三方包由生成项目按官方 npm dependency 安装，不 vendoring 到本项目 tarball。

本地 vertical slice 已通过 package build/pack、仓库外 creator 默认安装、`npm ci` 重装、doctor、public exports、
Remotion compositions、Web/API/浏览器 QA 和 zero-provider create/inspect；同一 package/scaffold 主链也已在
macOS 15 ARM64 原生 runner 上通过。Ubuntu 24.04 x86_64 又从 clean tarballs 完成 provider narration、bounded
Agent execution、convergence、render 与 exact four-file Delivery，满足 deterministic packed production E2E；新增
revision/originality/task-binding/reissue/GlobalVisual contracts 后又完成
[current-feature re-acceptance](evidence/2026-08-30-ubuntu-npm-current-feature-reacceptance.md)。2026-08-31 又从
current closeout source 构建两份真实 tarball，在仓库外完成 fresh consumer 安装与 lockfile 重放、packed
production/current Delivery、verified-Delivery endpoint 和桌面/窄屏浏览器交互；完整事实见
[npm release closeout](evidence/2026-08-31-npm-release-closeout.md)。

公开发布收尾状态是：

1. current closeout source 的两个 tarballs、allowlist、checksum 与 publish dry-run receipt 已复核；
2. 同一外部 Workspace 的 packed production、verified-Delivery endpoint、视频播放和双 Cover 浏览器证据已完成；
3. 全新外部 Workspace 的 creator 默认安装、`npm ci`、doctor、public exports、compositions 与 official-registry audit
   已完成；
4. production/repository audit 已归零，所有 Remotion packages 保持精确同版；
5. Apache-2.0、third-party notices、Remotion 独立许可证边界以及 `@axmorf/studio` /
   `create-axmorf-studio` 名称已确认；
6. GitHub push、Organization transfer、default branch 与 provenance publish workflow 已完成；npm scope/authentication、
   首次 publish、tag 与 GitHub Release 仍需完成；
7. 用户另行明确授权后，受控 Project delete 已在真实验收 Workspace 的一次性副本通过：无确认参数时 fail closed，
   confirmed delete 只清理 Project-owned roots，zero-Project doctor/compositions/Web 继续可用，原验收 Workspace 未变。

Desktop 分叉后的非 Desktop correctness fixes 只按行为和 regression tests 选择性移植，不整体 cherry-pick Desktop
commits。完整任务拆分、package layout、dependency 规则和完成定义见上述实施计划。

## 不以里程碑名义引入

- compatibility shim、双主链、历史执行数据迁移；
- 远程 scheduler/database/artifact store；
- child chat/identity/heartbeat/token persistence；
- 常驻 Agent、child-lifecycle watcher 或 scheduler，以及自然语言的新建/修改判断表；bounded per-attempt
  filesystem event continuation 不属于常驻服务；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 跨 Project TTS/Scene/media reuse 或 Project clone；
- 主观 aesthetic approval 冒充 deterministic acceptance。
