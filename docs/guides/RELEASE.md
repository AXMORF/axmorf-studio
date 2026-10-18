# 发布流程

发布分成两道门：

1. **发布门（阻塞）**：确定性的技术检查，全部由 CI 在 tag 上自动完成。通过即发布。
2. **晋级门（不阻塞发布）**：用真实 Agent 宿主在 Workspace 中完成一部片。只有通过它的版本才发布为 `latest`。

预发布版本（如 `0.3.0-rc.1`）发布到 npm `next`，普通用户默认安装的 `latest` 不受影响。验收通过后，
以同一份源码发布正式版本（如 `0.3.0`）到 `latest`。

## 发版步骤

在默认分支的最新 commit 上：

```bash
npm run release:prepare -- 0.3.0-rc.1
```

```bash
npm run check
```

`release:prepare` 只改根目录、`@axmorf/studio`、`create-axmorf-studio` 三个 `package.json` 和 lock 文件中的对应版本，
并返回该版本将发布到的 dist-tag。版本 commit 经 PR 合入默认分支后，在该 commit 上打 `v<version>` tag 并推送，
`.github/workflows/npm-publish.yml` 自动运行。验收通过后用正式版本号重复。

## 发布门（CI）

workflow 在 tag 上依次执行，任一步失败都不会发布：

- tag 与三个包的版本一致，且 tag 指向的 commit 已在默认分支上；
- `npm ci`、`packages:typecheck`、`packages:build`、`npm audit --audit-level=low`；
- 完整的 `npm run check`（静态检查加 `npm run compositions`）；
- 渲染 `DefaultIntroPreview`（1080×1920、60 帧、H.264/AAC 立体声）并完整解码到 EOF；
- 打包两个 tarball，核对版本和 integrity；
- 用这两个 tarball 创建全新的外部 Workspace，运行 doctor 与 `npm run compositions`；
- 以 provenance 发布：版本号含 `-` 时发布到 `next`，否则发布到 `latest`。

新版本在公共 registry 可见可能需要十分钟以上：发布后最多等待 30 分钟再核对 integrity。已存在的同版本只校验
integrity；`npm publish` 报版本已存在（例如上次运行发布成功但在可见前超时）时，同样等待并校验，不重复发布。

运行回执（渲染事实、Workspace doctor、lock 与 SHA256SUMS）作为 Actions artifact 保存 30 天，不提交进仓库。

## 晋级门（Agent 验收）

用 `next` 版本新建 Workspace，或用 `npx create-axmorf-studio@next upgrade` 升级已有 Workspace，然后只发送一条普通的
业务提示词，不附加工程提示，也不在运行中补充修复指令。通过条件：

- doctor 就绪，Agent 按 `axmorf-film` Skill 完成 `film:new`、旁白、配乐、审片与 `film:deliver`；
- 交付 exact 四文件，`publish.json` 已复验，视频可完整解码，片头片尾按配置出现；
- 抽帧审阅画面并记录观察到的问题。审阅是人的判断，不等于自动审美认证。

通过后发布正式版本。失败时不晋级：修复后发布下一个预发布版本重新验收。宿主或 provider 不可用时，
候选版本保持在 `next`，恢复后再验收。
