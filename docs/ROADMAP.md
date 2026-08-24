# Roadmap

> 文档类型：阶段门槛 authority
>
> 当前完成事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 当前基线

当前架构基线是单一 Project production 主链：ProductionRevision → content-addressed Task DAG → reusable
ArtifactAttestation → atomic materialization → attested source-current → manual stop、automatic 或 later explicit
exact four-file DeliveryBuild。旧执行账本与异步交付不再是 active runtime authority。公开入口已分为 atomic create、
strict read-only inspect、explicit costly prepare、
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
- convergence 写入并复验 source-current；delivery policy 不进入 source identity；DeliveryBuild 同步等待和验证 exact
  four files，current replacement 受控且同 identity no-op；
- settings 与 progress 不扫描历史 `.producer-runs/`；Project delete 仍能安全清理其 ownership root；
- zero Project bootstrap/Registry/Catalog/settings 可用。

## 当前里程碑：macOS Desktop App Phase D unsigned public beta 入口

Phase A repository adapter 与 Apple Silicon native gate 已 verified complete。精确 evidence commit 为
`e5b9b6bd81bbe229177a64ed326ab3e46eaf2220`，manual-only GitHub Actions run
[`32591197950`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32591197950) 在 hosted `macos-15`
arm64 上验证真实 four-file Delivery、packaged App 播放/seek、custom media protocol、安全、Agent discovery、
process/TCP 与退出清理，并在 native Green 后完成 609/609 repository tests。Phase A 计划已
[归档](archive/implementation-plans/2026-08-23-desktop-app-phase-a.md)。

Phase B productization 已 `verified-complete`。evidence commit
`04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 的 hosted `macos-15` arm64 Actions run
[`32648089941`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32648089941) conclusion 为 success；
artifact ID `9495509231` 已人工复核 ordinary/gate package inventory、arm64 Runtime/App identity、manual
`source-current` 后 explicit Delivery、automatic Delivery、exact-four-file probes、Preview Player、第二实例、失败/Quit/reopen
后的 process/TCP/session/staging cleanup 与 MP4/Cover/credential exclusion。该 gate 使用 public `rsp-local-v2` surface 和
test-only deterministic task executor，不等同于安装外部创作 Agent 的真实创意生产证明。Phase B 计划已
[归档](archive/implementation-plans/2026-08-23-desktop-app-phase-b.md)。

Phase C 双架构验收已 `verified-complete`。exact evidence commit
`54a6c12699eb56b02051f0b47eb2568e9bf3f716` 的 manual-only Actions run
[`32656883032`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32656883032) 在原生
`macos-15` arm64 与 `macos-15-intel` x64 runner 上均为 success。x64 artifact ID `9497965091`、digest
`sha256:0f0c089a5de5299d98b034abee68a37cf3eb803b855e78efcde3547866945a28`；arm64 artifact ID
`9497817568`、digest `sha256:e3622d812958ac9f2ffc69e0e72aeef23bcede153dc9fd34c6e6ccc1ad8c191d`。

人工复核确认两种架构的 host、Electron/Chromium、FFmpeg/FFprobe、Node、SEA `rsp` 与 compositor 都是目标原生
Mach-O identity；ordinary/gate package 隔离、manual source-current + explicit Delivery、automatic Delivery、exact
four-file media probes、Preview playback/seek/timeline、failure/Quit/reopen cleanup、offline/no-host-tools、evidence
redaction 和 package 后完整 repository gate 均 Green。该证据使用 test-only deterministic fixture，并明确记录
`externalCreativeAgentTested: false`；它不冒充外部 Codex/Hermes creative E2E，也不表示 DMG 或公开发行已完成。
精确命令与边界见 [Desktop Phase C native gate](guides/DESKTOP_PHASE_C_NATIVE_GATE.md)。

Phase D internal/manual-only installer artifact closeout 已 `verified-complete`。exact evidence commit
`e82dd2b90d291ba87a26a1a2d1cc4d327dbaea9c` 的 Actions run
[`32671348209`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32671348209) 在 hosted
`macos-15` arm64 与 `macos-15-intel` x64 上完成 native production gate、ordinary unsigned DMG、挂载/安装、
first-run、doctor/Preview、no-host-tools 与 cleanup 验证；dual artifact ID `9501762840`、digest
`sha256:f2abedc9a37481009f11b9848c91937eddb6853b484956d055e5eafe8edf0d9c` 已下载并通过 strict manifest、checksum、
exact file set 与 redaction 人工复核。

Roadmap 仍位于第 4 项的公开 beta Gate。公开 beta 的入口 Gate 是取得 Remotion runtime binary redistribution 书面确认；
许可未关闭前不得公开发布包含该 runtime 的 DMG。本轮授权和 internal artifact 不满足许可 Gate、不产生 GitHub Release，
也不能把 artifact 写成公开 beta。精确入口见
[Desktop Phase D internal unsigned DMG](guides/DESKTOP_PHASE_D_UNSIGNED_DMG.md)。阶段继续遵守 [Desktop App 产品架构](DESKTOP_APP_PRODUCT.md) 与
[macOS 维护和发行 authority](DESKTOP_APP_MACOS_MAINTENANCE.md)。

1. unsigned prototype：建立 bundled Preview Player、只读多轨时间轴、Engine utility process、authenticated local
   `rsp` session、默认 `~/Movies/AXMORF Studio/` 和 Codex/Hermes integration smoke；
2. productization：把 App/Runtime Pack 与单一 Workspace Root 正式隔离，增加 workspace-local `.rsp/bin/rsp`、
   offline doctor、兼容性 manifest、整体迁移/rollback，并 clean-break 出独立 `source-current`；
3. 双架构验收：分别完成 arm64 与真实 Intel x64 的 offline packaged App/Runtime Pack、Preview Player、Agent fixture、
   render、manual/automatic Delivery、退出清理与 package 后 repository gate native E2E；
4. unsigned public beta：取得 Remotion runtime binary redistribution 书面确认，发布同版本双原生完整 DMG、
   SHA-256、release manifest、SBOM、third-party notices 与 Gatekeeper 手动安装说明；
5. stable/增强：发布 Intel 支持策略；只有真实用户规模、安装失败率或支持成本证明需要时，才购买 Apple
   Developer Program 并评估 Developer ID、notarization 与 signed auto-update。

Phase 1–3 已在公开发行许可 Gate 关闭前完成内部实现和验证；未取得 Remotion 书面确认不得公开包含其 runtime 的
DMG。Phase C 的内部 x64 native support evidence 不等于 installer、distribution 或公开支持政策；Phase D 的
internal installer artifact 也不等于许可、签名、公证或公开 Release。

## 后续候选

1. 继续补真实已安装 Codex/Hermes creative E2E；当前 native gate 的 deterministic executor evidence 不冒充创意
   Agent 证据。provider-neutral Desktop 配置表单与 packaged ProjectCreateInput contract 已进入 implementation。
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
