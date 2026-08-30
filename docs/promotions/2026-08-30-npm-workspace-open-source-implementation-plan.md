# npm Workspace 开源方案实施计划

> 文档类型：已批准方向的实施计划，不是 current implementation authority
>
> 状态：本地 vertical slice 已实施；公开发布 gates 待完成
>
> 日期：2026-08-30
>
> 基线：`foundation@e52d2a5`
>
> 实施分支：`axmorf/npm-workspace-open-source`

## 1. 结论

本次从 Foundation 的 repository-native npm 主链出发，不从 Desktop 分支做删除式改造。目标是把当前仓库整理为
一个开源 npm monorepo，并发布两个职责明确的包：

```text
@axmorf/studio  # contracts、生产控制器、Remotion runtime、CLI、Web、RuntimeResources
create-axmorf-studio  # 原子创建独立用户 Workspace，并生成 Workspace-local Skill/config
```

最终用户目录既是 Project Workspace，也是全部用户数据 authority。用户安装 Node.js/npm 后，通过脚手架创建目录，
再由项目本地 npm scripts 调用 package `bin`；CLI 内部用 Node 解析已安装 npm CLI 的 JavaScript entry，不依赖
shell、PATH 或 platform-specific `.bin`。不存在 Desktop、Electron、Runtime Pack、App session、UDS、token、
managed ledger 或 `.rsp/bin/rsp`。界面沿用并收敛 Foundation 的本地 Web 控制台：Web 负责
配置、诊断、生产状态与已验证 Delivery 查看，Remotion Studio 负责实时画面预览；两者都不是创作或生产 authority。

Foundation 已有的唯一生产主链保持不变：

```text
ProjectCreateInput
  -> read-only inspect
  -> explicit costly prepare
  -> ProductionRevision + content-addressed Task DAG
  -> Agent task workspace
  -> fixed validation + ArtifactAttestation
  -> fixed continuation + convergence
  -> exact four-file Delivery
```

Agent 通过生成 Workspace 内的通用 Skill 读取 contracts，并调用项目本地 npm scripts 在 Workspace 中创作用户级
Project。Skill 只依赖文件、shell、JSON schema 和结构化 CLI 输出，不写死 Codex/OpenAI tool 名称；Codex、Claude、
Gemini 等宿主只通过各自的发现 adapter 指向同一份 `AGENTS.md` 与 Skill。

本次首先取得 Foundation 行为等价的可安装 npm vertical slice，再逐项移植 Desktop 分叉后的非 Desktop 修复。不得把
Desktop commit 整体 cherry-pick 到新分支，也不得保留两套 production authority。

## 2. 已确认基线与根因

### 2.1 Foundation 已经具备的能力

- 根 `package.json` 直接暴露 create、inspect、prepare、task check/commit/fail、continue、Catalog、Registry、
  Remotion preview/build/compositions 和完整 checks。
- CLI/application 已普遍接受 `rootDir`，默认才使用 `process.cwd()`；因此 portable Workspace 的主要工作是收敛
  location adapters，而不是重写 ProductionRevision、Task DAG 或 validator。
- `src/contracts/`、`scripts/project-production/domain/` 与 application 层可以继续作为 deterministic core；
  repository filesystem、provider、Remotion renderer 和 CLI 属于 adapters。
- Project 数据当前位于 `src/projects/`、`public/projects/`、`.narration-work/`、`.producer-*`、`out/` 和
  `deliveries/`，这些路径可以整体解释为一个生成项目根目录下的 Workspace layout。

### 2.2 当前不适合直接发布的原因

- 根包是 `private: true`、`UNLICENSED`，同时混合运行时代码、repository tests、proofs、Settings Web 和维护脚本。
- CLI 通过源码相对路径和 `tsx` 执行，用户安装包没有稳定的 compiled `bin`。
- Remotion/React/TypeScript 工具链都在一个 manifest 中，尚未区分 peer、runtime、development 与 scaffold-owned
  dependencies。
- `bootstrap`、Catalog/Registry、Remotion entry、Project source 和 package scripts 默认假设当前目录就是源码仓库。
- 没有在仓库外对 packed tarball、脚手架生成目录、全新安装和完整 Delivery 做验收。

### 2.3 为什么不从 Desktop 分支实施

Desktop 分支为“安装包不依赖系统 Node/npm”引入了 App Engine、Runtime Pack、workspace-local `rsp`、session/
socket/token、Workspace migration、encrypted App config、Player media protocol 和原生打包 gates。这些不是 npm
Workspace 的依赖，也不能成为新包的 compatibility layer。新方案只从 Foundation 选择性吸收与 Desktop 无关的
production correctness fixes。

## 3. 产品与仓库目标

### 3.1 开源 monorepo

```text
axmorf-studio/
├── package.json                         # private monorepo owner；不直接发布
├── package-lock.json
├── packages/
│   ├── studio/
│   │   ├── package.json                 # 可发布 runtime/CLI package
│   │   ├── src/
│   │   │   ├── contracts/
│   │   │   ├── production/
│   │   │   ├── projects/
│   │   │   ├── narration/
│   │   │   ├── catalog/
│   │   │   ├── registry/
│   │   │   ├── remotion/
│   │   │   ├── web/
│   │   │   └── cli/
│   │   └── dist/                         # compiled CLI/runtime 与预构建 Web assets
│   └── create-axmorf-studio/
│       ├── package.json
│       ├── src/
│       ├── template/
│       └── dist/
├── tests/
│   ├── package-boundary/
│   └── npm-install-e2e/
└── docs/
```

根仓库开源与根 package 的 `private: true` 不冲突；`private` 只阻止误发布 monorepo 根。只有 `packages/*` 中经过
allowlist、license 和 tarball gate 的 package 可以发布。

### 3.2 脚手架生成的 Workspace

```text
my-video-workspace/
├── package.json
├── package-lock.json
├── producer.config.example.json
├── private/
│   └── producer.config.json             # ignored；真实本地配置和凭据
├── AGENTS.md
├── CLAUDE.md
├── GEMINI.md
├── .agents/
│   └── skills/axmorf-video/
├── src/
│   ├── index.ts
│   └── projects/
├── public/
│   └── projects/
├── .narration-work/
├── .producer-work/
├── .producer-artifacts/
├── .producer-attempts/
├── out/
└── deliveries/
```

这里的 Workspace 是产品中的用户工作目录，不要求用户再维护一个多 package 的 npm workspaces monorepo。npm
workspaces 只用于本项目源码仓库管理两个发布包；脚手架生成的是一个普通、独立、可直接安装运行的 npm application。

`package.json` 中增加一个静态 workspace marker，例如：

```json
{
  "axmorf": {
    "workspaceVersion": 1
  }
}
```

CLI 默认从当前目录向上解析唯一 marker，也允许显式 `--workspace <path>`。解析后必须 canonicalize root、拒绝
symlink/special-file/path escape，并把同一个 root 传给所有 location adapters。绝对路径、安装路径和
`node_modules` 位置不得进入 Revision、Task、Artifact 或 Delivery identity。

### 3.3 命令入口

发布包只提供一个普通 npm `bin`：

```text
axmorf
```

最终用户的开箱路径固定为：

```bash
npm create axmorf-studio@latest my-video
cd my-video
npm run dev
```

`npm create axmorf-studio@latest` 按 npm initializer 约定解析到 `create-axmorf-studio`。第一条命令
默认完成目录生成、direct exact dependencies 写入、`npm install`、lockfile 生成、无 provider 的 bootstrap/doctor；
成功返回时目录已经可交给任意 Agent，也可直接启动 Web 和 Remotion Studio。用户不需要先 global install、clone 本仓库、
复制模板、手写 package.json 或理解内部 package layout。`--no-install` 只作为离线/高级用法，`--yes` 供 Agent/CI 使用。

README 是发现入口，生成 Workspace 的 `AGENTS.md`/Skill 是执行说明，`npm run doctor` 是当前宿主的 capability gate。
Agent 负责准备 package 声明的 Node.js/npm 与宿主前置条件；OS 不作为预设 allowlist，reference-environment evidence
也不限制其他宿主尝试运行。环境适配不得改写 package internals、`node_modules`、精确依赖、lockfile authority、
sandbox 或 validators，无法通过 doctor 时必须报告 blocker。

生成项目继续用 Foundation 已验证的 npm script 名称，让 Agent Skill 不需要理解包内部目录：

```text
bootstrap
doctor
web
preview
dev
project:create
project:produce:inspect
project:produce:prepare
project:task:check
project:task:commit
project:task:fail
project:produce:continue
project:delete
project:asset:import
project:check
```

这些 scripts 最终只转发到 package `bin`，不得引用仓库 `scripts/*.ts`、`tsx`、源码 checkout 或内部 package path。
阶段命令仍保留 inspect 的零 provider/零写入边界，以及 prepare 的显式成本边界；不能为了表面简化而增加一个会
静默调用 provider、等待 Agent 写文件或自动 retry 的假单命令。普通用户的 README 只展示“创建 Workspace、让 Agent
在目录中生产、打开 Web/Studio 预览与查看 Delivery”三步，详细阶段由 Workspace-local Skill 路由。

### 3.4 Web、Studio 与 Agent 的职责

```text
Agent host
  -> Workspace-local Skill + AGENTS.md
  -> npm scripts / structured CLI
  -> Project source + production artifacts + Delivery

Local Web Control Center
  -> strict config/preferences writes
  -> read-only diagnostics and production projections
  -> verified current Delivery player/covers

Remotion Studio
  -> generated Remotion entry + Workspace public assets
  -> live composition preview and visual debugging
```

- v1 直接复用 Foundation 当前 Web 的信息架构和 contracts，不重新实现 Desktop 风格壳层，也不实现第二套时间线、
  Scene 编辑器、Project create/revise 表单或 Agent 对话/派发界面；创作与 Project mutation 仍由 Agent + Skill + CLI
  完成。现有显式 Project 删除可保留为管理动作，但必须继续复用同一个严格删除 application service。
- `web` 启动只监听 `127.0.0.1` 的本地控制台；`preview` 启动当前 Workspace 的 Remotion Studio；`dev` 只是同时管理
  两个子进程的便利命令。默认端口可覆盖，冲突时明确失败，不能杀死或接管其他进程。
- Web 中的“打开 Remotion Studio”继续使用新标签页，不 iframe、不代理 Studio，也不复制 Remotion timeline。两套页面
  共用 Workspace 数据，但不互相充当 authority。
- 当前 Web 只有 Delivery 完整性标记；npm 版本补一个最小的 HTML5 video/cover viewer。服务端只能按已验证的 current
  Delivery contract 映射 exact four files，禁止接收任意 filesystem path。
- 发布 tarball 携带预构建静态 Web assets 和普通 Node HTTP adapter；Vite 只作为 monorepo build/dev dependency，
  最终用户运行 `npm run web` 不需要 Vite、`tsx` 或源码 checkout。
- Web 不把 secret 写入浏览器存储或日志。公开产品默认删除 `dev:lan` surface；如未来需要远程/局域网访问，必须另做
  authentication、secret exposure 与 threat model，不从 Foundation 的开发开关直接继承。

## 4. npm dependency 与开源许可证策略

### 4.1 Remotion 不进入发布 tarball

- `@axmorf/studio` 不设置 `bundleDependencies`，不携带 `node_modules`，不复制 Remotion 源码或
  compositor/browser binaries。
- package 对直接使用的 `remotion`、`@remotion/*`、`react`、`react-dom` 声明 `peerDependencies`，自身 build/test
  同时在 `devDependencies` 安装完全相同版本。
- 脚手架生成的最终应用把实际会 import/run 的 Remotion 和 React packages 写为 direct dependencies；所有
  `remotion` 与 `@remotion/*` 使用完全相同的精确版本，不允许 `^` 或 `~`。
- 只有生产包内部使用、且不要求 host 单例的第三方库进入其 `dependencies`。generated source 直接 import 的包必须
  由生成项目直接声明，不能依赖 npm 偶然 hoist 的 transitive package。
- 每个生成 Workspace 提交 `package-lock.json`；published library 的 lockfile 不能代替 consumer lock。

### 4.2 开源边界

- monorepo 和两个 published packages 统一采用用户已确认的 Apache-2.0；根 package 保持 `private: true` 以阻止
  误发布，两个 child packages 可公开发布。
- 新增 `THIRD_PARTY_NOTICES.md`，明确 Remotion 及其他第三方软件不受本项目许可证重新许可。
- README 明确链接 Remotion 当前独立许可证；开源本项目不改变 Remotion 及其他依赖的授权条件。
- package tarball 必须包含本项目 `LICENSE`、README、第三方声明与 package metadata，不包含 private config、voice
  material、Project、Delivery、test fixture media 或历史 evidence。
- 如果以后要求单 tarball/offline vendoring，必须作为新的许可证与分发授权任务，不能复用本方案的 npm dependency
  结论。

### 4.3 发布前独立 gates

以下均不由“代码已经 Green”自动授权：

1. npm scope/name 可用性与 owner；
2. 本项目 Apache-2.0 文本与 package copies 一致性；
3. Remotion 依赖/声明文本的最终许可证复核；
4. npm provenance、2FA/token 与 publish access；
5. 首次公开 `npm publish` 和 Git push。

## 5. 保留、删除与延后

### 5.1 必须保留

- strict JSON contracts、canonical serialization 和 content fingerprints；
- `ProjectCreateInput`、Project-owned media import 和完整 Project deletion；
- read-only inspect、explicit prepare、ExecutionAttempt diagnostics；
- ProductionRevision、Task DAG、task workspace、ArtifactAttestation；
- fixed validator、exact output set、no-symlink/path containment 和 atomic promotion；
- fixed continuation、current replan、controlled materialization；
- exact `video.mp4`、两张 Cover、`publish.json` Delivery 验证；
- host-neutral Workspace-local Agent Skill 与 repository-local `remotion-best-practices` routing；
- Foundation 本地 Web 的配置、只读诊断、生产投影与 Remotion Studio 外链边界。

### 5.2 从目标产品删除

- 把 Web 扩展为通用 Project/Scene 编辑器、Agent host/dispatcher 或第二套 Remotion timeline；
- Foundation 的 `dev:lan` 产品入口，以及没有 authentication 的远程 Web 服务；
- repository development proofs、architecture matrices 和 test runner 不进入 published tarball；
- host-specific source checkout adapters；
- 所有 Desktop/Electron/Runtime Pack/rsp session/IPC/package/installer 概念；
- Docker、常驻 daemon、后台 Agent scheduler、remote database/artifact store；
- 自动 provider retry/fallback、跨 Project Scene/media clone 或历史 Run authority。

### 5.3 Foundation parity 后再移植

Desktop 分叉后的功能按行为和 focused tests 重做，不按 commit 整体 cherry-pick：

| 能力                                                                  | npm 方案处理                            |
| --------------------------------------------------------------------- | --------------------------------------- |
| caption display half-unit budget 与字段级 issue                       | 首个 public beta 前移植                 |
| narration normalize、render cleanup、deadline/event correctness fixes | 对照 regression tests 逐项移植          |
| Agent task self-description/finalize 与安全 binding                   | 在 package vertical slice Green 后移植  |
| same-Project candidate revision                                       | 作为现有作品修改的独立纵向任务移植      |
| Scene originality baseline                                            | 在 candidate revision 后移植            |
| source-current / manual versus automatic Delivery                     | 重新评估产品需要，不从 Desktop 默认继承 |
| Foundation Settings Web 与 Studio 外链                                | 保留并迁入 npm package                  |
| Desktop Settings、Player、media ticket、Runtime Pack、native gates    | 永不移植                                |

首次 package parity 不得声称已经包含上表未完成能力；公开版本号和 README 必须按真实 capability 标注。

## 6. 实施任务

### Task 0：冻结 Foundation 与写 Red packaging contracts

**新增**

- `tests/package-boundary/package-layout.test.ts`
- `tests/package-boundary/remotion-dependencies.test.ts`
- `tests/package-boundary/no-desktop-authority.test.ts`
- `tests/npm-install-e2e/scaffold-contract.test.ts`

**断言**

- 当前 Foundation checks 保持 Green，且零 Project 可 bootstrap/check；
- 根包保持 private，两个 child packages 才可发布；
- published file allowlist 不包含 `desktop/`、repository-root `settings/`、`tests/`、`proofs/`、private、Project、
  work/artifact/attempt/out/delivery 或 `node_modules`；只允许 package-owned 的 `dist/web/**` 进入 Web surface；
- packages 不声明 `bundleDependencies`；
- generated app 的全部 Remotion packages 精确同版；
- workspace marker、root containment 和 config example contracts 明确；
- host-neutral Skill 不引用 Codex/OpenAI 专用 tool、home 目录或会话概念；
- Web runtime 不依赖 Vite/`tsx`，只绑定 loopback，并且任意路径不能绕过 current Delivery exact-file gate；
- package name、license、repository、exports、bin、files、engines 缺失时精确 Red。

Red 必须由目标 contract 缺失造成，不得以网络、npm registry、provider 或真实媒体渲染失败代替。

### Task 1：建立 npm workspaces 与发布 package skeleton

**修改**

- 根 `package.json`
- 根 `package-lock.json`
- `tsconfig.json`
- `eslint.config.mjs`

**新增**

- `packages/studio/package.json`
- `packages/studio/tsconfig.build.json`
- `packages/studio/src/index.ts`
- `packages/studio/src/cli/main.ts`
- `packages/create-axmorf-studio/package.json`
- `packages/create-axmorf-studio/tsconfig.build.json`
- `packages/create-axmorf-studio/src/index.ts`

**要求**

- 根只负责 workspaces、checks 和 release orchestration，不能成为运行时 import target；
- 两个 packages 输出 ESM/CJS 策略必须由真实 Node/npm/Remotion smoke 选择并固定，不同时维护两份手写逻辑；
- runtime package `exports` 只开放 public API、contracts、Remotion entry 和 CLI；禁止 deep import 内部 adapters；
- `files` 使用正向 allowlist；prepack 只 build/check，不修改源码或下载第三方 runtime；
- 暂不 publish，也不访问 npm registry 写接口。

### Task 2：移动 deterministic core，建立 Workspace locations port

**迁移范围**

- `src/contracts/`；
- `scripts/project-production/domain/`；
- Project/narration/production 中不依赖 filesystem 的纯函数；
- shared canonical JSON、fingerprint 与 validation utilities。

**新增/收敛**

- `packages/studio/src/workspace/resolve-workspace.ts`
- `packages/studio/src/workspace/production-locations.ts`
- `packages/studio/src/workspace/project-locations.ts`
- `packages/studio/src/workspace/runtime-locations.ts`

**要求**

- domain 不依赖 filesystem/CLI/npm/package installation path；
- application 只接收 typed locations/runtime/provider ports；
- adapter 才把一个 canonical Workspace root 映射到 `src/projects`、`public/projects`、work/artifact/attempt/out/
  deliveries；
- `process.cwd()` 只允许出现在 CLI composition root；
- package install location、npm cache、absolute path、Node/npm 版本不进入 creative identities；实际影响 render/
  validator 的 package versions 继续进入 runtime policy fingerprint；
- 每迁移一个模块就删除旧 authority 并更新全部 imports/tests，不保留 wrapper/alias 双主链。

### Task 3：迁移 repository adapters、Remotion runtime 与 Delivery

**迁移范围**

- Project create/delete/asset import；
- narration provider/seal/master/timing；
- Catalog、Registry、ScenePackage、RendererRegistry；
- task workspace、Artifact Store、attempt event、materializer；
- Composition scaffold、Remotion bundling/rendering、FFmpeg/media inspection、Delivery builder；
- template/style/assets 中真实 runtime 所需的 package-owned immutable resources；
- Foundation Settings Web 的 config/preferences contracts、诊断、production progress projection 与 client。

**要求**

- package resources 用 `import.meta.url`/package export 解析，只读；用户数据只写 Workspace；
- generated Remotion `src/index.ts` 和 static Registry 位于 Workspace，通用 Composition/runtime 来自 npm package；
- renderer runtime 不扫描 npm package、网络或 Agent；bundle 前由 fixed generator 写静态 imports；
- public assets 必须投影或复制为 Workspace-owned bytes 并进入 manifest，不在 render 时读取任意 package path；
- Settings server/client 迁入 package-owned Web adapter；开发源码可用 Vite 构建，但发布 runtime 只服务预构建 assets；
- Web 的配置写入继续 strict parse、same-origin 与 body-size gate；生产状态继续是 read-only projection，不读取历史 Run
  作为 current authority；
- Delivery media endpoint 必须先完成 current Delivery contract/exact-files/checksum 验证，再映射四个固定文件名；
- Foundation 的 Revision/Task/Artifact/Delivery identity fixtures在迁移前后保持一致，除非明确的 package runtime
  fingerprint change 有 focused migration assertion。

### Task 4：实现单一 CLI 与脚手架

**CLI**

- 一个 `axmorf` bin 路由 bootstrap、doctor、web、preview、dev、Project、production、task、
  Catalog/Registry 和 checks；
- stdout 成功结果和 stderr 失败结果保持结构化，退出码稳定；
- CLI 不调用 npm 安装、不修改 Agent home、不写包目录；
- Project mutation 先完成 strict validation；inspect 继续严格只读；prepare 才允许 provider；
- `web` 只启动本地 Web Control Center，`preview` 只启动当前 Workspace 的 Remotion Studio，`dev` 同时管理二者；
  不引入 Desktop Player、App session 或 daemon；
- Web/Studio 子进程的启动、端口失败和退出清理必须有跨平台测试，不依赖 Bash 或 POSIX-only process group 行为。

**脚手架**

- 拒绝非空/冲突目标、symlink target、非法 package name 和路径 escape；
- 在 same-parent staging 中生成完整 tree，验证后原子 rename；失败不留下 partial target；
- 写入 exact package versions、workspace marker、scripts、`.gitignore`、config example、Agent instructions、Skill、
  Remotion entry、空 Registry/Catalog；
- 默认在新目录执行 `npm install`，生成 lockfile 后调用 package-local bootstrap/doctor；任一步失败返回非零并保留明确的
  可恢复诊断，不把半成品宣称为 ready；
- 默认不创建 Project、不调用 provider、不下载媒体、不初始化 Git、不修改用户级 Agent 配置；
- 提供 `--no-install` 供离线或只生成模板的高级流程使用；该结果必须明确标记尚未 ready；
- 提供 `--yes` 的非交互模式供 Agent/CI 使用，交互提示与非交互 input 共用同一 schema。

### Task 5：切换 Agent Skill、Web Control Center、README 与配置模型

**目标**

- 根 `AGENTS.md` 服务 contributor；脚手架中的 `AGENTS.md` 服务生成 Workspace，两者不复制互相冲突的 authority；
- Workspace-local Skill 是面向任何具备读写文件和 shell 能力的 Agent 的薄路由，只引用生成项目真实存在的 npm
  scripts、CLI schema 和 package-bundled references，不引用源码仓库内部路径、Codex/OpenAI API、专用 child tool、
  thread/chat/session 或 Agent home；
- `CLAUDE.md`、`GEMINI.md` 等只作为可选发现 adapter 导入 `AGENTS.md`，不复制或扩展 production contract；
- Scene task 继续路由 package 内版本绑定的 `remotion-best-practices`；
- `producer.config.example.json` 只含脱敏示例，真实 `private/producer.config.json` 默认 ignored；
- secrets 不进入 package、Git、Skill、task workspace、artifact、Delivery 或日志；
- 脚手架把 package 中的 canonical Skill snapshot 复制到 Workspace；升级 package 不自动改写用户文件，Skill 同步策略
  在 public beta 前以显式 diff/check 命令定义，禁止后台自更新或 Desktop-style managed ledger；
- 复用 Foundation Web 的配置、诊断、进度与删除 UI，替换源码 checkout/Vite runtime 假设，并新增只读的 verified
  Delivery video/cover viewer；Web 不增加 Project create/revise 或 Agent 执行按钮；
- README 同时说明 Agent 创作主路径、JSON authority、Web 控制台和 Remotion Studio 的职责边界。

### Task 6：本地 pack/install/scaffold E2E

在 `mktemp` 隔离根中完成，不使用当前 repository 作为隐式 runtime：

1. build 两个 packages；
2. `npm pack --json` 并机械检查 exact tarball contents；
3. 从本地 `.tgz` 按默认模式执行脚手架，并由脚手架完成标准 `npm install`、lockfile 与 bootstrap/doctor；
4. 检查 package tree、Remotion versions、bin 和 workspace marker；
5. 另测 `--no-install`，证明它不误报 ready，随后可由显式 `npm install` 恢复；
6. 验证 zero Project bootstrap/Catalog/Registry、Web HTTP/API smoke 和 Remotion compositions；
7. 使用 deterministic local provider fixture 创建一个最小 Project，执行 inspect、prepare、Agent fixture tasks、
   continuation；
8. 复验 exact four-file Delivery、H.264/AAC、尺寸/fps/frame count、PNG、checksums 和 EOF decode；
9. 通过 Web 只读 endpoint/viewer 读取同一个 verified current Delivery，证明不存在第二份媒体 authority；
10. 删除该 Project，证明只清理 story-owned data；
11. 删除临时根，当前 checkout 和任何用户 Workspace 保持不变。

网络/provider failure 不得用 fallback 绕过；package E2E 默认使用仓库自有 deterministic fixture，真实 provider
另设显式授权的 smoke。

### Task 7：Agent capability 与开源发布 gates

- README 给出唯一 Agent-first onboarding：准备声明环境、运行 creator、读取 Workspace `AGENTS.md`/Skill、执行
  `npm run doctor`，再进入用户视频任务；
- creator install/bootstrap 与 Workspace doctor 是运行时 capability gate；未认证 OS 可以 best-effort 通过同一 gate，
  不用固定 Ubuntu/macOS/Windows matrix 阻塞首次发布；
- 至少一个明确记录的 reference environment 对同一 source commit 完成 install、typecheck、unit、pack、scaffold、
  no-provider compositions smoke 与完整 tarball render/Delivery E2E；当前 evidence set 包含 macOS 15 ARM64 的
  package/scaffold native gate 与 Ubuntu 24.04 x86_64 的 packed production/Delivery E2E，最终发布候选仍需从提交后的
  clean source 重建 receipt；
- product code 继续不依赖 Bash、Unix socket、POSIX permission literal、DMG/DEB 或平台绝对路径；路径、npm CLI、
  Web/Studio process lifecycle 保留跨平台单元/合同测试，但原生 OS certification 是增量 evidence，不是发布前矩阵；
- Agent 只能准备声明的 Node.js/npm、普通 dependencies、provider 配置与可用端口；不得改写 package internals、
  `node_modules`、精确依赖、lockfile authority、Chromium sandbox 或 validators，无法满足时必须结构化报告 blocker；
- doctor Green 只证明当前 Workspace 静态 readiness，不冒充 production completion、exact Delivery 或整个 OS 家族认证；
- 生成 SBOM/third-party license inventory，人工复核 Remotion 特殊许可证与非标准 license；
- `npm publish --dry-run`、provenance metadata 和 README install commands 验证通过；
- actual publish、Git push、release/tag 仍等待用户对名称、license、版本和目标 registry 的逐项授权。

### Task 8：移植非 Desktop production hardening

Package parity E2E Green 后，按第 5.3 节顺序建立 focused Red/Green。每项必须证明：

- 不 import `desktop/` 或 Desktop-derived adapter；
- 不改变无关 Revision/Task/Artifact identity；
- old valid Workspace data 要么按同一 contract 继续可读，要么明确 clean-break，不做静默兼容；
- generated Skill、CLI schema、tests 和 docs 同步；
- 完整 npm tarball E2E 继续 Green。

达到计划规定的 public beta 能力后再更新 package version；不得用“从 Desktop commit 移过来了”代替 npm Workspace
surface 的独立验证。

## 7. 验证顺序

每个 Task 先 focused，随后逐级扩大：

```text
contract/unit tests
  -> package typecheck/lint
  -> root static checks
  -> package build
  -> npm pack content gate
  -> isolated scaffold/install smoke
  -> Remotion compositions
  -> deterministic production E2E
  -> exact four-file media verification
  -> reference-environment capability receipt
  -> full repository check
```

验证报告必须记录：source commit、Node/npm version、OS/arch、两个 tarball name/checksum、generated lockfile、安装后的
Remotion version set、Project/Revision/Attempt/Delivery IDs 和四文件 checksums。聊天、自评、`npm pack` 成功或
Remotion bundle 成功都不能单独作为最终交付证据。

### 2026-08-30 本地实施回执

- runtime 与 creator 均可 build/typecheck/pack；package boundary 与 root 546 项 tests 通过；
- 从两个真实 `.tgz` 在仓库外运行 creator 默认流程，生成 ordinary npm Workspace，随后删除 `node_modules` 并用
  lockfile `npm ci` 重装；doctor 五项检查与 public `/contracts`、`/remotion` imports 通过；
- external Workspace 的三个 Remotion compositions、loopback Web static/API/CSP、浏览器导航与响应式无横向溢出
  检查通过；zero-provider Project create 和 inspect 保持零 provider 成本边界；
- runtime tarball 只含 allowlisted `package.json`/`dist/**`，不含 `node_modules`、Workspace data、Desktop 或
  repository tests；creator Skill 不含特定 Agent host、thread/chat/session/child tool 假设；
- 两个 child packages 已通过 npm 11 对官方 registry 的 `npm publish --dry-run --access public`，发布清单未发生
  自动修正；实现提交 `2bac738d4b24745b6bd10be386257dff7c60c4d1` 已在 macOS 15 ARM64 原生 runner 完成
  repository/public package gates、pack、外部 Workspace 默认安装、doctor、三个 compositions 和双侧零漏洞 audit，
  [CI run #33291456702](https://github.com/agenticnoob/axmorf-studio/actions/runs/33291456702) 的下载 receipt
  已复核 tarball SHA-256。该运行现在作为 package/scaffold reference-environment evidence；首次发布不再等待固定 OS
  matrix，其他宿主由 Agent 通过 Workspace doctor capability gate best-effort 接入；
- Ubuntu 24.04 x86_64、Node 24.16.0、npm 11.13.0 又从新 pack 的真实 tarballs 创建 clean Workspace，完成 strict
  Project create、provider narration、四个 bounded Agent tasks、one-shot continuation、convergence、Remotion render
  与 exact four-file Delivery。terminal 为 `project-production-complete`，完整 identity、tarball/media checksums 与
  H.264/AAC/PNG facts 见
  [Ubuntu production acceptance](../evidence/2026-08-30-ubuntu-npm-workspace-production-acceptance.md)；
- production 与完整 repository audit 已通过精确 overrides 和兼容开发工具更新归零。仓库和两个 child packages
  已采用 Apache-2.0，两个 child packages 已移除 `private` 并补齐 package README/LICENSE/third-party notices；
- 同一外部 Workspace 的 verified-Delivery Web endpoint/viewer 与受控 Project delete 串联验收尚未在本轮执行，
  因此计划暂不归档；真实 push/tag/Release/npm publish 仍等待用户单独授权。

## 8. 完成定义

只有同时满足以下条件，才能把本计划归档并称为 npm Workspace 方案完成：

- `axmorf/npm-workspace-open-source` 不含 tracked Desktop/Electron/Runtime Pack/rsp control-plane authority；
- monorepo 根不可发布，两个 child packages 可重复 build/pack；
- tarballs exact allowlist，无 `node_modules`、Remotion vendoring、private/user/generated production data；
- 脚手架在仓库外从本地 tarballs 创建一个独立、可重装的 Workspace；
- `npm create axmorf-studio@latest <name>` 默认完成 install、lockfile、bootstrap/doctor，不要求 global install
  或 source clone；
- generated Workspace 只依赖 npm package、配置 JSON、Agent instructions/Skill 和自身 Project/media/artifacts；
- Workspace-local Skill 不绑定 Codex，Web/Studio 不拥有创作或生产 authority；
- `npm run web` 可查看配置、诊断、生产投影与 verified current Delivery，`npm run preview` 可打开 Remotion Studio；
- 全部 Remotion packages 精确同版，package runtime 不依赖 npm hoisting 偶然性；
- Foundation production identity 与安全不变量保留；
- deterministic E2E 产生并复验 exact four-file Delivery；
- 至少一个 reference environment 具有 native install/scaffold/doctor/compositions 与 exact Delivery receipt；其他宿主
  由 Agent 通过 capability gate 接入，未认证状态不冒充原生支持；
- OSI license、third-party notices 和 Remotion 独立许可证边界明确；
- active docs、Skill、README、Roadmap、Architecture、Workflow、Status 与真实 package surface 一致；
- current checkout 中原有未跟踪 Desktop 遗留和任何用户 Project/Delivery 均未被纳入、修改或删除；
- 未经用户明确授权，没有 push、tag、GitHub Release 或真实 npm publish。

## 9. 建议提交切片

1. `docs: plan open-source npm workspace distribution`
2. `test(packaging): define npm package and scaffold contracts`
3. `build(packages): establish publishable workspace packages`
4. `refactor(core): move deterministic production into runtime package`
5. `refactor(runtime): bind filesystem and render adapters to workspace root`
6. `feat(cli): expose package-local production commands`
7. `feat(scaffold): create isolated story producer workspaces`
8. `feat(web): package local control center and verified delivery viewer`
9. `test(packaging): verify packed install and four-file delivery`
10. `test(release): validate the Agent capability gate and reference environment`
11. `docs: switch product authority to npm workspace distribution`

每个提交必须精确 stage owned paths；不得把 `.desktop-package-resources/`、`.vite/`、未跟踪 `desktop/` 或本地
Project/Delivery 一并提交。
