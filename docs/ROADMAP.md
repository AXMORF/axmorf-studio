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
- 一个 Scene/GlobalVisual/Cover dirty task 对应一个 runtime-native child；template task 不派发；
- Agent 只写 task workspace，fixed commit 重跑 validator，commit/fail 绑定 exact attempt 且首终态不可覆盖；
- Root dispatch 后挂起且不监督；bounded fixed continuation 以 atomic claim 单消费者运行，failure/六小时
  timeout fail-fast，all-success 只 converge 一次；
- artifact hit 严格复验 exact file set、no-symlink、size/checksum/dependencies/policy；
- convergence stale/incomplete/drift fail closed 且 materialization 有 rollback；
- delivery 同步等待和验证 exact four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用。

## 下一里程碑候选

只有在现有 focused、static、host、media 与 E2E gates 保持 Green 后才进入：

1. 扩展 provider-neutral TTS 配置 UI，同时保持 authored chunk → one provider attempt → canonical PCM 的
   无隐式 fallback contract。
2. 为大型 artifact sets 增加只读诊断的性能与容量治理，不改变本地 filesystem authority 或既有解释合同。
3. 增加用户显式触发的 delivery export/publishing adapter；上传、账号、网络、密钥是新的独立授权边界。
4. 基于 fingerprint-bound proposal 和用户逐项授权提升 Project-local capability；不得自动 promotion。

## 不以里程碑名义引入

- compatibility shim、双主链、历史执行数据迁移；
- 远程 scheduler/database/artifact store；
- child chat/identity/heartbeat/token persistence；
- 常驻 Agent、child-lifecycle watcher 或 scheduler，以及自然语言的新建/修改判断表；bounded per-attempt
  filesystem event continuation 不属于常驻服务；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 跨 Project TTS/Scene/media reuse 或 Project clone；
- 主观 aesthetic approval 冒充 deterministic acceptance。
