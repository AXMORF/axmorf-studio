# Desktop Phase A Smoke

本文只验证 repository-adapter prototype。它不证明 Workspace production migration、完整 Runtime Pack、optional
Delivery、DMG、签名、公证或公开发行已经完成。

## 自动化 Agent integration smoke

先从 clean checkout 构建受管 CLI，再运行 smoke：

```bash
npm run desktop:rsp-client
npm run desktop:integration-smoke
```

smoke 在独立临时目录初始化真实 Workspace，读取受管 `AGENTS.md` 与 repository-local Skill，通过安装后的
`.rsp/bin/rsp doctor` 连接真实 Unix domain socket，最后验证 session/token/socket 已清理。输出不得包含 bearer
token、absolute session path 或 provider/private state。Linux 可运行这项自动化检查，但不能把它冒充 macOS native
App evidence。

## Apple Silicon native smoke（待真实宿主执行）

仓库提供只允许 `workflow_dispatch` 的
`.github/workflows/desktop-phase-a-native-gate.yml`。它固定使用 GitHub hosted `macos-15` arm64 runner，并在运行时
再次以 `uname -m` fail closed。workflow 必须从待验证分支手动触发；普通 push、PR、tag 和 release 都不会触发。
触发 acknowledgement 不是完成证据，必须等 run conclusion 为 success 并读取 artifact 中的逐项报告。

1. 从 clean checkout 执行 `npm ci`、`npm run desktop:check` 与 `npm run desktop:package`，保存 Node/npm、macOS、
   Electron 和 `uname -m` 原始输出。
2. 在独立临时 repository fixture 中用 current production builder 生成一个真实、exact-four-file、current Revision
   Delivery；不能使用 fake MP4、用户 ignored Project/Delivery 或把媒体打进 `.app`。
3. 从 Finder 启动生成的 `.app`，完成默认 Workspace 初始化，再以另一个 clean user state 验证首次确认前改选
   Workspace。核对唯一 root、manifest、managed ledger、mode 与 checksum。
4. 确认默认显示 bundled Preview Player；刷新后选择真实 current Delivery，播放有画面和声音，首尾、任一 Scene
   boundary 及 open/suffix seek 均正确。
5. 核对 Scene、narration chunk/pause、caption tracks 来自相同 revision 的 canonical timing；manual/source-current
   Project 没有 current Delivery 时必须显示不可播放。
6. 从 Workspace 执行 `.rsp/bin/rsp doctor`，保存脱敏 JSON；另测错 token、过期 session、删 session 与 App 未运行
   的固定 failure code。
7. 验证 arbitrary path、stale DeliveryBuildId、query/hash、非 GET/HEAD、multi-range、popup、外部导航、download 与
   permission 均被拒绝；验证合法 HEAD、open/suffix Range、`206` 与 `416`。
8. 用 `lsof`/Activity Monitor 记录 App process tree：运行期间 App-owned process 无 TCP listener；退出后 Engine 和
   Workspace socket 消失。Forge Vite 开发端口和宿主其他进程不计入证据。
9. 检查 package inventory 输出与 `.app` 架构/SHA-256；确认 `app.asar` 不含 `private/`、`src/projects/`、Project
   public media、deliveries、narration/work/artifact/attempt/run/out 或用户配置。
10. 完成 Codex discovery；Hermes 只按 `.rsp/hermes/INSTALL_PROMPT.md` 人工执行，并保留原始输出。没有稳定 Hermes
    CLI 时状态必须是 pending，不能伪造 automated evidence。

workflow 在 `$RUNNER_TEMP` 中 clone exact `GITHUB_SHA` 为独立 repository fixture，重新执行 `npm ci`，由
`desktop:native-fixture` 调用 current Delivery builder 生成并复验真实短时 H.264/AAC MP4、两张 PNG Cover 和
`publish.json`。package 的 build-time repository locator 只指向该 fixture；fixture、Delivery、`.app` 和 private
config 都不上传。native gate package 使用 build-time-only probe instrumentation；普通 Desktop build 将该 probe 编译为
关闭状态，不能仅靠 runtime environment 激活。

上传 artifact 只允许包含 environment/package identity、fixture 的无路径摘要、`rsp doctor` 脱敏结果、Workspace
managed-file checksum/mode 摘要、Preview screenshot、Player/timeline/protocol/security/lifecycle JSON 和 App-owned
process/TCP 摘要。不得包含 token、absolute session path、fixture repository、四文件 Delivery、完整 `.app`、private
config、Project source/media 或 provider/voice 数据。

Hermes CLI 不存在时只把 Hermes-specific smoke 标为准确 pending；Phase A 的 unconditional Agent gate 仍要求 managed
`AGENTS.md`/Skill discovery、真实 workspace-local `rsp doctor` invocation 与 Codex-compatible discovery Green。若 runner
实际暴露 Hermes，则不能自动宣称 Green：必须按安装提示完成真实人工 smoke，否则该 run 不足以关闭 gate。

## 证据状态

非 macOS 实施宿主、未触发 workflow、run 未完成、conclusion 非 success、artifact 缺失或任一 mandatory report 非 Green
时，都只能记录 `implementation-complete-native-evidence-pending`。必须等上述 Apple Silicon native smoke 逐项 Green
并复核 exact commit/artifact 后，Phase A 才能从 implementation-complete 提升为 verified complete。
