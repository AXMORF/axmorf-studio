# Desktop Phase C 双架构 native gate

> 文档类型：本地与 manual-only CI 验证入口
>
> 当前状态：darwin arm64/x64 native evidence 已在 exact hosted runners Green 并完成人工复核；Phase C `verified-complete`

## 1. 唯一入口

`desktop:native:gate` 在当前 Mac 的原生架构上完成 ordinary/gate package 隔离、真实 packaged production/Delivery、
Preview Player、cleanup、evidence redaction，以及 package 后的完整 repository gate。它只接受 `arm64` 或 `x64`，并要求
`process.arch`、`uname -m`、Runtime Pack manifest 和所有 Mach-O identity 与目标一致；不提供 Rosetta 或 cross-package
fallback。

在全新的隔离 checkout/worktree 中固定待验证提交，先安装 exact lockfile 依赖：

```bash
phase_c_commit=<exact-40-character-commit>
test "$(git rev-parse HEAD)" = "$phase_c_commit"
npm ci
phase_c_evidence=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-phase-c-evidence.XXXXXX")
npm run desktop:native:gate -- \
  --architecture x64 \
  --expected-commit "$phase_c_commit" \
  --evidence-root "$phase_c_evidence"
```

真实 Intel Mac 使用 `x64`。Apple Silicon 回归使用同一命令，只把 architecture 改为 `arm64`。入口拒绝 tracked diff 或
staged diff；它不 reset、clean、删除 Project/Workspace/Delivery，也不扫描用户 private config。`out/`、Runtime Pack、
临时 Workspace 与 evidence 仍是本机构建/验证产物，不进入 Git。

manual-only workflow [desktop-phase-c-native-gate.yml](../../.github/workflows/desktop-phase-c-native-gate.yml) 使用完全相同
的入口，分别路由到 GitHub 当前原生 `macos-15` arm64 和 `macos-15-intel` x64 runner。默认分支已有的
[desktop-phase-b-native-gate.yml](../../.github/workflows/desktop-phase-b-native-gate.yml) 仅保留为 pre-merge manual dispatch
adapter，并通过 reusable-workflow call 路由到同一 Phase C gate，不复制任何 package/production/evidence 步骤。能够
cross-package、在 Rosetta 下启动，或只让其中一个 matrix job Green，都不能替代另一架构的 native evidence。

## 2. gate 验证什么

- `process.arch=arm64|x64` 与 `uname -m=arm64|x86_64` 精确匹配；
- ordinary package 不含 test-only provider/diagnostic/lifecycle harness，gate package 才显式编入；
- Runtime Pack/compatibility/package inventory 绑定同一 architecture 与 exact target compositor package；
- Electron App、renderer Chromium、FFmpeg、FFprobe、Runtime Node、SEA `rsp` 与 Remotion compositor 的 `lipo` 结果都是单一
  目标架构，`file` 结果是对应 Mach-O identity；Node SEA source sentinel 与 injected `rsp` sentinel 分别复验；
- App runtime 的 `PATH` 指向空目录，不需要 host Node/npm/Git；process-tree network evidence 拒绝任何非 loopback TCP
  connection，DeliveryBuild 只允许 `127.0.0.1` OS-ephemeral listener，终态后归零；
- public `rsp-local-v2` manual 流程先得到 source-current 且没有 Delivery，later explicit Delivery 和 automatic 流程分别
  生成并复验 exact four files；
- H.264/AAC/channel/dimension/fps/frame count、两张 PNG、checksum 与 EOF decode；
- Preview playback、seek、Scene/narration/caption timeline、media protocol/security；
- failure、显式 Quit、automatic terminal 与 reopen 后的 process、TCP、session、operation lock 与 disposable staging cleanup；
- evidence 不含 MP4、Cover、token、credential、voice material、repository absolute path；
- package 后依次运行 `desktop:check`、typecheck、lint、docs、`check:static`、compositions、完整 `npm run check` 与
  `git diff --check`。

## 3. evidence 边界

native gate 通过 public create/inspect/prepare/task/continue/delivery surface，但 dirty Agent task 与 narration 使用明确的
test-only deterministic fixture。它证明 App/Runtime Pack/production/Delivery contract，不证明已安装 Codex/Hermes 完成
新的创意 E2E。`runner-summary.json` 固定记录：

```json
{
  "deterministicFixture": true,
  "externalCreativeAgentTested": false
}
```

Phase C acceptance 已在 exact evidence commit `54a6c12699eb56b02051f0b47eb2568e9bf3f716` 完成：manual-only Actions run
[`32656883032`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32656883032) 的 x64 与 arm64 jobs 均为
success。x64 artifact ID `9497965091`、digest
`sha256:0f0c089a5de5299d98b034abee68a37cf3eb803b855e78efcde3547866945a28`；arm64 artifact ID `9497817568`、digest
`sha256:e3622d812958ac9f2ffc69e0e72aeef23bcede153dc9fd34c6e6ccc1ad8c191d`。两份脱敏 evidence 已人工复核，Phase C
状态为 `verified-complete`，Roadmap 已进入 Phase D。

该 closeout 只证明 exact commit 的 darwin arm64/x64 native App/Runtime Pack/production/Delivery contract。它不证明已安装
Codex/Hermes 完成新的 creative E2E，也不表示 DMG ready、distribution ready、签名、公证或 public release 已完成；这些
证据不能由 deterministic fixture 推断。
