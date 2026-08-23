# Desktop App 与外部 Agent 产品架构

> 文档类型：Desktop App 产品目标 authority
>
> 状态：产品方向与 macOS v1 默认值已确认；Phase A 与 Phase B 已 verified complete；当前路线进入 Phase C 双架构验收
>
> 当前实现事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)，现有生产 authority 见
> [ARCHITECTURE.md](ARCHITECTURE.md) 与 [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)。

## 1. 产品结论

Remotion Story Producer 的终端产品形态是本地 Desktop App，但 App 不内置、不托管也不调度创作 Agent。
用户继续使用自己的 Agent；v1 首批认证 Codex 和 Hermes，Claude、Gemini、Cursor 与其他 shell-capable Agent
保持协议兼容目标，但在完成各自真实 E2E 前不宣称正式支持。App 通过 workspace-local Skill、稳定 CLI/IPC 和
task workspace 与外部 Agent 协作。

用户可见正式产品名采用 `AXMORF Studio`；`remotion-story-producer` 保留为 repository/engine identifier，
不作为安装后的主品牌。macOS bundle ID 采用 `com.axmorf.studio`。App icon 从 current canonical AXMORF mark
派生，复用相同 `640 × 640` 几何路径，以 `#242424` 深灰、`#a37d5c` 暖棕和 `#fffdf9` 暖白为基础；图标只用
mark，不把小尺寸不可读的 `AXMORF` wordmark 塞进 icon。实现时从一个 brand source 导出 SVG、PNG 和 ICNS，
不能在 Electron、视频模板和发行素材中维护多份手绘副本。

App 负责：

- 承载内置 Preview Player、只读多轨时间轴和 App Settings；不启动或嵌入 Remotion Studio；
- 管理单一用户 Workspace Root 下的 Project、媒体、task workspace、诊断、Artifact 与 Delivery；
- 提供稳定的生产命令和脱敏上下文；
- 创建 Agent task workspace，并机械校验、提交和物化结果；
- 在 verified current Delivery 变化后刷新 Preview Catalog；
- 按配置决定是否继续生成并复验 Delivery；
- 检测环境、Agent integration、Skill 和引擎协议兼容性。

用户自己的 Agent 负责：

- 理解用户创作意图；
- 根据 Skill、App 投影的公开配置和本次提示词完成 Story、Scene、GlobalVisual、Cover 等创作任务；
- 只修改命令返回的 task workspace；
- 调用固定 check/commit/fail 命令，不直接物化 Project 或伪造完成状态。

Skill 负责：

- 告诉 Agent 决策顺序、命令协议、任务写入边界和完成证据；
- 将不同宿主接到同一套 contracts/validators 上；
- 保持 host-neutral，不复制 App 引擎的确定性业务规则。

```text
用户提示词
    |
用户自己的 Agent
    | 读取 workspace Skill
App 提供的 CLI / 本地 IPC
    |
App production engine <--- App settings
    |-- task workspace -> validate/commit -> materialized Project -> source-current
    `-- delivery policy -> verified four-file Delivery -> Preview Player / timeline
```

## 2. 分发与数据隔离

普通用户应下载安装包，而不是 clone 源码仓库后运行 npm scripts。源码仓库继续服务贡献者和开发构建；
发行版安装目录只保存 App、生产引擎、Remotion runtime 和公开 CLI，不保存用户作品。

用户数据位于用户选择的 Workspace Root。App 更新不得覆盖 Project、媒体、Artifact、Attempt 或 Delivery。
App 安装目录与 Workspace Root 必须是两个不同 ownership root；credential、Runtime Pack 和 disposable cache
继续使用 macOS Keychain/Application Support/Caches，不作为第二个用户可配置目录。

长期目标可以包括 Windows、macOS 与 Linux，但 v1 已确定只实现 Electron macOS App，并正式支持 Apple
Silicon `arm64` 和 Intel `x64`；维护方案固定分别发布两个原生构建。进程、Runtime Pack、签名、公证、更新和支持矩阵由
[Desktop App macOS 维护与发行](DESKTOP_APP_MACOS_MAINTENANCE.md) 负责。

首阶段已确定使用明确标记为 unsigned 的站外 DMG，不购买 Apple Developer Program、不做 Apple notarization、
不启用 macOS auto-update；用户按官方 Gatekeeper 手动放行流程安装。以后是否升级为 Developer ID 签名发行，
根据真实用户规模、安装失败率和支持成本决定。这只改变 App 的安装信任体验，不改变 App/Workspace/Agent task workspace
的隔离边界。

v1 只发布完整离线 DMG。每个架构的安装包内置匹配的 App Engine、Node runtime、精确同版 Remotion package
set、renderer browser、FFmpeg/FFprobe 和 workspace Skill；首次启动不访问 npm、不选择镜像源，也不下载 Runtime
Pack。用户无需预装 Node/npm/Git，网络不可用或地区 package source 不一致不能改变实际运行版本。这个选择会增加
DMG 体积，并明确构成 Remotion runtime binary redistribution；真正公开下载仍受 macOS 维护方案的许可证 Gate 0
约束。

## 3. Agent integration 安装生命周期

采用“工作区自动安装，用户级安装可选”，不在操作系统安装阶段静默修改 Agent 配置。

| 时机         | App 行为                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------- |
| 安装 App     | 安装 App、引擎和 CLI；不修改 Agent home，不安装或升级用户的 Agent                                   |
| 第一次启动   | 只读检测环境与已知 Agent；默认创建 `~/Movies/AXMORF Studio/`，也允许初始化前改选 Workspace Root     |
| 初始化工作区 | 写入 workspace-local Skill、`AGENTS.md` 和必要的 thin host adapters，并记录版本 manifest            |
| 每次启动     | 检查 App/engine/protocol/Skill compatibility；没有 active production 时才允许原子更新 managed Skill |
| 设置页面     | 提供重新检测、安装/更新、修复、显示目录、卸载和复制启动提示词                                       |
| 用户级 Skill | 仅在用户明确点击后安装；不得静默覆盖用户修改或其他版本                                              |

不在 installer 阶段安装 Skill 的原因：installer 可能运行在错误用户或提升权限下，用户可能尚未安装 Agent，
不同 Agent 的 discovery 规则和版本也可能变化。Project 首次创建时才安装又过晚，并会让每个 Project 重复
拥有 integration lifecycle。

v1 对 Codex 使用原生 `AGENTS.md`/Skill discovery；Hermes 使用同一 `AGENTS.md` authority 和 App 生成的启动提示词，
不能为 Hermes 复制另一套生产规则。两者都从同一工作区入口和 CLI protocol 运行。

固定工作区入口：

```text
<workspace>/
  AGENTS.md
  CLAUDE.md
  GEMINI.md
  .agents/skills/remotion-story-producer-video/
  .rsp/bin/rsp
  .rsp/workspace.json
```

`AGENTS.md` 是 host-neutral instruction authority；宿主 adapter 只负责导入或发现，不复制生产规则。App-managed
Skill 可更新，用户自己维护的 Skill 不自动覆盖。每个 manifest 至少记录：

```text
workspaceSchemaVersion
appVersion
engineVersion
protocolVersion
skillVersion
managedFiles + checksums
```

兼容升级可原子替换 managed files；不兼容升级必须在开始新 production 前迁移或阻塞。进行中的 Attempt 固定
使用启动时的协议和输入，不在中途切换 Skill/engine policy。

## 4. 稳定 CLI 与配置投影

发行版必须提供稳定的公共命令，不要求用户或 Agent 知道源码仓库路径、Node module layout 或内部 npm script。
命令名仅用于表达目标 surface，精确 schema 在实现设计时确定：

```text
./.rsp/bin/rsp doctor
./.rsp/bin/rsp context --project <storyId>
./.rsp/bin/rsp inspect --project <storyId>
./.rsp/bin/rsp prepare --project <storyId>
./.rsp/bin/rsp task check --task <taskRevision>
./.rsp/bin/rsp task commit --task <taskRevision> --attempt <attemptId>
./.rsp/bin/rsp task fail --task <taskRevision> --attempt <attemptId> --kind <task|host>
./.rsp/bin/rsp continue --project <storyId> --revision <revisionId> --attempt <attemptId>
./.rsp/bin/rsp delivery build --project <storyId>
```

`.rsp/bin/rsp` 是 App-managed、checksum-bound 的 workspace-local launcher，不依赖系统 `PATH`，也不是指向
可变源码 checkout 的 symlink。它通过 `.rsp/workspace.json` 定位当前 App session 与 Workspace，不把 App 安装
绝对路径写入 Skill。底层 control plane 只使用 workspace-contained authenticated UDS，不开放 TCP/Web service；唯一例外是
真实 DeliveryBuild 内 renderer 自用的 `127.0.0.1` OS-ephemeral 临时数据 listener；对 Skill 保持同一 JSON
protocol。v1 App 未打开时返回明确的
machine-readable `rsp-app-unavailable`，不自动启动独立 headless engine，也不静默换用另一条生产链。

Agent 不直接读取 App 的原始设置文件。`rsp context` 只投影任务所需的公开配置和 capability status：

- Project/render/visual/TTS policy 的非秘密部分；
- resolved delivery policy；
- task workspace 和允许的输出集合；
- provider readiness，但不含 token、私有声音内容或受保护绝对路径；
- 本次提示词允许覆盖的字段。

自然语言可以覆盖本次创作、render 或 delivery policy，但不能覆盖 storage root、路径 containment、credential、
validator 或安全策略。

## 5. 单 Workspace Root 与固定目录

Settings 只允许用户选择一个 Workspace Root，首次启动默认创建 `~/Movies/AXMORF Studio/`。没有 Project Root、Media Root、Delivery Root 或 private root
高级覆盖；所有子目录名称和职责由 App contract 固定，避免路径组合、迁移和 task containment 重新出现多重
authority。

```text
<workspace>/
  AGENTS.md
  CLAUDE.md
  GEMINI.md
  .agents/        App-managed workspace-local Skills
  projects/       authored 与 materialized Remotion Project source
  media/          Project-owned 图片、音频、字体和导入资源
  deliveries/     current video、covers 和 publish manifest
  .rsp/
    bin/rsp        App-managed local launcher
    workspace.json
    work/         per-task Agent workspace 与 materialization staging
    artifacts/    content-addressed validated artifacts
    attempts/     append-only diagnostics 和 task terminal events
```

设置页面只显示：

- Workspace Root；
- 选择、打开和整体迁移 Workspace 的操作；
- 可用磁盘空间、写权限和目录健康状态。

`.rsp/` 是 App-managed internal area，普通用户不把它当作作品目录。provider credentials 和 signing secrets
只进入 Keychain-backed storage；Runtime Pack 保持在只读 App Resources，App state、release metadata 和 disposable
cache 分别进入 Application Support/Caches，不放入 Agent 可见 Workspace。Workspace Root 必须
realpath/canonicalize，并拒绝安装目录、Application Support、
Cache、symlink escape、special file 或现有不兼容 Workspace。改变位置必须整体迁移并原子切换 root marker，
不能分别搬动子目录或留下两个 authority。

路径本身不进入 ProductionRevision/TaskRevision；进入 identity 的是 Project 输入、policy fingerprint、
manifest identity 和 bytes checksum。

## 6. Agent 写入和越界处理

“产物生成到配置目录”是用户看到的最终效果，不代表 Agent 可直接写最终目录。实际写入链必须是：

1. App/engine 创建 `.producer-work` 等价的 per-task workspace；
2. Agent 只读取 immutable task/context，并只写 declared output set；
3. fixed check/commit 重跑 validator；
4. 通过后原子提升到 Artifact Store；
5. 全部 required artifacts 有效后由 fixed materializer 写 Project/Media；
6. live bytes 与 attestations 复验一致后才标记 `source-current`。

Agent 修改未知文件、越过 workspace、写 symlink、改变 immutable input 或输出集合不一致时，task 必须失败并
返回 exact changed paths。App 不吸收、不自动清理也不把这些修改物化为作品。App-owned installation files 默认
只读，外部 Agent 不在安装目录内工作。

这个边界也隔离了原共享 checkout 问题：用户作品和 task workspaces 不再与 App 源码混放；Revision 只绑定
真正影响当前 Project 的输入和 runtime policy。其他 Project 或无关文件变化不应使当前任务失效。

## 7. App 主界面与 Preview Player

App 主界面是 bundled Preview Player，而不是 Remotion Studio 或另一个本地 Web App。Phase A 和最终产品都不为
预览启动 HTTP/TCP server。主界面只提供用户实际需要的受控 surface：

- 当前 Project/video 选择；
- verified `video.mp4` 播放、frame/timecode 和音量控制；
- 与播放头同步的只读多轨时间轴，展示 Scene ranges、narration chunk/pause、caption cue 和 Scene boundary；
- production 与 delivery 状态、Settings、输出目录和失败诊断；
- Agent Workspace 状态及“复制启动提示词”。

Preview Player 使用 current four-file Delivery 的 `video.mp4`，只在 exact file set、manifest identity、checksum、
media probe 与 EOF decode 均已通过后加入 Catalog。它不动态执行 Project TSX，不加载任意 filesystem path，也不把
packaged renderer 与运行时新增 Project 的源码耦合。Main 通过 allowlisted custom protocol 只流式提供 Catalog 中
已验证的媒体；Renderer 只接收 opaque media URL，不接收 absolute path、checksum 或 size。

时间轴只投影 Project 的 canonical `SemanticTiming` 与 current Delivery metadata。UI 不重新计算 narration timing、
不写回 Project，也不建立第二套 Scene/transition authority。播放头、seek 和选中 Scene 是 transient UI state，
不进入 ProductionRevision、TaskRevision、ArtifactAttestation 或 DeliveryBuild identity。

materialization 成功后 fixed controller 仍刷新 ProjectRegistry、ResourceCatalog、RendererRegistry 和 Composition 等
静态 projection，并标记 `source-current`；只有 Delivery current 后视频才可播放。Agent 不直接编辑 registry，也不
向 UI 发送自定义完成消息。Preview 是交互查看 surface，不替代 validator、artifact 或 delivery evidence。

## 8. Source-ready 与 Delivery 分离

App 产品层需要显式区分：

- `source-current`：Remotion source/media 已物化、复验，但还不表示有可播放视频；
- `delivery-stale`：存在旧 Delivery，但其绑定的 source/revision 已过期；
- `delivery-building`：fixed builder 正在生成和复验；
- `delivery-current`：exact current delivery 已完整复验；
- `failed`：显示具体阶段、changed input 或机械失败原因。

v1 默认配置已确定为：

```json
{
  "deliveryPolicy": "manual"
}
```

允许值：

- `manual`：到 `source-current` 停止，用户从 App 点击“生成 Delivery”；
- `automatic`：`source-current` 后自动进入 fixed DeliveryBuild。

解析优先级为“本次提示词明确字段 > Project 设置 > App 全局默认”。例如“先准备源码，不渲染”解析为本次
`manual`，“直接制作并播放成片”解析为本次 `automatic`。override 默认不写回设置。

默认 `manual`，避免视觉微调反复触发昂贵 render。无论策略为何，只有四文件、checksum、media probe 与
EOF decode 全部通过才能显示 `delivery-current`。Phase B 已把 converge/source-current 与 DeliveryBuild
clean-break 为两个 fixed use case；UI 只投影这个 contract，不隐藏或伪造 delivery 调用。

## 9. First-run 与 Settings 诊断

第一次启动和设置页共用同一套只读 doctor：

- OS/architecture 与 App engine compatibility；
- Remotion/Chromium/FFmpeg runtime health；
- Workspace 固定目录权限、containment 和剩余空间；
- Preview Catalog、custom media protocol 与本地 IPC 状态；
- TTS provider/config readiness，输出脱敏结果；
- 已知 Agent 是否存在、workspace integration 是否安装、Skill/protocol 是否兼容；
- active Attempt 是否阻止迁移或更新。

检测到 Agent 不代表 App 获得控制该 Agent 的权限。App 不安装 Agent，不读取聊天，不持久化 Agent identity、
token、heartbeat 或 child lifecycle。

## 10. 配置层次与 ownership

配置固定分为四层：

1. App private config：credentials、provider secrets，仅 App 可读；
2. App global preferences：Workspace Root、默认 render/delivery/execution policy；
3. Project settings：当前作品可复现的 authored/render/publishing intent；
4. One-run resolution：用户提示词明确覆盖的 allowlisted fields，不自动持久化。

storage/security/validator fields 不允许从第 4 层覆盖。App UI、CLI 和 Skill 只投影各自需要的最小视图，不能
复制同一字段为多个 authority。

## 11. Phase B verified 实现与剩余产品差距

Phase B 已把 Phase A repository adapter clean-break 为显式 Workspace production：安装资源、Application
Support、Cache 与 Workspace ownership 分离；Workspace v2、整体迁移/rollback、immutable Runtime Pack、
production-capable `rsp-local-v2`、managed Skill、`source-current`/optional Delivery contracts、active-work lifecycle 与
automatic Preview Catalog refresh 已有 executable implementation 和 focused tests。普通 Engine bundle 不再携带
repository、npm、Settings Web 或 Remotion Studio runtime authority。

当前 implementation 已加入：checksum-bound exact Remotion bundler/renderer 内部依赖、Workspace-only disposable bundle、
DeliveryBuild 范围内严格 `127.0.0.1`/OS-ephemeral listener、manual/automatic exact-four-file Delivery 与退出清理。UDS
仍是唯一 control plane；App 不启动 Remotion Studio UI、Studio Server、Settings Web service，也不暴露 CLI/Studio launch
surface。exact commit `04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 已在 hosted macOS 15 arm64 packaged
native gate 验证 manual source-current + explicit Delivery、automatic Delivery、Preview playback/timeline、loopback
listener scope 和 terminal/failure/Quit/reopen cleanup；精确 run/artifact 与复核范围见
[ITERATION_STATUS.md](ITERATION_STATUS.md)。该证据使用 test-only deterministic task executor，不构成 Hermes 或其他
已安装外部创作 Agent 的 production proof。

剩余产品差距是 Intel x64 native E2E、Hermes Workspace production proof、DMG/installer、code signing/notarization、
binary release、update channel 和长期 support policy。Phase B 状态为 `verified-complete`；后续路由以
[ROADMAP.md](ROADMAP.md) 为准。

## 12. 后续产品完成门槛

最终 v1 在 Phase B 已验证能力之外仍至少需要证明：

- 新用户无需 clone repo、无需修改源码即可安装并打开 Preview Player；
- Codex 与 Hermes 能从同一工作区协议完成等价任务；
- App 未内置或调用厂商 Agent SDK；
- Agent 越界修改在物化前被拒绝并给出 exact paths；
- App 升级不会修改用户 Workspace；
- delivery-current 后 Preview Catalog 能自动更新并选中目标视频；
- manual policy 不产生 Delivery，automatic policy 生成并复验 exact four files；
- unrelated Project/App workspace 修改不会使当前 task revision 失效；
- credential、private path 和 voice content 不进入 Agent context、日志、artifact、delivery 或 Git；
- installer、uninstaller、迁移、升级失败和 rollback 都有可恢复验证。

## 13. macOS 维护方案

已确认 v1 使用 Electron、只做 macOS、同时支持 Apple Silicon `arm64` 与 Intel `x64`；App 必须运行，active
production 时关闭主窗口继续驻留，不实现独立 daemon。维护方案固定双原生发行；精确架构、Runtime Pack、跨架构 identity、
首阶段无签名 DMG、Gatekeeper 手动安装、后续可选 Developer ID 签名/公证、更新、验证矩阵、公开发行门槛和延后事项见
[Desktop App macOS 维护与发行](DESKTOP_APP_MACOS_MAINTENANCE.md)。

维护方案不得建立第二条 production 主链，也不能把目标设计写进 current implementation 状态。
