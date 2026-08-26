# Desktop Phase D internal unsigned DMG

> 文档类型：internal/manual-only installer 构建与验证入口
>
> 当前状态：internal/manual-only 双架构 workflow artifact verified complete；公开发行 Gate pending

## 1. 边界

Phase D 入口只生成可下载、可手动安装测试的 unsigned、not notarized 完整离线 DMG。它不签名、不公证、不启用
auto-update、不生成 Universal binary，也不创建或上传 GitHub Release。Remotion runtime binary redistribution 书面许可
仍为 `not-satisfied`；本入口只能在维护者明确授权的 internal/manual-only 范围内使用，不能把 artifact 公开发布。

两个目标文件名固定为：

```text
AXMORF-Studio-<version>-mac-arm64-full-unsigned.dmg
AXMORF-Studio-<version>-mac-x64-full-unsigned.dmg
```

普通用户 DMG 只从 ordinary production package 构建。Phase C 的
`AXMORF_DESKTOP_NATIVE_GATE_BUILD=1` package 仍只用于原生生产 gate，绝不能成为 DMG 输入；installer builder 会重新构建
ordinary package，并扫描 gate-only provider、command diagnostic 与 Delivery lifecycle marker。

## 2. 本机精确入口

必须在与目标一致的原生 Mac、clean tracked worktree 和 exact commit 上运行：

```bash
exact_commit=<40-character-commit>
architecture=arm64 # Intel 原生机使用 x64
gate_root=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-phase-d-gate.XXXXXX")
verification_root=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-phase-d-verify.XXXXXX")
release_parent=$(mktemp -d "${TMPDIR:-/tmp}/axmorf-phase-d-release.XXXXXX")
release_root="$release_parent/release"

npm ci
bash scripts/desktop/native-gate.sh \
  --architecture "$architecture" \
  --expected-commit "$exact_commit" \
  --evidence-root "$gate_root"
npm run desktop:dmg -- \
  --architecture "$architecture" \
  --expected-commit "$exact_commit" \
  --native-evidence-root "$gate_root" \
  --verification-root "$verification_root" \
  --release-root "$release_root"
npm run desktop:release:verify -- --root "$release_root"
```

`desktop:dmg` 依次复验 Phase C gate、重新构建 ordinary `.app`、调用 Electron Forge 7.11.2 官方 DMG maker、挂载 DMG、
复验单一目标架构 App/Runtime Pack/Electron/Chromium/FFmpeg/FFprobe/Node SEA/`rsp`/compositor、复制到隔离
Applications 目录，并以空 host-tools `PATH` 完成 first-run window、workspace-local `rsp doctor`、Preview shell launch、
独立 Settings form/加密 save/Engine restart、local `rsp schema project-create`、wrapper rejection、valid raw create、
无外部 TCP 和退出 cleanup。前置 Phase C gate 还必须包含同一 App 进程内的真实媒体失败与“恢复播放”证据，不能用
DMG 首次启动或普通 Catalog refresh 替代 Ticket/FileHandle/request nonce 轮换。

## 3. release artifact contract

每个架构的 artifact exact files 为：

```text
AXMORF-Studio-<version>-mac-<architecture>-full-unsigned.dmg
AXMORF-Studio-<version>-mac-<architecture>-full-unsigned.dmg.sha256
INSTALL.md
installer-verification.json
release-manifest.json
runtime-sbom-input.json
```

`release-manifest.json` 是 strict contract，绑定 exact commit、appVersion、architecture、DMG checksum/size、App ASAR、
RuntimePackId、workspace integration identity、SBOM input、安装说明和 installer verification。它必须明确记录：

- channel 为 `internal-manual-only`；
- Developer ID signed、notarized、auto-update、public Release 与 Universal binary 全为 false；
- Remotion runtime redistribution permission 为 `not-satisfied`；
- ordinary package、native gate、mounted DMG、isolated Applications copy、first-run、doctor、Preview launch、no-host-tools 和
  cleanup 全部验证完成。

双架构集合只有在 arm64/x64 manifest 的 exact commit 与 appVersion 完全相同且两边各自 Green 时才生成
`dual-release-manifest.json`。任一 architecture job 失败，`release-set` job 不上传完整双架构 artifact。

## 4. manual-only GitHub Actions

[desktop-phase-d-unsigned-dmg.yml](../../.github/workflows/desktop-phase-d-unsigned-dmg.yml) 同时提供
`workflow_dispatch` 与内部 `workflow_call`，没有 push、pull request、release 或 publisher trigger。两个原生 job 固定使用
hosted `macos-15` arm64 与 `macos-15-intel` x64；最终只上传 installer release roots，不上传 test fixture Delivery、
credential/token/private path 或 voice data。

新增 workflow 在进入默认分支前不能被 GitHub 直接 `workflow_dispatch`。因此历史
[desktop-phase-b-native-gate.yml](../../.github/workflows/desktop-phase-b-native-gate.yml) 的 default-branch manual dispatch
adapter 现路由到 Phase D reusable workflow；Phase C workflow 与 `native-gate.sh` 保持不变。新 workflow 进入默认分支后可直接
dispatch。

## 5. 用户安装

1. 下载与 Mac 架构匹配的 DMG，并对照 `.sha256`；
2. 打开 DMG，把 `AXMORF Studio.app` 拖入 Applications；
3. 首次打开会因 unsigned/not notarized 被 macOS 阻止；
4. 打开 System Settings → Privacy & Security，找到 AXMORF Studio，选择 Open Anyway，再确认 Open；
5. 选择一个 Workspace Root。最终用户不需要 Node、npm 或 Git。

不得要求用户全局关闭 Gatekeeper，也不把 `xattr` 删除 quarantine 作为标准步骤。受 MDM 限制而没有 Open Anyway 的 Mac
不属于 unsigned test channel 支持范围。

## 6. verified evidence

exact commit `e82dd2b90d291ba87a26a1a2d1cc4d327dbaea9c` 的 manual-only Actions run
[`32671348209`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32671348209) 已完成 hosted
`macos-15` arm64、`macos-15-intel` x64 与 complete dual-set 三个 Green jobs。最终可下载 artifact 为
`desktop-phase-d-dual-unsigned-dmg-32671348209`，artifact ID `9501762840`，GitHub digest
`sha256:f2abedc9a37481009f11b9848c91937eddb6853b484956d055e5eafe8edf0d9c`。

下载后的 release set 已复跑 strict validators、checksum、exact regular-file inventory 与 redaction：

| Architecture | DMG                                               |     Bytes | SHA-256                                                            |
| ------------ | ------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| arm64        | `AXMORF-Studio-0.1.0-mac-arm64-full-unsigned.dmg` | 356232619 | `00a8a62909c1ab3df978ff4dd1a63b01f3a65d487321597a462b655958b1abf3` |
| x64          | `AXMORF-Studio-0.1.0-mac-x64-full-unsigned.dmg`   | 370199416 | `ef334455bbf6bba6a7075fb48c6b0e1d0723b424775e5df3facdde07b6ec7f16` |

这只关闭 internal installer artifact evidence。Remotion runtime redistribution permission 继续为 `not-satisfied`；
Developer ID signing、notarization、auto-update 与 public GitHub Release 均未执行。

该历史 release set 早于当前 Settings/create contract/playback recovery repair，不包含“恢复播放”的 request
nonce/Ticket/FileHandle 轮换，也不能作为本轮 native 或 installer evidence。重新交付 Mac 包必须在 exact current commit
上重跑第 2 节的 native gate、DMG、挂载安装与 release-set 验证。
