# AXMORF Studio Desktop App Phase B 实施计划（归档）

> 文档类型：已实施计划快照，不是 current implementation authority
>
> 计划基线：`19f6cb4`
>
> 归档状态：2026-08-23 `verified-complete`；evidence commit `04ca57ed5b6469eb9bc4acd8c86829ca0222576a`，Actions run `32648089941`，artifact ID `9495509231`
>
> 最后复核：2026-08-23

本计划把 [Desktop App 产品边界](../../DESKTOP_APP_PRODUCT.md)、
[macOS 维护和发行目标](../../DESKTOP_APP_MACOS_MAINTENANCE.md) 与 current repository production authority 收敛为
Phase B 实施、验证和交付工作包。Phase B 已完成，本文件只保留实施快照；当前能力仍只由
[ITERATION_STATUS.md](../../ITERATION_STATUS.md) 声明。计划文字、Red test、build artifact 或单个 `rsp` 命令都不是完成证据。

2026-08-23 的实现完成 contracts、explicit locations、`source-current`、Workspace v2、Runtime Pack、Workspace-owned
Project/private config、`rsp-local-v2`、Engine/UI、managed Skill 与真实 Workspace Delivery adapter。Remotion 4.0.489
只在单个 DeliveryBuild 内使用 `127.0.0.1` 的 OS-ephemeral 临时 HTTP listener；UDS 仍是唯一 control plane。
Runtime Pack 携带 bundler/renderer 所需、checksum-bound 的 exact Studio/Studio Shared 内部包，但不携带或启动 Remotion
CLI、Studio Server、Studio UI、Settings service 或相应 launch surface。

exact commit `04ca57ed5b6469eb9bc4acd8c86829ca0222576a` 的 hosted `macos-15` arm64 Actions run
[`32648089941`](https://github.com/agenticnoob/remotion-story-producer/actions/runs/32648089941) conclusion 为 success；
artifact ID `9495509231` 已人工复核 ordinary/gate package inventory、arm64 Runtime/App identity、manual source-current
后 explicit Delivery、automatic Delivery、真实 four-file media facts、Preview Player 和失败/Quit/reopen 后的 process/TCP/
session/staging cleanup。artifact 不含 MP4、Cover 或 credential。native fixture 通过 public `rsp-local-v2` 执行
test-only deterministic task outputs，不代表安装外部创作 Agent 的真实 creative E2E，也不覆盖 x64、DMG、签名、
公证、distribution 或公开发行。Task 12 完成后 Roadmap 推进到 Phase C。

## 1. 目标与成功边界

Phase B 把 Phase A 的只读 repository adapter clean-break 为 Workspace-owned、production-capable Desktop App：

```text
bundled AXMORF Studio App + immutable Runtime Pack
  -> Engine utility process
    -> one explicit Workspace production layout
    -> current ProductionRevision / Task DAG / Artifact contracts
  -> authenticated workspace-local rsp v2
    -> external Agent writes only dirty task workspaces
  -> fixed materialization -> source-current
  -> manual user action or automatic policy -> fixed DeliveryBuild
  -> delivery-current -> bundled native Preview Player refresh
```

Phase B 不运行 Remotion Studio、Studio Server、repository Settings Vite 服务或其他预览/Settings HTTP service；唯一
local control plane 仍是 authenticated Unix-domain socket。Remotion renderer 只在当前 DeliveryBuild 内临时监听
`127.0.0.1` 的 OS-ephemeral 端口并只服务当前 bundle/media，终态、失败、取消与 App quit 后必须关闭。Preview Player 继续只播放 exact current
four-file Delivery 的 `video.mp4`，不动态执行 Project TSX。repository contributor 的 `npm run dev` 可以继续存在，
但不进入 App runtime、Runtime Pack、doctor 或 native evidence。

Phase B 完成时 `rsp doctor` 必须如实声明：

```json
{
  "adapterMode": "workspace",
  "runtimePackMode": "embedded",
  "network": {
    "controlPlane": "authenticated-unix-domain-socket-only",
    "persistentTcpListeners": false,
    "deliveryBuildListener": {
      "transport": "http",
      "host": "127.0.0.1",
      "portAllocation": "os-ephemeral",
      "scope": "delivery-build"
    }
  },
  "productionAvailable": true,
  "deliveryAvailable": true,
  "runtimePackAvailable": true,
  "distributionReady": false
}
```

`repositoryMode` 和 `host-node-prototype` 从 Phase B runtime contract 删除，不保留 alias、deprecated field 或
双 schema 输出。Phase A schema 只允许在 one-shot Workspace migration reader 内作为旧输入解析；迁移完成后 runtime
只读写 Phase B schema。

只有下列证据同时存在才可把 Phase B 标为完成：

1. App 从只读 Resources 中验证并启动 exact Runtime Pack，最终用户环境不需要预装 Node、npm、Git 或源码 checkout；
2. Project、media、workspaces、artifacts、attempts、source-current state 与 deliveries 的唯一数据 authority 位于一个
   Workspace Root，App installation、Application Support、Cache 与 Workspace ownership 不重叠；
3. workspace-local `rsp` 可完成 create/context/inspect/prepare/task check/commit/fail/continue/delivery，并保持
   current validators、attempt binding、one-shot continuation 与一小时 deadline；
4. `manual` 在 `source-current` 停止且不创建 Delivery，`automatic` 在同一 fixed controller 内继续构建并复验 exact
   four-file Delivery；两种策略不改变 ProductionRevision、TaskRevision 或 ArtifactAttestation identity；
5. delivery-current 后 Preview Catalog 自动刷新并可播放；source-current 或 stale/invalid Delivery 不得伪装成预览；
6. Phase A Workspace schema upgrade、整体 Workspace Root 迁移、失败 rollback、App restart 与 active work gate 有
   executable tests；不迁移 historical `.producer-runs`；
7. packaged App/Engine/Runtime Pack production E2E 在 Apple Silicon Mac Green；除 authenticated UDS 与 DeliveryBuild
   范围内的 `127.0.0.1` 临时 renderer listener 外没有 App-owned listener，终态和退出后没有 Engine、render child、
   TCP listener、session socket、claim 或 staging 泄漏；
8. focused、full repository、Desktop package/security 与 native gates 全部 Green，authority docs 与 Skill 同步。

如果代码与自动化完成但 Apple Silicon packaged production E2E 尚未完成，状态只能是
`implementation-complete-native-evidence-pending`。Intel x64 与双架构 release evidence 属于 Phase C，不阻塞该中间
状态，但 Phase B 不得宣称 x64、DMG 或 distribution ready。

## 2. 规划基线：`19f6cb4` 的 Phase A 限制

以下条目记录本计划开始时的 `19f6cb4` 历史基线，用来解释 Phase B 必须消除的限制；它们不是当前
working-tree 的实现状态。当前状态以本文开头的状态声明、可执行代码与测试为准。

- Phase A repository adapter 与 Apple Silicon native gate 已 verified complete；App 有 sandboxed bundled renderer、
  Engine utility process、managed Workspace、doctor-only `rsp`、Preview Catalog、custom media protocol 和 native
  `<video>` Player。
- Phase A Engine 使用 build-time repository locator，只读 repository Project/current Delivery；Workspace 的
  `projects/`、`media/`、`deliveries/` 和 `.rsp/{work,artifacts,attempts}` 当时还不是 production authority。
- `.rsp/bin/rsp` 当时仍使用 host Node，只支持 `doctor`；session protocol 是 `rsp-local-v1`，capability booleans 为 false。
- 当时的 repository application 仍大量接收 `rootDir` 并由 adapter 拼接 `src/projects`、`public`、`.producer-*`、
  `deliveries` 与 `private`；Desktop 不能靠伪造 repository tree、symlink 或复制安装源码来复用这些路径。
- 当时的 converge 在全部 artifact 成功后同步执行 Delivery；`source-current`、manual/automatic split 和独立
  DeliveryBuild controller 尚不存在。
- 当时的 Delivery identity 尚未绑定完整 `rendererRuntimeFingerprint`；跨架构或 Runtime Pack 变化后的 stale
  判定尚未成为 contract。
- Phase A package 刻意拒绝 Remotion/renderer dependency tree 和 repository data；Phase B 必须以独立、manifest-bound
  Runtime Pack 扩大 package inventory，不能 broad allowlist 整个 `node_modules` 或 checkout。

Phase B 不是把 repository npm scripts 暴露给 App。实现必须先把 application 层从 repository path shape 解耦，再由
repository CLI 和 Desktop Engine 分别在 composition root 注入一个明确 layout。单次 invocation 只能拥有一个
layout，禁止 probing、environment fallback、隐式 repo fallback 或双写。

## 3. 必须先冻结的合同

### 3.1 四个 ownership root

Phase B 明确区分：

| Root                           | authority                    | 允许内容                                                                     |
| ------------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| App Resources                  | read-only product code       | Engine bundle、Runtime Pack、managed Skill templates、brand assets           |
| Workspace Root                 | user-visible production data | Project、media、task workspaces、artifacts、attempts、source state、Delivery |
| Application Support / Keychain | App-private state            | preferences、provider config metadata、credentials/secrets                   |
| Cache / Logs                   | disposable data              | render temp、bundle cache、redacted diagnostics                              |

Workspace、App Resources、Application Support 和 Cache 必须先 canonicalize 并拒绝相互包含、symlink、special file 与
filesystem root。任何 absolute path 只属于 local adapter/runtime diagnostic，不进入 Revision、Task、Artifact、
SourceCurrent 或 DeliveryBuild identity。

### 3.2 唯一 production location port

application 层使用一个显式、immutable 的 logical location object/port，至少提供：

```text
projectSourceRoot
projectMediaRoot
taskWorkspaceRoot
artifactStoreRoot
attemptStoreRoot
sourceCurrentRoot
deliveryRoot
privateConfigPort
runtimeResources
disposableBuildRoot
```

domain 不依赖 filesystem path。repository npm CLI 可构造 repository layout adapter，Desktop Engine 只构造 Workspace
layout adapter；application function 不读取 `process.cwd()`、App path、environment 或目录形状猜 layout。两种 adapter
调用同一 application/domain contracts，不形成两条 production 主链，也不互相 fallback。

TaskSpec 内继续使用逻辑输出名 `project/...` 与 `public/...`；workspace adapter 将它们分别映射到当前 Project source
与 Project-owned media containment root。映射规则属于 fixed adapter/validator，不进入 Agent prompt，也不允许任意 mount。

### 3.3 Workspace v2 与 migration

Phase B Workspace contract clean-break 为 v2，并固定至少以下目录：

```text
<workspace>/
  projects/<storyId>/
  media/<storyId>/
  deliveries/<storyId>/
  .agents/
  .rsp/
    bin/rsp
    lib/
    workspace.json
    managed-files.json
    work/<storyId>/<taskRevision>/
    artifacts/<storyId>/<taskRevision>/
    attempts/<storyId>/<attemptId>/
    current/source/<storyId>.json
    migrations/
    session/
```

Phase A v1 Workspace reader 只服务 one-shot v1 -> v2 migration。迁移必须先检查无 active Attempt/DeliveryBuild，写入
same-parent staging，完整验证后原子切换 manifest/managed integration；失败保留旧 authority 并清理 exact owned
staging。整体改变 Workspace Root 使用相同 copy -> validate -> atomic preference switch -> old-root preserved 流程，
不能分别移动子目录或自动删除旧 root。

不自动导入 repository ignored Project，不迁移 `.producer-runs`，不扫描未知目录推断作品。需要把已有 repository
Project 转入 Workspace 时，必须另走显式、manifest-driven import，并在本计划之外取得用户对具体 Project 的授权。

### 3.4 Runtime Pack 与 compatibility identity

每个 pack 是 architecture-bound、immutable、manifest/checksum-bound 的独立 artifact，至少包含：

```text
runtimePackVersion
runtimePackId
platform / architecture
engineVersion
protocolVersion
skillVersion
workspaceSchemaVersion
exact Remotion package set
renderer browser identity
FFmpeg / FFprobe identity
Node / self-contained rsp client identity
managed runtime/resource file manifest
```

Phase B package 只能引用 App Resources 内已验证 pack。缺失、架构不符、unknown file、symlink、size/checksum drift 或
version incompatibility在启动 production 前 fail closed；不访问 npm、镜像或备用下载源。workspace-local `rsp` 必须是
architecture-native/self-contained client，或由等价的 embedded runtime 启动；不得使用 `/usr/bin/env node`、host Node、
system `PATH` 或 App checkout。具体 bundling 机制实施时必须基于当前 Node/Electron 官方文档和真实 packaged proof 决定。

`rendererRuntimeFingerprint` 至少绑定 RuntimePackId、Remotion renderer、browser、FFmpeg/FFprobe、platform、architecture
和 codec/build policy。它只进入 DeliveryBuild identity，不进入 ProductionRevision、Scene TaskRevision、TTS/Agent
Artifact identity。

### 3.5 `source-current` 与 optional Delivery

Phase B 增加 strict `SourceCurrentAttestation`。它在 materialization、Registry/Catalog/Composition refresh 和 live bytes
复验全部成功后由 fixed controller 写入 `.rsp/current/source/<storyId>.json`，至少绑定：

```text
storyId
revisionId
required ArtifactAttestation identities
materialized logical file manifest + checksums
validator policy versions
```

它不包含 attemptId、clock、PID、absolute path、execution mode、delivery policy 或 Agent identity。读取时必须从 current
inputs、artifacts 和 live bytes 重验；文件存在不等于 source-current。

Producer DAG 在 Phase B 以 source convergence 为终点，不再把 Delivery task 冒充 required source artifact。DeliveryBuild
是 `source-current` 之后的 fixed application：

- `manual`：continuation 在 source-current 成功后返回 `project-production-source-current`，不创建 Delivery staging；
- `automatic`：同一 continuation 在 source-current 后同步进入 DeliveryBuild，最终仍返回已复验的
  `project-production-complete` 或 `project-production-current`；
- 用户稍后点击“生成 Delivery”或调用 `rsp delivery build`：从 current source attestation 创建独立、互斥的
  DeliveryBuild，不新建 Agent task/attempt、不调用 provider；
- source、runtime 或 publishing input drift 使旧 Delivery 显示 stale；不得删除、覆盖或播放成 current；
- Delivery 仍 exact 是 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`。

delivery policy 按“本次提示词明确字段 > Project 设置 > App 默认 manual”解析，只控制 fixed controller 是否继续，
不进入 content identity。repository contributor entry 可显式传 `automatic` 以保持现有一命令交付体验，但 application
contract 与 Desktop 使用同一 source/delivery split。

### 3.6 public `rsp` v2 与长期 continuation

Phase B session protocol clean-break 为 `rsp-local-v2`。所有请求使用 strict discriminated schemas、Bearer token、
Workspace/project/task scope 和 fixed body limit；未知 command/version、重复 terminal、path escape 与 schema extra field
fail closed。CLI 输出 machine-readable JSON，stderr 不包含 token、absolute private path、provider body 或任意 catch-all
stack。

公共命令至少覆盖：

```text
rsp doctor
rsp context --project <storyId>
rsp project create                 # strict JSON request from stdin
rsp asset import --project <storyId> # strict compatible receipt from stdin
rsp inspect --project <storyId>
rsp prepare --project <storyId>
rsp task check --task <taskRevision>
rsp task commit --task <taskRevision> --attempt <attemptId>
rsp task fail --task <taskRevision> --attempt <attemptId> --kind <task|host>
rsp continue --project <storyId> --revision <revisionId> --attempt <attemptId>
rsp delivery build --project <storyId>
```

`context` 同时投影非秘密 Project/config/provider readiness、delivery policy 和 execution resolution；它不返回 credential、
voice bytes 或 App-private file path。create/import 使用 stdin，避免任意 input path capability。prepare 只返回本次 dirty
workspace 与 attempt-bound commands。

`rsp continue` 是 Root 的最后一个 production action：CLI 请求保持到 exact attempt terminal，Engine 获得 one-shot claim
后按 immutable event log 等待并在一小时总 deadline 内 source-converge/optional-deliver。Root 不轮询、不另读状态、不
监督 child。CLI 连接中断不取消已获 claim 的 Engine continuation，也不允许第二个 continuation 接管；诊断只能从
immutable attempt events 恢复，不能伪造成功。

## 4. 范围

### 4.1 必须实施

- explicit production location port 与 repository/Workspace composition-root adapters；
- Workspace v2、Phase A upgrade、整体 root migration/rollback、managed integration v2；
- immutable Runtime Pack builder/verifier/locator、self-contained workspace `rsp` client 与 compatibility manifest；
- Workspace-owned Project create、asset import、inspect、prepare、task check/commit/fail、continuation 和 deletion paths；
- strict SourceCurrentAttestation、source convergence、manual/automatic Delivery split 和 runtime-bound Delivery identity；
- full `rsp-local-v2` CLI/UDS server、Engine orchestration、active work lifecycle 和 redacted context；
- App Settings/Project status/Delivery controls、production-triggered Catalog refresh 和 existing secure media Player；
- provider config/private-secret ports，使 Desktop production 不读取 repository `private/`；
- updated workspace Skill、Codex-compatible/Hermes integration tests、offline/package/native E2E；
- authority docs、contracts、tests和 final evidence closeout。

### 4.2 明确不做

- 不运行 Remotion Studio UI、Studio Server 或 Settings Web service；Runtime Pack 中 Studio packages 仅作为 exact bundler
  内部依赖，不暴露 launch surface；除 DeliveryBuild 范围的 `127.0.0.1` 临时 renderer listener 外不新增 TCP listener；
- 不让 Preview Player 执行 Project TSX、未交付 bundle 或任意 filesystem URL；
- 不引入 alias、shim、dual protocol、dual write、implicit repository fallback 或 legacy production command forwarding；
- 不迁移 historical `.producer-runs`，不扫描历史 Run 规划、构建或判定 current；
- 不把 Runtime Pack、platform 或 architecture 加入 Agent/TTS/source Artifact identity；
- 不新增 Docker、daemon、数据库、远程 scheduler、remote artifact store、常驻 Agent 或自动 retry；
- 不公开发布 DMG，不修改许可证，不声称已获 Remotion redistribution permission；
- 不实现 Intel x64 native gate、signed/notarized channel、auto-update 或 public beta；这些属于 Phase C–E；
- 不自动导入、删除或覆盖用户 repository/Workspace/private data；
- 不以 UI 状态、spawn acknowledgement、prepare receipt 或 Preview 可见代替 fixed terminal evidence。

## 5. 模块与依赖方向

保持 single package 和现有 `scripts/project-production/{domain,application,adapters}` 分层：

```text
domain
  ProductionRevision / Task DAG / invalidation / SourceCurrent / Delivery identity
       ^
application
  explicit locations + ports / inspect / prepare / continuation / converge / delivery
       ^
adapters
  repository layout | Workspace layout | Runtime Pack | provider/private config | filesystem

desktop/contracts
  Workspace v2 / compatibility / rsp v2 / shell DTO
desktop/application
  Workspace migration / runtime verification / lifecycle / UI use cases
desktop/adapters
  Workspace production / UDS / Keychain-AppSupport / Runtime Pack / Preview Catalog
desktop/engine
  authenticated command routing and active-work ownership
desktop/main + preload + renderer
  lifecycle, narrow IPC, Settings, status, Delivery button, verified media playback
```

依赖规则：

- domain 不 import filesystem、Electron、Desktop、provider 或 runtime pack；
- application 只依赖 ports 和 domain，不拼 App/Workspace absolute path；
- adapters 不反向承载 identity、invalidation、source-current 或 delivery policy 业务规则；
- Electron Main 不运行 production/domain/provider；Engine 不创建 UI；Renderer 不读取 filesystem/process；
- Skill/CLI 只消费 public schemas，不复制 validators 或 production rules；
- Runtime Pack identity 由 pack builder 生成，App/Engine/Skill 不各自推断版本。

## 6. 实施顺序

每个 Task 先建立 focused regression，再完成最小 coherent change。默认在一个 executor 中串行实施；不得用共享
checkout 并发修改跨 Task contracts。每个 checkpoint 必须精确 review diff；除非用户另行要求，不创建 Git commit，
不 push。

### Task 0：冻结 Phase B contracts 与 Red gates

修改范围：

- `src/contracts/`：SourceCurrent、Delivery runtime policy；
- `desktop/contracts/`：Workspace v2、compatibility/Runtime Pack、rsp v2、shell state；
- focused contract tests 与 active old-authority grep。

验收：

- Phase B doctor status 精确为 workspace/embedded/true capabilities/false distribution；
- Phase A runtime fields 不进入 v2 schema；v1 只在 migration input schema 可解析；
- delivery policy、attempt、clock、path、architecture 不污染 source identity；
- rendererRuntimeFingerprint 只影响 DeliveryBuild；
- SourceCurrentAttestation canonical serialization、unknown field、identity drift 与 stale validation有 Red/Green coverage。

### Task 1：引入 explicit production locations

修改范围：

- project、catalog/registry、narration、production、delivery、settings 与 deletion 的 path ports/adapters；
- repository CLI composition root；
- path containment与 zero-Project regression tests。

验收：

- application functions 不再从一个模糊 `rootDir` 推断所有 ownership roots；
- repository npm commands 使用显式 repository adapter并保持 current tests Green；
- Workspace adapter fixture 能把 Project/media/work/artifact/attempt/delivery 写入固定目标；
- logical `project/` / `public/` task outputs 在两个 adapter 下映射一致且 identity 不含 absolute path；
- active grep 不存在 Desktop runtime 的 repository path probing、`process.cwd()` fallback 或双写。

### Task 2：clean-break `source-current` 与 DeliveryBuild

修改范围：

- Producer DAG/downstream task construction；
- converge/materialization application；
- new source-current store/validator；
- DeliveryBuild application、publish contract、settings/status projection；
- E2E/invalidation/delivery tests。

验收：

- all-success source tasks只 materialize/validate/write source-current；
- manual 不创建 Delivery staging、render process 或 publish file；
- automatic 从同一 source terminal继续 exact four-file build；
- explicit later delivery不创建 provider call、Agent task、workspace 或 ExecutionAttempt；
- source drift、runtime drift、publishing drift、invalid receipt、incomplete four files 和 stale revision均 fail closed；
- current repository automatic path仍以真实 four-file terminal结束，但通过同一 split application实现。

### Task 3：Workspace v2 与整体迁移/rollback

修改范围：

- Workspace/migration contracts；
- initialize/repair/migrate application；
- preferences、filesystem、managed integration adapters；
- Settings migration state；
- migration matrix tests。

验收至少覆盖：v1 empty/future directories -> v2、same-version no-op、unknown files preserved、managed drift、partial
staging、copy failure、checksum drift、symlink/path escape、special file、insufficient space、active work blocker、App
restart recovery、atomic preference switch、old-root preservation 和 rollback。任何 failure 不产生第二 active authority。

### Task 4：构建并验证 immutable Runtime Pack

修改范围：

- Runtime Pack manifest/builder/verifier/locator；
- package/Forge inventory 与 exact dependency collection；
- self-contained `rsp` client build；
- runtime browser/FFmpeg/Node identity probes；
- focused corruption/architecture/offline tests。

新增稳定 scripts，名称实现时固定并写入文档，例如：

```text
desktop:runtime:build
desktop:runtime:check
desktop:runtime:inventory
```

验收：fresh pack build可重复，exact file manifest/size/checksum Green；unknown/symlink/arch/version drift拒绝；App断网且
PATH 中无 Node/npm/Git 时 doctor Green；package 只包含 bundler/renderer 所需、manifest-bound 的 exact Studio/Studio
Shared 内部依赖，不包含 Remotion CLI、Studio Server、Studio UI/launch surface、repository Project/private/delivery、
broad `node_modules` 或未登记 executable。RuntimePackId变化只精确失效 Delivery。

### Task 5：Workspace-owned Project、media 与 private config

修改范围：

- Project create/delete、Catalog/Registry、asset import、narration/provider config 的 Workspace adapters；
- App Support/Keychain-backed private config ports；
- Runtime Pack shared capability/resource projection；
- zero/multi-Project与 deletion tests。

验收：create保持零 provider/零 media generation/零 attempt；selected template/resources从 verified Runtime Pack复制为
Project-owned bytes；asset import只接受 compatible receipt；credentials/private voice不进入 Workspace、context、logs、
artifact、delivery 或 Git；delete只清理 exact storyId-owned Workspace data并保护 other Project、private config与共享 pack。

### Task 6：实现完整 `rsp-local-v2`

修改范围：

- `desktop/contracts/protocol.ts`；
- `desktop/adapters/rsp-socket.ts`；
- `desktop/rsp/` client/CLI；
- Engine command router与application ports；
- protocol/auth/concurrency/redaction/integration tests。

验收覆盖全部 public commands、stdin create/import、unknown command/version、wrong token、stale session、body limit、
request scope、task/attempt mismatch、concurrent read-only commands、mutating lock、long continuation、disconnect、duplicate
claim、terminal conflict和fixed exit codes。CLI不得调用npm script、读checkout或在App不可用时fallback。

### Task 7：Engine active-work orchestration 与自动 Catalog refresh

修改范围：

- Engine ports/messages/lifecycle；
- production/delivery controller；
- Preview Catalog Workspace adapter；
- close/quit/crash recovery；
- process/claim/staging cleanup tests。

验收：Engine只编排fixed application和provider ports，不调度Agent；active Attempt/DeliveryBuild时窗口关闭继续运行，
显式Quit需确认；source-current后UI状态刷新但无可播放视频，delivery-current后自动刷新media allowlist并选择目标；
render crash不终止Main或污染current Delivery；restart只从immutable events/artifacts/current delivery恢复。

### Task 8：Settings、Project状态与Delivery控制

修改范围：

- narrow Main/preload IPC；
- bundled renderer Settings/Project/status/diagnostics UI；
- delivery button、Workspace migration和integration lifecycle use cases；
- renderer/security/accessibility tests。

验收：UI显示唯一Workspace、Runtime/Agent/provider health、structured invalidation和active work；manual source-current明确
显示“尚无可播放成片”，Delivery按钮只对current source启用；delivery-current才交给Player；Renderer无Node/filesystem/
credential/path capability，navigation/download/popup/permission policy保持Green。

### Task 9：managed Skill 与真实 Agent surface

修改范围：

- Workspace `AGENTS.md`、host adapters、production Skill、managed-files ledger；
- Codex-compatible与Hermes discovery/invocation smoke；
- execution/delivery policy context projection。

验收：Skill按create -> optional asset slot -> context/inspect -> prepare -> exact task ownership -> continue顺序运行；只使用
`rsp`，不提repository npm fallback；inline默认和bounded subagents规则保持current authority；managed update只在无active
work时原子进行，用户修改fail closed；Hermes不可用时只记录specific pending，不伪造支持。

### Task 10：package、offline与安全 hardening

修改范围：

- Forge/package pipeline、Runtime Pack placement、CSP/protocol/IPC policies；
- package inventory/SBOM inputs；
- no-host-tools/UDS-only-control/loopback-scoped-render/offline/security tests。

验收：installed App与Workspace分离；fresh user无Node/npm/Git、断网可启动/doctor/使用pack；App-owned runtime没有常驻
TCP listener，DeliveryBuild 临时 listener 精确绑定 `127.0.0.1` 且终态归零；UDS token不进argv/env/renderer/log；Runtime Pack和media custom protocol只接受allowlist；App/Workspace/
Cache/Application Support containment与permissions Green。Phase B只生成internal unsigned `.app` evidence，不生成或发布DMG。

### Task 11：full E2E 与 Apple Silicon native gate

新增独立临时 Workspace fixture和manual-only native workflow。测试必须通过public `rsp` surface创建真实Project并使用
test-only deterministic provider adapter生成真实PCM，再由exact Runtime Pack运行真实Remotion/FFmpeg；test adapter不得
进入production package或成为provider fallback。

至少覆盖：

1. fresh Workspace v2、managed Skill、自包含 `rsp doctor`；
2. manual create/inspect/prepare/task commit/continue到source-current且deliveries为空；
3. 用户触发Delivery，真实生成/复验四文件，Catalog自动刷新，播放/音频/seek/timeline Green；
4. automatic production直接到current four-file Delivery；
5. artifact reuse和changed-input解释不因App path/architecture/unrelated Project变化；
6. runtime fingerprint变化只使Delivery stale，不重跑TTS/Agent source tasks；
7. App/Engine/render crash、reopen、active-work close/quit、continuation deadline和staging cleanup；
8. Workspace v1 upgrade、整体root migration失败rollback与成功atomic switch；
9. wrong token/protocol、path escape、symlink、unknown file、media ticket drift、UDS-only control plane与loopback listener cleanup；
10. package inventory不含fixture、private data、repository checkout或unmanaged runtime。

### Task 12：authority closeout

只有 Tasks 0–11 与 required native evidence完成后才：

- 更新 `ITERATION_STATUS.md` 为真实Phase B状态和exact evidence；
- 更新 `ROADMAP.md` 将下一入口推进到Phase C；
- 同步 `FINAL_PRODUCT_GOAL.md`、`ARCHITECTURE.md`、`PRODUCTION_WORKFLOW.md`、
  `DETERMINISTIC_EXECUTION.md`、`TERMINOLOGY.md`、Desktop/Agent/Settings guides；
- active grep删除Phase A runtime authority、host-node、repository-preview和sync-only Delivery旧表述；
- 将本计划移入 `docs/archive/implementation-plans/`并登记commit/evidence。

没有Apple Silicon production E2E时不得归档本计划或推进Roadmap，只能记录
`implementation-complete-native-evidence-pending`。

## 7. 验证矩阵

### 7.1 每 Task focused checks

按实际测试文件精确执行，至少包括：

```bash
node --import tsx --test tests/desktop/*.test.ts
npm run desktop:build
npm run typecheck
npm run lint
npm run docs:check-links
git diff --check
```

涉及production contracts/application/adapters时，追加对应 `tests/project-production/`、`tests/projects/`、
`tests/narration/`、`tests/settings/`与deletion matrix。新script落地前不能把计划名称当作current command。

### 7.2 repository regression

```bash
npm test
npm run check:static
npm run compositions
npm run check
```

首次直接使用宿主浏览器权限。任何provider、browser或native pack条件不可用时必须列出exact未验证项，不能降低sandbox、
跳过validator或以mock unit test冒充host/native Green。

### 7.3 clean-break grep

最终至少确认active runtime/docs不存在：

- Desktop `repositoryMode`、`build-time-checkout`、`host-node-prototype`；
- Desktop Engine `process.cwd()`/repository fallback或npm script spawn；
- Phase B `studio-current`、Remotion Studio/Settings server lifecycle；
- converge内无条件同步Delivery；
- runtime v1/v2 dual response、legacy alias/shim；
- App package broad `node_modules`、Project/private/delivery fixture；
- Preview执行Project TSX或接受arbitrary file URL。

archive/evidence与repository contributor guide可保留明确标注的历史/开发上下文，不能被active grep误作runtime authority。

## 8. 完成证据

最终交付必须给出：

- 每个Task的focused checks与完整diff review；
- full repository/desktop/package/native gate结果；
- Runtime Pack manifest、RuntimePackId、architecture、exact dependency/browser/FFmpeg/Node identities和checksum；
- Workspace v2/migration/rollback、`rsp doctor`和full command surface的脱敏输出；
- manual source-current无Delivery、explicit Delivery和automatic Delivery的真实terminal/四文件证据；
- packaged App播放、Catalog refresh、timeline、active-work lifecycle、crash recovery、loopback listener scope和cleanup证据；
- package inventory/SBOM input与credential/private/fixture exclusion；
- final `git status`、精确staging/commit列表（如用户授权commit）和无push证明。

prepare response、source-current receipt、render进度、Player可见、CLI spawn acknowledgement或Agent自评都不能单独证明
Phase B完成。

## 9. 停止条件

遇到以下任一情况，停止当前implementation attempt，保存脱敏incident并把修复作为独立engineering task：

- App production必须依赖源码checkout、host Node/npm/Git、Remotion Studio/Studio Server，或 DeliveryBuild 以外、非
  `127.0.0.1`、非 OS-ephemeral 的 App-owned TCP listener；
- 需要兼容shim、双写、目录扫描或repository fallback才能维持运行；
- Workspace migration必须覆盖unknown/user-modified文件、删除旧root或在active work中切换authority；
- source-current无法在不绑定attempt/clock/path的情况下复验；
- manual/automatic policy会改变Revision/Task/Artifact identity；
- RuntimePackId无法精确绑定renderer/browser/FFmpeg/architecture，或架构变化会重跑无关TTS/Agent tasks；
- `rsp continue`需要Root轮询、监督child或重复claim；
- Preview必须执行Project TSX或加载arbitrary filesystem path；
- provider/host/native failure只能靠fallback、自动retry、降低validator/sandbox解决；
- 需要公开runtime、DMG、许可证变更、签名/notarization或Intel支持才能完成Phase B内部验收；
- 用户未提交修改、private config、Project或Delivery无法隔离保护。

## 10. 实施时必须复核的 primary references

- [Electron `utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron `protocol`](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html)
- [Remotion renderer `renderMedia()`](https://www.remotion.dev/docs/renderer/render-media)
- [Remotion browser management](https://www.remotion.dev/docs/renderer/ensure-browser)
- [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- [Remotion FFmpeg license](https://www.remotion.dev/docs/miscellaneous/ffmpeg-license)

实施者必须按lockfile/Runtime Pack目标重新打开当前官方文档并验证API；本计划不授权从历史知识猜Electron、Node、
Remotion或packaging行为。
