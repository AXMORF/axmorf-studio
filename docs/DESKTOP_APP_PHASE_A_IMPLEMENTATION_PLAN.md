# AXMORF Studio Desktop App Phase A 实施计划

> 文档类型：active implementation plan
>
> 计划基线：`111191a`（执行时还必须包含承载本计划的提交）
>
> 状态：已批准，待实施
>
> 最后复核：2026-08-22

本计划把 [Desktop App 产品边界](DESKTOP_APP_PRODUCT.md) 与
[macOS 维护和发行目标](DESKTOP_APP_MACOS_MAINTENANCE.md) 的 Phase A 收敛为可直接实施、验证和提交的工作包。
Phase A 完成后，本文件移入 `docs/archive/`；当前能力仍只由
[ITERATION_STATUS.md](ITERATION_STATUS.md) 声明。

## 1. 目标与成功边界

Phase A 交付一个仅供开发验证的 macOS `AXMORF Studio.app` 原型，证明以下闭环可以真实运行：

```text
Electron Main
  -> Engine utility process
    -> current repository Settings + Remotion Studio services
  -> trusted Settings view + sandboxed Studio view
  -> initialized Workspace
  -> authenticated workspace-local rsp doctor
  -> Agent discovery and invocation smoke
```

它是 **repository adapter 原型**，不是可公开分发的最终 App。所有产品状态输出必须如实声明：

- `adapterMode: "repository"`；
- `productionAvailable: false`；
- `deliveryAvailable: false`；
- `distributionReady: false`。

只有下列证据同时存在才可把 Phase A 标为完成：

1. Electron Main、Engine、Workspace、`rsp doctor`、trusted Settings view 与 sandboxed Studio view 的 automated
   checks Green；
2. repository Settings 和 Studio 可由 Engine 管理并在 App 中加载；
3. workspace-local Agent integration 文件可校验且 `rsp doctor` 可从模拟 Agent 环境调用；
4. 进程关闭无残留服务，导航不能越出允许 origin；
5. 至少一台 Apple Silicon Mac 完成 native smoke；若实施环境不是 macOS，只能记录
   `implementation-complete-native-evidence-pending`，不得宣称 Phase A 完成。

## 2. 当前代码事实

- `npm run dev` 当前并行启动 Settings Vite 服务（默认 `3100`）和 Remotion Studio（默认 `3101`）。
- Settings API 仍以 repository root 为数据根；现有 Project、media、artifacts、attempts 和 deliveries 仍是
  repository-local ignored 数据。
- 当前生产主链仍在 converge 内同步生成 exact four-file delivery。
- 仓库尚无 Electron、Forge、Desktop Main/Engine、Workspace manifest 或 public `rsp` CLI。
- current repository 使用 npm 和 `package-lock.json`，Remotion 与 `@remotion/*` 是完全一致的精确版本。

因此 Phase A 不迁移生产 authority，也不把 Workspace 假装成已经可生产的数据根。Phase B 才 clean-break 完成
Workspace production migration、独立 `studio-current`、optional Delivery 与完整 Runtime Pack。

## 3. 范围

### 3.1 必须实施

- 引入精确锁定的 Electron 与 Electron Forge Vite toolchain；
- 建立 Main、Engine、preload、trusted shell renderer 和 shared protocol；
- Main 使用 `utilityProcess.fork()` 启动 Engine，由 Engine 管理 current repository Settings/Studio；
- 使用 trusted App UI 呈现 current Settings，并以 sandboxed `WebContentsView` 呈现 Studio；
- 首次启动先显示单一 Workspace Root 选择，默认 `~/Movies/AXMORF Studio/`，允许初始化前改选；
- 初始化一个严格、可重复、不可越界的 Workspace 目录结构；
- 建立 session-bound Unix-domain socket 和 workspace-local `rsp doctor`；
- 安装 checksum-bound 的 AGENTS/Skill/host discovery adapters 与 Hermes 提示入口；
- 实现单实例、启动、关闭、异常退出和子进程清理策略；
- 增加 focused tests、build/package checks、Agent smoke 与 macOS manual smoke guide；
- 对齐 README、状态、路线、架构和 Agent compatibility 文档。

### 3.2 明确不做

- 不迁移或复制 current Project、media、narration、artifact、attempt、delivery 数据；
- 不修改 ProductionRevision、TaskRevision、ArtifactAttestation、converge 或 current Delivery 合同；
- 不提前实现 `studio-current` / manual-or-automatic Delivery split；
- 不声称已内置完整 offline Runtime Pack；Phase A launcher 可使用创建 App 的 host Node，但 doctor 必须暴露该限制；
- 不打 DMG、不签名、不公测、不上传 release、不实现 auto-update；
- 不修改许可证，不宣称取得 Remotion runtime redistribution 许可；
- 不新增 Docker、daemon、数据库、远程 scheduler、动态端口发现或常驻 Agent；
- 不重构无关生产模块，不用兼容 shim 或双 authority 掩盖尚未迁移的边界。

## 4. 依赖与构建策略

在实施开始时再次查询 npm registry 与项目现有 lockfile；若下列版本仍可解析，则精确锁定：

- `electron@43.4.1`；
- `@electron-forge/cli@7.11.2`；
- `@electron-forge/plugin-vite@7.11.2`。

Phase A 不安装 maker。Forge Vite plugin 当前仍标记为 experimental，因此必须：

- 精确 pin，不用 caret/tilde；
- Main、preload、Engine 与 shell renderer 使用显式 entry/config；
- 为 entry discovery、webPreferences 和 package policy 增加纯测试；
- 提交 `package-lock.json`，不顺带升级现有依赖；
- 若当前版本与 Electron/Node 实际不兼容，停止并记录具体错误，不临时替换架构。

新增 npm scripts：

```text
desktop:start
desktop:build
desktop:package
desktop:check
```

`desktop:package` 只生成本机架构的未签名 `.app` 开发证据，不生成 DMG，也不构成发行支持声明。

## 5. 目标模块和文件所有权

保持 single package，不改为 monorepo。新增目录按 domain/application/adapters 边界组织：

```text
desktop/
  contracts/protocol.ts
  application/initialize-workspace.ts
  application/resolve-workspace-selection.ts
  application/close-policy.ts
  adapters/app-preferences.ts
  adapters/workspace-filesystem.ts
  adapters/repository-services.ts
  adapters/rsp-socket.ts
  engine/entry.ts
  main/entry.ts
  main/create-window.ts
  main/navigation-policy.ts
  preload/shell.ts
  renderer/index.html
  renderer/main.tsx
  renderer/App.tsx
  renderer/styles.css
  rsp/cli.ts
  resources/brand/
  resources/workspace-integration/
    AGENTS.md
    CLAUDE.md
    GEMINI.md
    skills/remotion-story-producer-video/SKILL.md
    hermes/INSTALL_PROMPT.md
forge.config.ts
vite.desktop.main.config.ts
vite.desktop.preload.config.ts
vite.desktop.renderer.config.ts
vite.desktop.engine.config.ts
tests/desktop/
```

Main 只拥有窗口、导航、session bootstrap 和 Engine lifecycle；Engine 拥有 Workspace 初始化、repository service
supervision 和 `rsp` server；trusted App renderer 承载 current Settings 与可视 shell，不读取 filesystem 或启动进程；
Studio view 作为低信任内容且没有 App preload。现有 Settings API 不复制到 Desktop 模块，Phase A 通过 repository
adapter 复用它。

## 6. 必须先冻结的合同

### 6.1 Workspace manifest

`<workspace>/.rsp/workspace.json` 使用 strict schema，至少包含：

```json
{
  "schemaVersion": 1,
  "contractVersion": "desktop-workspace-v1",
  "productId": "com.axmorf.studio",
  "workspaceId": "uuid",
  "layoutVersion": 1,
  "integrationVersion": 1,
  "createdBy": "AXMORF Studio"
}
```

默认 Workspace 为 `~/Movies/AXMORF Studio/`。初始化器必须：

- 先 canonicalize parent，再验证目标包含关系；拒绝 filesystem root、home 本身、repository root 和 App bundle；
- 不跟随 target 内已有 symlink，不允许任何 managed path 逃逸；
- 只创建固定目录，不扫描或导入其他目录；
- 使用 staging + atomic rename 写 manifest 和 managed files；
- 相同 manifest/files checksum 是只读 no-op；
- unknown file 保留，managed file drift 则 fail closed，不覆盖用户修改；
- partial initialization 可按 manifest 和 managed-files ledger 精确恢复，不 broad delete。

首次启动在写入前显示默认 root，并允许通过 native directory picker 改选一次。App 只保存一个 Workspace Root，
不提供 Project/Media/Delivery 子目录覆盖。选择记录原子写入
`~/Library/Application Support/com.axmorf.studio/preferences.json`，只含非秘密 App preference 并使用 owner-only
permissions。Phase A 初始化后只允许显示和在 Finder 中打开该 root；整体迁移/rollback 属于 Phase B，用户尝试切换
时必须得到明确的 unavailable 状态，不能建立第二个 active authority。

固定用户目录：

```text
projects/
media/
deliveries/
.agents/
.rsp/bin/
.rsp/lib/
.rsp/work/
.rsp/artifacts/
.rsp/attempts/
.rsp/session/
```

Phase A 中 `projects/`、`media/`、`deliveries/` 只是未来合同目录；repository production 不得读写它们。

### 6.2 Managed Agent integration

`<workspace>/.rsp/managed-files.json` 记录 integration version、相对路径、mode 和 SHA-256。安装范围只包括：

- Workspace root 的 `AGENTS.md`；
- `.agents/skills/remotion-story-producer-video/SKILL.md`；
- discovery-only `CLAUDE.md` / `GEMINI.md` adapters；
- Hermes 的显式安装提示，不假定存在可自动修改的全局 Hermes 目录；
- `.rsp/bin/rsp` launcher 与其编译后的 client module。

不安装到用户 Agent 的全局配置，不覆盖非 managed 文件。Phase A Skill 只允许 discovery、doctor 和说明
`productionAvailable: false`；不得暴露假的 prepare/task/commit 命令。

Phase A 可让 `.rsp/bin/rsp` 使用创建该 App 的 host Node 启动 Workspace 内已复制且 checksum-bound 的 JavaScript
client。launcher 必须是 regular file、POSIX executable、路径固定且不接受可执行代码注入。`rsp doctor` 必须返回
`runtimePackMode: "host-node-prototype"`；Phase B 再替换为随 App 分发的 exact runtime。

### 6.3 Session 与认证

Main 创建 session，Engine 托管 socket。session record 位于 `.rsp/session/`，权限最小化，至少包含：

```json
{
  "schemaVersion": 1,
  "protocolVersion": "rsp-local-v1",
  "workspaceId": "uuid",
  "socketPath": "workspace-contained absolute path",
  "appPid": 0,
  "enginePid": 0,
  "expiresAt": "ISO-8601"
}
```

token 使用至少 32 bytes CSPRNG，独立文件保存并设置 owner-only permissions。token 不进入 argv、environment、URL、
日志、renderer 或 crash message；Main 通过 MessagePort 交给 Engine。socket 必须位于 Workspace `.rsp/session/` 内，
启动前只删除经过 ownership/session 校验的 stale socket。

Phase A 只实现：

```text
GET /v1/doctor
Authorization: Bearer <session token>
```

成功响应至少包含 `workspaceId`、`protocolVersion`、`adapterMode`、`runtimePackMode`、Settings/Studio readiness、
四个 capability booleans 和 process/session diagnostics。CLI 失败码固定：

| 情况                    | stderr code                 | exit |
| ----------------------- | --------------------------- | ---- |
| App/session 不可用      | `rsp-app-unavailable`       | 1    |
| protocol 不兼容         | `rsp-protocol-incompatible` | 2    |
| Workspace contract 无效 | `rsp-workspace-invalid`     | 3    |
| token/权限无效          | `rsp-unauthorized`          | 4    |

### 6.4 Main 与 Engine protocol

共享 discriminated union，禁止任意字符串命令：

```text
main -> engine: initialize, start-services, stop-services, shutdown
engine -> main: initialized, service-state, doctor-state, fatal, stopped
```

每条消息带 `protocolVersion` 和 request ID；unknown version/type fail closed。Engine 崩溃时 Main 显示受控错误页，
不把服务直接迁回 Main，也不自动无限重启。

## 7. Service、UI 与 lifecycle 设计

### 7.1 Repository service supervisor

把 `scripts/dev/cli.ts` 中可复用的 service lifecycle 抽到 repository adapter，不改变 `npm run dev` 的现有行为：

- Settings 固定绑定 loopback `127.0.0.1:3100`；
- Remotion Studio 固定绑定 loopback `127.0.0.1:3101` 且 `--no-open`；
- 端口占用直接返回结构化 fatal，不静默改端口；
- readiness check 只读且有 timeout；
- 任一 child 异常退出时终止 sibling 并上报；
- SIGINT/SIGTERM/App close 都等待受控清理，测试证明无 orphan。

`RSP_DEV_LAN` 仍只服务现有显式开发命令；Desktop Engine 不开启 LAN。

### 7.2 Trusted Settings/App UI 与 sandboxed Studio

Main 创建 trusted App UI，并复用 current Settings React/API surface；App preload 只暴露 `getAppState()`、
`chooseInitialWorkspace()`、`showWorkspaceInFinder()`、`showStudio()`、`showSettings()`、`retryEngine()` 六个窄方法。
Workspace 选择只在未初始化状态可用，参数和 sender 都由 Main 校验。App UI 仍不得直接访问
Node/filesystem/process。Studio 使用单独的低信任 `WebContentsView`，没有 App preload，并使用：

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

trusted Settings/App UI 与 Studio 分别使用精确 origin/sender allowlist；Studio IPC 一律拒绝。`window.open`、下载、
permission request、跨 origin navigation 和非允许 protocol 默认拒绝；允许的外部帮助链接只能交给系统浏览器。
默认显示 Studio；Settings 的“打开 Studio”动作由 shell 拦截并切换视图，不打开第二个不受控窗口。

### 7.3 Lifecycle

- `requestSingleInstanceLock()` 保证一个 App 实例；第二次启动只聚焦现有窗口；
- App ready 后才创建 `utilityProcess` 和 `WebContentsView`；
- 关闭窗口时，如果 Engine 报告 active work，执行纯 close-policy prompt；Phase A 永远报告 `activeWork: false`，但
  protocol 和测试先冻结；
- `before-quit` 先停止 services/server，再删除 exact owned session files；
- force/crash recovery 只清理能由 workspaceId/session ownership 证明的 stale state；
- 不保存 Agent token、聊天、child identity 或 production history。

## 8. 实施顺序与本地提交

每个任务先 focused Green，再创建小提交。后续任务不得修改前一任务已冻结的 public contract，除非 regression test
先证明原合同错误。

### Task 0：toolchain 与可构建骨架

修改范围：

- `package.json`、`package-lock.json`；
- `forge.config.ts`；
- `vite.desktop.*.config.ts`；
- `scripts/tests/project-tests.ts`；
- Desktop package/security policy tests。

验收：

- exact dependency pins 和 lockfile 可重复安装；
- Main/preload/Engine/renderer entries 可独立 build；
- `tests/desktop/` 纳入 `npm test`；
- product name/bundle ID 固定为 `AXMORF Studio` / `com.axmorf.studio`；App icon 由
  `src/remotion/runtime/axmorf-brand/AxmorfMark.tsx` 的 `AXMORF_MARK_PATHS` 单一几何 source 生成 SVG、PNG、ICNS，
  不手抄第二份路径；
- package config 不包含 maker、signing、notarization 或 auto-update。

建议提交：`build(desktop): add pinned Phase A toolchain`

### Task 1：Workspace 与 managed integration

修改范围：

- `desktop/contracts/` 中 Workspace/integration contracts；
- `desktop/application/initialize-workspace.ts`；
- `desktop/adapters/workspace-filesystem.ts`；
- `desktop/resources/workspace-integration/`；
- `tests/desktop/workspace-*.test.ts`。

验收至少覆盖：default/custom initial selection、preference atomicity、second-authority rejection、fresh initialize、
same-input no-op、partial recovery、managed drift、unknown file preservation、symlink、path escape、forbidden root、
permissions、atomic failure cleanup 和 checksum verification。

建议提交：`feat(desktop): initialize managed Phase A workspace`

### Task 2：authenticated local `rsp doctor`

修改范围：

- `desktop/contracts/protocol.ts`；
- `desktop/adapters/rsp-socket.ts`；
- `desktop/rsp/cli.ts`；
- rsp build config 与 focused tests。

验收至少覆盖：online doctor、App offline、wrong token、wrong protocol、stale session、socket path escape、token redaction、
fixed exit codes 和 concurrent read-only calls。

建议提交：`feat(desktop): add authenticated workspace rsp doctor`

### Task 3：Engine 与 repository services

修改范围：

- 从 `scripts/dev/cli.ts` 提取的 reusable supervisor；
- `desktop/adapters/repository-services.ts`；
- `desktop/engine/entry.ts`；
- Engine/protocol/process lifecycle tests。

验收：现有 `npm run dev` 行为不变；Engine 可启动并探测两个固定服务；端口占用、child crash、readiness timeout 和
shutdown 都有 deterministic result；测试结束没有 orphan process。

建议提交：`feat(desktop): supervise repository services in engine process`

### Task 4：secure AXMORF Studio shell

修改范围：

- `desktop/main/`；
- `desktop/preload/`；
- `desktop/renderer/`；
- current `settings/client/` 的 Desktop-only Workspace/doctor projection；
- navigation/security/close-policy tests。

验收：Main 只在 app ready 后创建 Engine/views；首次启动先确认唯一 Workspace；trusted App preload surface 精确，
Studio 无 App preload；默认 Studio；current Settings/Studio 可切换；Settings 只显示一个 Workspace Root 和
repository/host-node/四个 false capability 状态；所有非允许导航、popup、permission、download 均拒绝；单实例和关闭
顺序通过测试。

建议提交：`feat(desktop): add secure AXMORF Studio shell`

### Task 5：integration smoke 与 native guide

新增：

- `scripts/desktop/integration-smoke.ts`；
- 模拟 Agent 从 Workspace discovery 读取 Skill 并调用 `.rsp/bin/rsp doctor` 的测试；
- `docs/guides/DESKTOP_PHASE_A_SMOKE.md`。

smoke 必须验证真实 Workspace 文件、真实 Engine socket 和真实 CLI 输出，不能仅 mock function。Hermes 若无稳定 CLI，
保留人工步骤和原始输出字段；不得伪造 automated Hermes evidence。

建议提交：`test(desktop): prove Phase A Agent integration surface`

### Task 6：文档 closeout

只有实现和证据完成后才：

- 更新 `README.md` 快速开始；
- 更新 `docs/ARCHITECTURE.md` 和 `docs/guides/AGENT_COMPATIBILITY.md`；
- 在 `docs/ITERATION_STATUS.md` 写入已验证事实；
- 在 `docs/ROADMAP.md` 将下一入口推进到 Phase B；
- 将本计划移入 `docs/archive/` 并在 archive README 记录完成提交与证据位置。

如果 native macOS smoke 尚未完成，状态必须保留 `implementation-complete-native-evidence-pending`，计划仍保持 active。

建议提交：`docs: record verified Desktop Phase A status`

## 9. 子 Agent 使用边界

实施可以使用 bounded 子 Agent，但 Root 保持合同、集成、lockfile、最终验证与提交 authority。建议最多并行三个互不
重叠的实现 lane：

| lane            | 独占范围                                                             |
| --------------- | -------------------------------------------------------------------- |
| Workspace / rsp | `desktop/application`、workspace/rsp adapters、resources、对应 tests |
| Engine          | repository supervisor、`desktop/engine`、process lifecycle tests     |
| Shell           | `desktop/main`、`preload`、`renderer`、scoped Settings UI、UI tests  |

另可使用一个只读 QA Agent 审查 contract、安全边界、测试缺口和完整 diff。Root 独占 `package*.json`、Forge/Vite config、
test discovery、跨 lane protocol、integration smoke、authority docs 和 Git staging/commit。

每个子 Agent 提示必须说明：它不是唯一在工作区操作的 Agent，不得 reset/revert/覆盖其他人的修改；只修改分配路径；
发现跨 lane 合同问题先报告 Root，不自行扩张范围。并发实现只在 Task 0 和共享 contracts 冻结后开始。

## 10. 验证矩阵

### 10.1 每任务 focused checks

测试文件落地后使用真实文件列表，不依赖 shell glob 静默空匹配：

```bash
node --import tsx --test tests/desktop/*.test.ts tests/config/dev-lan.test.ts tests/config/dev-services.test.ts
npm run config:build
npm run typecheck
npm run lint
npm run docs:check-links
git diff --check
```

Task 0 创建并验证 `desktop:build` package script 后，Task 0 及所有后续 task 的 focused checks 还必须执行该 script；
在 script 尚不存在的计划基线中不把它写成 current operational command。

### 10.2 repository regression

```bash
npm test
npm run check:static
```

若改动触及 Remotion bundle、Composition 或现有 production runtime，再补：

```bash
npm run compositions
npm run check
```

不能把 Chromium sandbox、宿主 browser 或 provider 不可用误报成代码 Green；无法运行的 host check 明确列为未验证。

### 10.3 macOS native smoke

在 Apple Silicon Mac 的干净用户环境执行并保存命令、版本、架构与时间：

1. `npm ci` 后 build/package 本机未签名 `.app`；
2. 首次启动确认默认 Workspace，并另测初始化前改选；验证唯一 root、目录、manifest、modes 和 checksums；
3. App 默认打开 Studio，切换 trusted Settings 后再回 Studio；
4. Settings 配置仍由 current repository API 读取，App UI 无直接 Node API，Studio 无 App preload；
5. Workspace 内执行 `.rsp/bin/rsp doctor`，验证 repository/host-node/四个 false capability 状态；
6. 错 token、删 session、App 未运行分别返回固定 failure code；
7. 尝试 popup、外部 origin、download 和 permission 均被 policy 拒绝；
8. 关闭、重开和第二实例聚焦正确；退出后 3100/3101、socket 和 child process 均清理；
9. 运行 Agent discovery smoke；Hermes 可用时按 guide 完成人工 smoke 并保存原始输出。

Phase A 不要求 Intel x64、offline Runtime Pack 或 DMG；这些证据属于后续 Phase B/C/D，不能用 Rosetta 或 cross-build
替代真实支持声明。

## 11. 完成证据

最终交付必须给出：

- 完整提交列表与每个 task 的 focused checks；
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run docs:check-links`、`npm run check:static` 结果；
- packaged `.app` 的架构、路径和 SHA-256（仅作为开发 evidence，不提交 binary）；
- native smoke 环境和逐项结果，或明确的 native evidence pending；
- `rsp doctor` 成功、失败和 token redaction 的脱敏输出；
- process cleanup、navigation/security 和 Agent discovery evidence；
- `git status` 与完整 diff review，证明没有 production contract、private config、Project 或 delivery 被污染。

不得以 Electron 窗口能打开、Forge package 成功、prepare 成功或 Agent 自评代替上述完成证据。

## 12. 停止条件

遇到下列任一情况，停止当前 implementation attempt，保留诊断并单独处理工程缺陷：

- 必须修改 current production/delivery authority 才能让 Phase A 运行；
- Workspace 初始化需要覆盖未知文件、跟随 symlink 或越出 root；
- token 只能经 argv/env/renderer/URL 传递；
- repository Settings/Studio 无法在 loopback 与 sandbox policy 下工作；
- Forge/Electron pin 不兼容且需要未经计划的框架替换；
- 需要购买证书、签名、notarization、公开 runtime redistribution 或上传发行物；
- 用户工作区出现无法隔离的无关修改。

## 13. 实施时使用的 primary references

- [Electron `WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron `utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [Remotion Studio CLI](https://www.remotion.dev/docs/studio/cli)

实施者必须以 lockfile 和这些当前官方文档复核 API，不从本计划猜测可能变化的 framework 行为。
