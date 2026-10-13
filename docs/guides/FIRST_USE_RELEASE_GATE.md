# 发布流程

从 0.1.22 起，发布分成两道门：

1. **发布门（阻塞）**：确定性的技术检查，全部由 CI 在 tag 上自动完成。通过即发布。
2. **晋级门（不阻塞发布）**：用真实 Agent 宿主在全新 Workspace 中完成一部视频。只有通过它的版本才发布为 `latest`。

预发布版本（如 `0.1.22-rc.1`）发布到 npm `next`，普通用户默认安装的 `latest` 不受影响。验收通过后，
以同一份源码发布正式版本（如 `0.1.22`）到 `latest`。不再需要 release plan、验收复用审批或发布后补写的记录 commit。

## 发版步骤

在默认分支的最新 commit 上：

```bash
npm run release:prepare -- 0.1.22-rc.1
```

```bash
npm run check:static
```

```bash
git commit -am "release: 0.1.22-rc.1" && git tag v0.1.22-rc.1 && git push origin HEAD v0.1.22-rc.1
```

`release:prepare` 只改根目录、`@axmorf/studio`、`create-axmorf-studio` 三个 `package.json` 和 lock 文件中的对应版本，
并返回该版本将发布到的 dist-tag。推送 tag 后 `.github/workflows/npm-publish.yml` 自动运行。验收通过后用正式版本号
重复上述三步。

## 发布门（CI）

workflow 在 tag 上依次执行，任一步失败都不会发布：

- tag 与三个包的版本一致，且 tag 指向的 commit 已在默认分支上；
- `npm ci`、`packages:typecheck`、`packages:build`、`npm audit --audit-level=low`；
- 完整的 `npm run check`（静态检查加宿主浏览器门禁）；
- 渲染 `DefaultIntroPreview`（1080×1920、60 帧、H.264/AAC 立体声）并完整解码到 EOF；
- 打包两个 tarball，核对版本和 integrity；
- 用这两个 tarball 创建全新的外部 Workspace，运行 doctor 与 `npm run compositions`；
- 以 provenance 发布：版本号含 `-` 时发布到 `next`，否则发布到 `latest`。已存在的同版本只校验 integrity，不重复发布。

运行回执（渲染事实、Workspace doctor、lock 与 SHA256SUMS）作为 Actions artifact 保存 30 天，不提交进仓库。

## 晋级门（Agent 验收）

在全新目录和全新宿主会话中，用 `next` 版本创建 Workspace：

```bash
npm create axmorf-studio@next my-workspace
```

然后只发送一条普通的业务提示词，不附加工程提示，也不在运行中补充修复指令。默认 `subagents` 路径下，通过条件是：

- doctor 就绪，Root 按 Skill 完成 create、inspect、prepare 与唯一 continuation；
- 交付 exact 四文件，`publish.json` 已复验，视频可完整解码；
- 抽帧审阅画面，对照 Skill 的 visual quality bar 记录观察到的问题。审阅是人的判断，不等于自动审美认证。

通过后发布正式版本。失败时不晋级：修复后发布下一个预发布版本重新验收。失败的运行不改写，也不追认通过。
宿主不可用（例如认证失败）时，候选版本保持在 `next`，等宿主恢复后再验收。

## 可选诊断工具

`scripts/release/first-use.ts` 与 `release-gate.ts` 保留为可选诊断工具，用于需要严格审计某次原生运行时
（转录绑定、并发重叠、不轮询、消息时序等）。它们不再是发布或晋级的前置条件。

## 历史记录

0.1.21 及更早版本的 release plan、原生首用收据、验收复用审批与发布记录保留在 `docs/evidence/`，各自只认证当时的包。
这些版本的分层门禁规则与各版本特例见 `v0.1.21` tag 中的本文件旧版。
