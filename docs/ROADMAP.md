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

## 下一里程碑：macOS Desktop App

下一阶段已确定把 current Engine 产品化为 `AXMORF Studio`，不再把 Desktop shell 作为候选项。实现必须保持现有
focused、static、host、media 与 E2E gates Green，并遵守
[Desktop App 产品架构](DESKTOP_APP_PRODUCT.md) 与
[macOS 维护和发行 authority](DESKTOP_APP_MACOS_MAINTENANCE.md)。当前执行入口是
[Phase A 实施计划](DESKTOP_APP_PHASE_A_IMPLEMENTATION_PLAN.md)：

1. unsigned prototype：建立 Electron shell、sandboxed Studio view、Engine utility process、authenticated local
   `rsp` session、默认 `~/Movies/AXMORF Studio/` 和 Codex/Hermes integration smoke；
2. productization：把 App/Runtime Pack 与单一 Workspace Root 正式隔离，增加 workspace-local `.rsp/bin/rsp`、
   offline doctor、兼容性 manifest、整体迁移/rollback，并 clean-break 出独立 `studio-current`；
3. 双架构验收：分别完成 arm64 与真实 Intel x64 的 offline install、Studio、Agent、render、manual/automatic
   Delivery、升级不修改 Workspace 的 native E2E；
4. unsigned public beta：取得 Remotion runtime binary redistribution 书面确认，发布同版本双原生完整 DMG、
   SHA-256、release manifest、SBOM、third-party notices 与 Gatekeeper 手动安装说明；
5. stable/增强：发布 Intel 支持策略；只有真实用户规模、安装失败率或支持成本证明需要时，才购买 Apple
   Developer Program 并评估 Developer ID、notarization 与 signed auto-update。

Phase 1–3 可以在公开发行许可 Gate 关闭前内部实现和验证；未取得 Remotion 书面确认不得公开包含其 runtime 的
DMG，缺少 Intel native evidence 不得宣称 x64 支持。

## 后续候选

1. 扩展 provider-neutral TTS 配置 UI，同时保持 authored chunk → one provider attempt → canonical PCM 的
   无隐式 fallback contract。
2. 为大型 artifact sets 增加只读诊断的性能与容量治理，不改变本地 filesystem authority 或既有解释合同。
3. 增加用户显式触发的 publishing adapter；上传、账号、网络、密钥是新的独立授权边界。
4. 基于 fingerprint-bound proposal 和用户逐项授权提升 Project-local capability；不得自动 promotion。

## 不以里程碑名义引入

- compatibility shim、双主链、历史执行数据迁移；
- 远程 scheduler/database/artifact store；
- App 内置、托管或自动安装用户 Agent；
- child chat/identity/heartbeat/token persistence；
- 常驻 Agent、child-lifecycle watcher 或 scheduler，以及自然语言的新建/修改判断表；bounded per-attempt
  filesystem event continuation 不属于常驻服务；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 跨 Project TTS/Scene/media reuse 或 Project clone；
- 主观 aesthetic approval 冒充 deterministic acceptance。
