# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

当前架构基线是单一 Project production 主链：ProductionRevision → content-addressed Task DAG → reusable
ArtifactAttestation → atomic materialization → synchronous exact four-file delivery。旧执行账本与异步交付不再是
active runtime authority。公开入口已分为 atomic create、strict read-only inspect、explicit costly prepare、
attempt-bound task commit/fail 与 fixed continuation；converge 是 continuation 内部 application，不是 Root 命令。

基线门槛包括：

- identity 不含 attempt/clock/process/absolute path；
- create existing/partial/conflicting target fail closed，相同 creation identity 只读 current，零 provider/media；
- Root 在任何成本前报告 inspect 的 source readiness、unknown-safe estimate、reuse 与逐任务失效解释；
- prepare 才允许 provider/fixed artifact/workspace/attempt mutation；converge 不允许这些 preparation 副作用；
- diagnostic explanation/baseline/attempt 不进入或改变 production/artifact/delivery authority；
- execution mode 按用户提示词、settings、内置 `inline` 默认解析；inline 一次一个 workspace，subagents bounded pool
  最多四个；一个 dirty task 只归属一个 executor，template task 不由 Agent 创作；
- Composition exactly once 拥有 raw readability/insets 与 SceneViewport mount；Scene child 只看到
  safe-area-local viewport dimensions/min font size，不得恢复 full-frame authority；
- Agent 只写 task workspace，fixed commit 重跑 validator，commit/fail 绑定 exact attempt 且首终态不可覆盖；
- continuation 启动后 Root 挂起且不监督；bounded fixed continuation 以 atomic claim 单消费者运行，failure/attempt 创建起一小时
  timeout fail-fast，all-success 只 converge 一次；
- artifact hit 严格复验 exact file set、no-symlink、size/checksum/dependencies/policy；
- convergence stale/incomplete/drift fail closed 且 materialization 有 rollback；
- delivery 同步等待和验证 exact four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用。

## 当前里程碑状态

已从 `foundation@e52d2a5` 在 `axmorf/npm-workspace-open-source` 分支实现
[npm Workspace 开源方案](promotions/2026-08-30-npm-workspace-open-source-implementation-plan.md)：把 current
repository-native production core 提取为可发布 npm runtime/CLI package，并提供独立脚手架创建用户 Workspace。
Agent 通过 Workspace-local、宿主无关的 Skill 调用 npm 主链创作用户级 Project；Foundation 当前 Web 收敛为本地
配置/诊断/状态/Delivery 控制台，Remotion Studio 继续负责实时画面预览。
用户入口以 `npm create axmorf-studio@latest <name>` 为准：默认完成依赖安装、lockfile、bootstrap/doctor，
之后进入目录运行 `npm run dev`，不要求 global install 或 source clone。

该里程碑保持 ProductionRevision → Task DAG → ArtifactAttestation → exact four-file Delivery 主链，不引入第二条
authority。目标产品不含 Desktop、Electron、Runtime Pack、App session、workspace-local `rsp` 或原生 installer；
Remotion 和其他第三方包由生成项目按官方 npm dependency 安装，不 vendoring 到本项目 tarball。

本地 vertical slice 已通过 package build/pack、仓库外 creator 默认安装、`npm ci` 重装、doctor、public exports、
Remotion compositions、Web/API/浏览器 QA 和 zero-provider create/inspect；同一 package/scaffold 主链也已在
macOS 15 ARM64 原生 runner 上通过。下一阶段门槛是：

1. macOS 已运行完整 Foundation static/host gates；仍需在 packed Workspace 完成 deterministic exact four-file
   Delivery E2E；
2. 已用精确 overrides 与兼容开发工具更新把 production/repository audit 归零，同时保持所有 Remotion packages
   精确同版；
3. macOS 15 ARM64 已取得真实 native CI/host evidence；Windows 按用户当前决策暂缓，未取得证据前不声明支持；
4. 已确认 Apache-2.0、third-party notices、Remotion 独立许可证边界以及 `@axmorf/studio` / `create-axmorf-studio`
   名称；剩余 provenance/2FA/token 和首次 publish authority 继续独立验收；
5. 当前 feature branch push 仅获授权用于 macOS 验证；未经用户后续逐项授权，不 tag、不创建 Release、不执行真实
   npm publish。

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
