# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

当前架构基线是单一 Project production 主链：ProductionRevision → content-addressed Task DAG → reusable
ArtifactAttestation → atomic materialization → synchronous exact four-file delivery。旧执行账本与异步交付不再是
active runtime authority。

基线门槛包括：

- identity 不含 attempt/clock/process/absolute path；
- 一个 Scene/GlobalVisual/Cover dirty task 对应一个 runtime-native child；template task 不派发；
- Agent 只写 task workspace，fixed commit 重跑 validator；
- artifact hit 严格复验 exact file set、no-symlink、size/checksum/dependencies/policy；
- convergence stale/incomplete/drift fail closed 且 materialization 有 rollback；
- delivery 同步等待和验证 exact four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用。

## 下一里程碑候选

只有在现有 focused、static、host、media 与 E2E gates 保持 Green 后才进入：

1. 扩展 provider-neutral TTS 配置 UI，同时保持 authored chunk → one provider attempt → canonical PCM 的
   无隐式 fallback contract。
2. 为大型 artifact sets 增加只读诊断和容量治理，不改变本地 filesystem authority。
3. 增加用户显式触发的 delivery export/publishing adapter；上传、账号、网络、密钥是新的独立授权边界。
4. 基于 fingerprint-bound proposal 和用户逐项授权提升 Project-local capability；不得自动 promotion。

## 不以里程碑名义引入

- compatibility shim、双主链、历史执行数据迁移；
- 远程 scheduler/database/artifact store；
- child chat/identity/heartbeat/token persistence；
- 自动重试、provider fallback、TTS warm-up 或降低 Chromium sandbox；
- 主观 aesthetic approval 冒充 deterministic acceptance。
