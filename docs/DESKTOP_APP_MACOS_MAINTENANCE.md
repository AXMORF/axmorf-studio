# Desktop App macOS 维护与发行

> 文档类型：macOS 维护与发行目标 authority
>
> 状态：`AXMORF Studio`、内置 Preview Player、单 Workspace Root、Codex/Hermes 首批支持、Electron、macOS 13+、arm64/x64、App-running lifecycle、完整离线 Runtime DMG、GitHub Releases 站外分发、首阶段无签名和手动更新已确认；Phase A、Phase B 与 Phase C native gates 均 verified complete，当前进入 Phase D unsigned public beta Gate
>
> 产品边界见 [Desktop App 与外部 Agent 产品架构](DESKTOP_APP_PRODUCT.md)，当前实现
> 事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 1. 已确认范围与发行基线

已经确认：v1 只支持 macOS，使用 Electron，不同时实现 Windows、Linux 或 Tauri；Apple Silicon `arm64` 与
Intel `x64` 都必须获得正式支持；App 必须运行，关闭主窗口时 active production 继续驻留，用户显式 Quit 才
终止 App；v1 不安装 launch daemon、login item、常驻 scheduler 或独立 headless service；用户继续使用自己的
Agent，App 不内置 Agent SDK；首阶段从项目维护的下载渠道直接提供无签名、未 notarize 的 DMG，不购买 Apple
Developer Program，不进入 Mac App Store，也不启用 macOS auto-update。Developer ID 签名和 Apple
notarization 是以后降低 Gatekeeper 安装阻力时的发行增强，不是 prototype、alpha 或首个可用版本的前置条件。

正式产品名为 `AXMORF Studio`，bundle ID 为 `com.axmorf.studio`。App icon 复用 repository canonical AXMORF
mark 和现有深灰/暖棕/暖白品牌色；`remotion-story-producer` 只保留为 repository/engine identifier。

本文的 `unsigned` 指没有 Developer ID 发布者身份、没有 Apple notarization。Apple Silicon 要求 native
executable 至少具有 ad-hoc signature 时，构建流程可以使用不绑定任何身份的免费 ad-hoc signature；它不证明
软件来自本项目，也不改变 unsigned channel 的 Gatekeeper、披露或更新规则。

macOS 发布两个相同产品版本的原生构建：

```text
AXMORF-Studio-<version>-mac-arm64-full-unsigned.dmg
AXMORF-Studio-<version>-mac-x64-full-unsigned.dmg
```

- `arm64`：Apple Silicon Mac；
- `x64`：Intel Mac；
- 最低系统版本采用 macOS 13 Ventura；
- v1 不发布 Universal binary。

Electron 当前同时提供 `darwin-arm64` 与 `darwin-x64` 预构建。选择 macOS 13+ 是为了能持续跟进已移除
macOS 12 支持的新 Electron/Chromium 安全版本，而不是长期锁在旧 Electron。v1 分发两个原生包，避免 Universal
App 同时合并 Electron、Node/native helper、Chrome/FFmpeg 和 Runtime Pack 所增加的体积与签名复杂度。

## 2. 为什么 v1 不做 Universal App

`@electron/universal` 可以把 x64 和 arm64 Electron App 合为一个 Universal App，但它不能消除 Runtime Pack
中的架构差异。即使 App shell 合并，完整离线包仍需携带两份 native browser/media binaries。

两个原生 DMG 的优势：

- 每个包只包含一种 Electron/Node/helper 架构；
- Runtime Pack、release manifest、checksum 与故障诊断都能精确绑定架构；未来启用签名、notarization 和更新
  feed 时也不需要改变架构边界；
- arm64 用户不依赖 Rosetta；
- Intel 用户不会收到无法执行的 arm64 binary；
- 单个下载和增量更新更小；
- 两个平台可以独立阻塞 release，而不把一侧故障隐藏在合并步骤中。

下载页必须明确显示“Apple Silicon”和“Intel”。若自动检测不可靠，宁可让用户确认 About This Mac 中的 Chip，
也不能静默下载另一架构。错误安装包启动时应给出可理解提示，不把 Rosetta fallback 当作正式支持路径。

Universal App 可在 v1 稳定后重新评估，但不得替代两个架构各自的 native install/render E2E。

## 3. 进程与信任边界

```text
Electron Main
  |-- trusted bundled App UI + Preview Player renderer
  |-- Engine utility process
  |     |-- read-only Preview Catalog projection
  |     `-- per-delivery render process (Runtime Pack phase)
  `-- local authenticated rsp socket

User Agent --> workspace Skill --> rsp CLI --> local socket --> Engine
```

### Electron Main

只负责 App lifecycle、窗口、native menu/dialog、更新编排、进程启动和严格 IPC routing。它不运行生产 domain、
Remotion render 或 provider request，避免 renderer/render crash 拖垮主进程。

### Trusted App UI

承载 Preview Player、只读多轨时间轴、Settings、Project 状态、Runtime/Agent integration doctor、Delivery 按钮和
诊断。renderer 无直接 filesystem、shell 或任意 process 权限，只能通过 narrow typed IPC 调用 Main/Engine。
所有 IPC 验证 sender、schema 和 Project scope。Phase A 只投影 current source Project；只有 exact current、完整
复验的四文件 Delivery 可播放，manual/source-current Project 明确显示尚无可播放预览。

### Preview Player

App 主视图是随 App 打包的 renderer，不加载 Remotion Studio、repository Settings Vite 服务或任何 loopback
origin。它通过 narrow preload API 获取无路径的 Preview Catalog DTO，并使用原生 `<video>` 播放经过 Main
授权的 current Delivery：

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
preload = narrow typed bridge only
navigation = bundled renderer origin only
new-window/open-external = deny by default
media = exact custom protocol ticket only
```

媒体 custom protocol 只接受精确 storyId、DeliveryBuildId 和固定 `video.mp4` 路径；请求时重新验证 allowlist、
regular-file/no-symlink、size/checksum 和 pinned file identity，支持受限的 `GET`/`HEAD` 与单 Range `206`/`416`
语义。renderer 不接收 repository path、checksum、size 或 filesystem capability。时间轴只从与 Delivery revision 完全相同的 current
canonical SemanticTiming 投影 Scene、旁白和字幕；Scene boundary 不冒充独立 transition authority。

### Engine utility process

运行现有 Node production engine、contracts、validators、Artifact/Attempt/Workspace adapters。它不启动 Settings、
Remotion Studio UI/Server 或常驻 TCP listener；control plane 只有 authenticated Unix-domain socket。真实
DeliveryBuild 可临时绑定 `127.0.0.1` OS-ephemeral renderer listener，并必须在终态清理。Delivery render 使用
独立 child process，render crash 不应终止 Main 或破坏 current delivery。

### rsp CLI

CLI 是外部 Agent 的薄 client，只连接当前用户 session 的 authenticated local socket。v1 在 App 未运行时返回
machine-readable `rsp-app-unavailable`；不自动安装或启动后台 daemon，也不回退到源码 npm scripts。

## 4. App lifecycle

- 没有 active production 时关闭主窗口：正常退出或按用户设置驻留；
- 存在 active Attempt/DeliveryBuild 时关闭主窗口：隐藏窗口并保持 App/Engine 运行；
- Dock/menu 提供重新打开和显式 Quit；
- 显式 Quit 遇到 active work：展示 Project、Attempt、当前阶段和中断后果，需要二次确认；
- OS logout/shutdown：尽力写 mechanical terminal/cancel diagnostic，但不能伪造成功；
- App crash/restart：从 immutable Attempt events、Artifact Store 和 current delivery 重新投影，不从 UI memory
  猜测状态；
- 不默认开机启动，不在用户不知情时保留后台进程。

## 5. DMG 内置双架构 Runtime Pack

App shell 与渲染依赖在 build/identity 上分开维护，但 v1 发行时每个 native DMG 内置唯一匹配的 immutable
Runtime Pack：

```text
rsp-runtime-<version>-darwin-arm64.tar.zst
rsp-runtime-<version>-darwin-x64.tar.zst
```

Runtime Pack 至少绑定：

```text
runtimePackVersion
platform = darwin
arch = arm64 | x64
engineVersion
protocolVersion
exact Remotion package set
browser identity + checksum
FFmpeg/FFprobe identity + checksum
managed file manifest
```

release pipeline 先独立生成并验证 Runtime Pack，再把 exact bytes 放进对应 `.app` 的只读 Resources。启动时根据
`process.arch` 只接受内置匹配 pack，并复验 release manifest、regular-file/no-symlink、size 和 checksum；缺失、
架构错误或 bytes drift 直接 fail closed，不访问 npm、镜像或备用下载源。首阶段 checksum 只能发现损坏或与已发布
manifest 不一致，不能替代 Developer ID 提供的发布者身份和防篡改信任链。

v1 不提供 online/thin DMG，也不在首次启动下载 Remotion、browser、FFmpeg 或 Node。App 自带 Chromium 只服务
Electron UI；内置 renderer browser 是单独绑定版本和 checksum 的 Runtime Pack 成员，不得把 Electron executable
当作 Remotion renderer browser。App 升级以新完整 DMG 一起替换 App 与 Runtime Pack，不能让组件独立漂移。

## 6. 跨架构 identity 与复用

Project authoring、Story、TTS、Scene/GlobalVisual/Cover source 和大多数 Artifact 应保持架构无关。换 Intel/Apple
Silicon 不应重新委派无关 Agent task 或重新调用 TTS。

Delivery bytes 可能受 renderer browser、FFmpeg、platform 和 architecture 影响。因此 clean-break 实现必须让
DeliveryBuildId 的 build policy 包含稳定的 `rendererRuntimeFingerprint`，它至少覆盖：

```text
runtimePackId
Remotion renderer version
browser identity
FFmpeg/FFprobe identity
platform
architecture
codec/build policy
```

`platform`/`architecture` 只属于 Delivery renderer policy，不进入 ProductionRevision、Scene TaskRevision 或
Agent Artifact identity。相同 Workspace 从 x64 Mac 移到 arm64 Mac 时，已验证创作 Artifact 可复用；旧
Delivery 显示 stale，并使用新 rendererRuntimeFingerprint 构建新的 current delivery，不能形成相同 identity/
不同 bytes 冲突。

## 7. Workspace 与 macOS 路径

默认路径：

```text
/Applications/AXMORF Studio.app                  user-installed App; unsigned initially, treated read-only
~/Movies/AXMORF Studio/                          default user-configured Workspace Root
~/Library/Application Support/com.axmorf.studio/ App state and credentials metadata
~/Library/Caches/com.axmorf.studio/              render temp and disposable cache
~/Library/Logs/com.axmorf.studio/                redacted local diagnostics
```

Settings 只有一个 Workspace Root 选择项；`projects/`、`media/`、`deliveries/` 和 `.rsp/` 使用产品方案定义的
固定名称，不能分别覆盖。App installation、Application Support、Cache 和 Workspace 不能形成重叠 ownership。
App update 只能替换 `.app`，不得扫描或迁移 Workspace；Workspace/schema migration 必须是独立、显式、
可恢复的整体操作。

credentials 优先进入 macOS Keychain-backed secret storage；不得进入 Workspace、Agent task workspace、Runtime Pack、
日志或 release artifact。现有 private config 迁移前仍按 strict `0600` 和原子写保护。

## 8. 构建、完整性与后续签名

v1 采用 Electron Forge，并为每个 App version 建立两个独立 release jobs：

| Job         | Output                                 | 必须验证                                                         |
| ----------- | -------------------------------------- | ---------------------------------------------------------------- |
| `mac-arm64` | native arm64 `.app`、full unsigned DMG | Apple Silicon offline install、Preview Player、Agent CLI、render |
| `mac-x64`   | native x64 `.app`、full unsigned DMG   | Intel offline install、Preview Player、Agent CLI、render         |

两个 job 使用相同 bundle ID、App version、protocol/Skill versions，但引用各自 RuntimePackId。最终 binary
必须在对应 native hardware 上运行 E2E；能 cross-package 不等于 native verification。

首阶段无签名发行规则：

1. Electron Forge 不配置 Developer ID identity 或 notarization credentials；Apple Silicon 如需 ad-hoc
   signature，只能使用无 identity 的 ad-hoc 模式并记录在 build manifest；
2. DMG 文件名、下载页和 About/diagnostic 信息明确标记 `unsigned`，不能暗示经过 Apple 验证；
3. 每个 DMG 生成 SHA-256、release manifest、SBOM 和构建 provenance；manifest 必须覆盖内置 Remotion、browser、
   FFmpeg/FFprobe、Node 和 Skill exact bytes，并在受控发布页同时公布；
4. clean-machine 验证必须覆盖 Gatekeeper 的实际阻止行为，以及用户通过 System Settings → Privacy & Security →
   Open Anyway 的官方手动放行流程；
5. 不要求用户全局关闭 Gatekeeper，也不把删除 quarantine attribute 的 shell 命令作为标准安装步骤；
6. 受公司 MDM/安全策略约束、无法手动放行的 Mac 明确列为首阶段不支持；
7. unsigned channel 禁用后台下载、静默替换和 Electron `autoUpdater`，更新只能重新下载 DMG 并手动安装。

这条路径可以生成和分发 DMG，不需要付 Apple Developer Program 年费；代价是 macOS 无法验证开发者身份或
notarization 状态，第一次启动存在明显的 Gatekeeper 阻力。

以后若决定启用低阻力的 Developer ID 发行，需要：

1. Apple Developer Program 与稳定的 Team ownership；
2. Developer ID Application certificate；
3. hardened runtime 和最小 entitlements；
4. 递归签名 App、Electron helpers 和所有 bundled executable；
5. 上传 Apple notarization；
6. notarization 成功后 staple；
7. `codesign`、`spctl`、stapler validation 和 clean-machine launch；
8. 为 DMG、update artifact 和 Runtime Pack 发布 SHA-256/release manifest。

v1 不进入 Mac App Store。MAS 要求另一套 Electron build/App Sandbox，而当前 App 需要 local authenticated Agent
CLI、用户选择的 Workspace filesystem、child render 和 provider integration；不能在未完成单独 sandbox
architecture 设计时假设同一 binary 可以直接提交商店。

## 9. 手动更新与后续自动更新

首阶段 unsigned channel 不调用 Electron `autoUpdater`。App 可以显示当前版本并打开项目维护的下载页，但不在
后台下载或安装新 `.app`；用户下载对应架构的新 DMG 后手动替换 App。App installation 与 Workspace Root 隔离，
因此手动替换 `.app` 不得修改 Project、媒体、Artifact、Attempt、private config 或 Delivery。

首阶段 release/download hosting 使用公开 GitHub Releases：beta 使用 GitHub prerelease 标记，stable 使用普通
release。App 只打开对应 release page，不实现自己的更新 feed、后台下载或静默安装；每个 release 同时发布两种
架构的 full unsigned DMG、SHA-256、release manifest、SBOM、third-party notices 和安装说明。

以后启用 Developer ID 签名后，macOS auto-update feed 必须按 platform/architecture/channel 路由：

```text
/updates/darwin/arm64/stable/...
/updates/darwin/x64/stable/...
```

签名 channel 的更新规则：

- signed channel 只有 `stable` 和显式 opt-in `prerelease`；
- App 可后台下载完整 signed update，但 active Attempt/DeliveryBuild 期间不得安装或切换 App/Runtime Pack；
- 安装前持久化脱敏 update intent、current version 和 compatibility result；
- 新 App 第一次启动先 doctor，不自动迁移 Project；
- 新 App/Runtime Pack doctor 失败时继续使用上一已验证完整版本；
- Skill 只在没有 active production 且 managed files 未被用户修改时原子更新；
- x64 与 arm64 release 必须是同一 product version；任一架构 release gate 失败则该版本整体不发布；
- Intel support 的终止只能发生在 major release，并提前给出支持窗口和 Workspace 迁移说明。

## 10. 版本与 compatibility manifest

一个用户可见 `appVersion` 对应一份 release compatibility manifest：

```text
appVersion
engineVersion
protocolVersion
skillVersion
workspaceSchemaVersion
projectSchemaReadRange
projectSchemaWriteVersion
darwin-arm64 RuntimePackId
darwin-x64 RuntimePackId
minimumMacOSVersion
```

v1 不允许每个组件独立漂移。release pipeline 生成 manifest，App/CLI/Skill 只能消费它，不能各自推断最新版。
Project schema migration 使用 same-parent staging、完整验证和 rollback；App 更新不能把 Workspace 中的旧 Project
静默改写为新版本。

## 11. macOS 双架构验证矩阵

每个 release candidate 至少通过：

- repository focused/full static checks；
- arm64/x64 package manifest、SHA-256、fresh-download Gatekeeper 阻止和官方手动放行验证；
- 未来 signed channel 另行验证签名、notarization、staple 和 Gatekeeper 正常打开；
- 两种架构的 fresh user、无 Node/npm/Git 环境启动；
- 断网环境 first-run doctor、embedded Runtime Pack verification 和最小 Preview Player/render smoke；
- Codex/Hermes workspace-local integration 与 Skill install/repair/uninstall；
- `rsp` 在 App connected/disconnected/版本不兼容时的结构化结果；
- Preview Catalog refresh 后出现新 current Project/Delivery，播放、音频、seek 和 Scene/旁白/字幕时间轴正确；
- App-owned packaged runtime 没有常驻 TCP listener；DeliveryBuild期间唯一listener精确为`127.0.0.1` OS-ephemeral，
  终态/退出后归零；Forge Vite 开发端口不能作为该证据；
- manual policy 到 `source-current` 且不生成 Delivery，UI 明确显示无可播放预览；
- automatic policy 生成并复验 exact four-file delivery；
- App 窗口关闭后 active production 继续、显式 Quit 有确认；
- App/Engine/render crash recovery 与 incomplete staging cleanup；
- Workspace 在两种架构间迁移时创作 Artifact 复用、Delivery renderer 精确失效；
- App update 不修改 Workspace，active production 阻止切换；
- credentials/private paths 不进入 Agent context、diagnostic bundle 或 release artifact。

不存在 Intel CI/hardware evidence 时不能宣称 x64 支持；Rosetta smoke 不替代 Intel native verification。

## 12. 依赖维护策略

- Electron/Chromium：跟随 supported stable line，优先处理安全更新；若新 major 改变最低 macOS，要先更新支持
  矩阵，不能静默抛弃 Intel/旧系统；
- Remotion：所有 `remotion`/`@remotion/*` 继续精确同版；升级产生新 RuntimePackId，并跑两架构 Preview
  Player/render E2E；
- browser/FFmpeg：只通过 Runtime Pack 升级，不运行时在线选择“最新”；
- Node/npm：开发工具版本与发行 Engine runtime 分开记录，最终用户不需要自行安装；
- Electron/Remotion/native dependencies 的 license、NOTICE、SBOM 与 checksum 随 release 生成；
- CVE 修复不能在 active Attempt 中热替换 runtime，必须生成新 release/pack 并在安全边界处切换。

## 13. 发行 Gate 0：许可证与项目开源

项目自有源码采用 Apache License 2.0 作为开源目标许可证。它与当前已本地化的 Apache-2.0 adaptation
兼容，允许个人和公司使用、修改与再分发，并提供明确 patent grant。AXMORF 名称、wordmark 和 mark 不随源码
授予品牌使用权；Apache-2.0 自身不授予 trademark 权利，公开仓库还要增加 `TRADEMARKS.md`，要求非官方 fork
使用不同产品名、bundle ID 和 icon。

这个决定只覆盖项目自有源码，不会把第三方依赖重新许可为 Apache-2.0。当前安装的 Remotion `4.0.489` 中，
`remotion`、`@remotion/cli`、`@remotion/renderer` 等关键包使用 Remotion License；官方也明确说明 Remotion
是 source-available 而不是 OSI open source。官方 FAQ 允许符合 Free License 条件的个人/三人以内组织免费使用，
也允许 AI 生成 Remotion code 和构建 automation，但同时禁止把 Remotion 本身作为产品出售或帮助其他用户绕过
其许可证义务。Phase A 不打包或运行 Remotion Studio；Phase B Runtime Pack 携带 renderer/bundler、其必要的 exact
Studio/Studio Shared 内部依赖和对应 browser/media runtime，但明确排除 Remotion CLI、Studio Server、Studio UI 与
launch surface。现有条款没有明确授权这种 binary redistribution。

因此在公开 DMG 前，仍必须取得 Remotion 官方对以下模式的书面确认：免费 Apache-2.0 项目、无内置 Agent、
最终用户使用自己的 Agent、每个用户在自己的 Mac 上运行 bundled renderer/runtime、维护者不提供远程渲染服务。
确认必须回答 binary redistribution 是否允许、维护者和最终用户分别适用什么 License、是否需要在 App 中收集或
配置 license key，以及大于三人的最终用户如何自行合规。未确认前可以做内部 prototype 和 unsigned 技术验证，
但不能公开包含 Remotion runtime 的 DMG。

Remotion 分发的 FFmpeg binary 目前是 GPLv2+，并包含 GPL 的 x264/x265；codec patent 权利不由 Remotion License
或 GPL 自动提供。公开 binary 还必须保留对应许可证/源码与构建脚本义务，并按实际发行地区复核 codec patent
风险。

当前 repository 仍是 `private: true` / `UNLICENSED`；本次只确认目标许可证，不提前激活授权。正式开源动作要
一起添加根 `LICENSE`、`NOTICE`、`TRADEMARKS.md`、`THIRD_PARTY_NOTICES`、DCO、`SECURITY.md` 和 SBOM/release
license inventory，再把 `package.json` 改为 `Apache-2.0` / non-private。不能只改一个 package 字段。

## 14. 实施路由

阶段顺序、进入条件和当前下一里程碑只由 [ROADMAP.md](ROADMAP.md) 定义。本文负责约束每个阶段必须遵守的
macOS process、Runtime Pack、Workspace、双架构、unsigned/signed channel、验证矩阵和发行 Gate，不再维护一份
平行 phase list。任何顺序调整先更新 Roadmap；任何平台或发行约束调整更新本文。

## 15. 公开发行门槛与延后决策

产品默认值已确认，不再阻塞实施。以下项目按对应阶段处理：

1. 公开 beta 前取得 Remotion 官方书面许可证确认；
2. 真实 Intel x64 packaged App/Preview Player/render evidence 已在 Phase C 取得；公开 x64 构建仍与 arm64 一样受第 1 项
   许可 Gate 约束；
3. Intel 最低支持年限和退场通知期在首次 stable 前发布；
4. 用户规模、安装失败率或支持成本证明有必要时，再决定购买 Apple Developer Program；
5. 独立官网/object storage、signed update feed 和自动更新都延后到 Developer ID 阶段评估。

## 16. 当前非事实

本文主要是维护目标。Phase A Electron repository-adapter prototype 与 Phase B Workspace production implementation 已
完成。Phase B 只允许 DeliveryBuild 范围内 `127.0.0.1` OS-ephemeral renderer listener，Runtime Pack 仅携带
checksum-bound 的 exact 内部渲染依赖且无 CLI/Studio Server/launch surface；exact commit
`04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 已通过 hosted macOS 15 arm64 packaged production gate。
Phase C 已配置化支持 darwin arm64/x64 Runtime Pack、package 与 native gate，并为 x64 精确选择
`@remotion/compositor-darwin-x64`；两种架构已在 exact hosted native runner 上完成 packaged
App/production/Delivery/Preview/cleanup evidence，状态为 `verified-complete`。这表示 exact evidence commit 的内部
darwin x64 native contract 已验证；不表示 DMG、签名、公证、auto-update、Hermes external-Agent production、
distribution 或公开支持政策已完成。
精确 executable evidence 见 [ITERATION_STATUS.md](ITERATION_STATUS.md)；不得用 deterministic fixture 伪造
Codex/Hermes creative E2E，也不得把内部 native evidence 写成发行证据。

## 17. Primary references

- [Electron supported architectures](https://www.electronjs.org/docs/latest/tutorial/installation)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)
- [Electron code signing and notarization](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Electron autoUpdater signing requirement](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [Electron breaking changes and macOS support](https://www.electronjs.org/docs/latest/breaking-changes)
- [Electron Universal package](https://packages.electronjs.org/universal/v3.0.6/index.html)
- [Apple Developer ID](https://developer.apple.com/support/developer-id/)
- [Apple Silicon executable signing requirement](https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes)
- [Apple: Open apps safely on your Mac](https://support.apple.com/en-us/102445)
- [Remotion renderer](https://www.remotion.dev/docs/renderer/render-media)
- [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- [Remotion license FAQ](https://www.remotion.dev/docs/license/faq)
- [Remotion FFmpeg license](https://www.remotion.dev/docs/miscellaneous/ffmpeg-license)
