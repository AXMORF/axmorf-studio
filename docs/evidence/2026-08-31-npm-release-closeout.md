# npm release closeout

> 文档类型：可复核实施证据
>
> 验收日期：2026-08-31

## Scope

本次从 `axmorf/npm-workspace-open-source` 的 current closeout source 构建真实 npm tarballs，在仓库外验证 fresh
consumer、packed production/current Delivery 与 verified-Delivery Viewer。宿主是 Ubuntu 24.04 x86_64、Linux
`7.0.0-28-generic`、Node.js `24.16.0`、npm `11.13.0`。安装、audit 与 registry availability 查询显式使用官方 npm
registry；Project、artifacts、Delivery、浏览器截图与 npm cache 均位于 `/tmp`，没有进入 Git。

closeout 后用户明确授权继续发布：release blocker 修复提交已 push，仓库已从
`agenticnoob/axmorf-studio` 转移到 `AXMORF/axmorf-studio`，默认分支已切换为
`axmorf/npm-workspace-open-source`，旧 `main` 保留。最终 Organization repository metadata 进入两个 tarball 后，
本 receipt 重新执行 pack、fresh consumer、packed production、Viewer 与受控 Project delete；随后从 exact commit
`7b5fea3329d2ef5eb10f82ef67a3606ca5476bfb` 发布 `v0.1.0` tag、两个 public npm packages 与 GitHub Release。
Project、Delivery 与浏览器产物都只位于一次性 `/tmp` Workspace，原仓库不保存用户 Project。

## Source and package gates

- `npm run check`：666/666 tests，typecheck、lint、docs links、Catalog/Registry、配置构建、Remotion bundle/
  compositions 与 host Project gate 全部通过；
- `npm run packages:typecheck`：通过；
- release-focused 17 tests、macOS portability-focused 22 tests、typecheck 与 lint：通过；
- runtime/creator `check:package`、`npm pack`、tarball allowlist 与
  `npm publish --dry-run --access public --json`：通过；
- official registry 已公开 `@axmorf/studio@0.1.0` 与 `create-axmorf-studio@0.1.0`；两者 registry integrity 与下表
  release candidate 精确一致。

Closeout tarballs：

| Tarball                          |     Bytes | Unpacked bytes | Entries | SHA-256                                                            | npm integrity                                                                                     |
| -------------------------------- | --------: | -------------: | ------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `axmorf-studio-0.1.0.tgz`        | 1,870,785 |      8,480,629 |     246 | `fa56f42cf1b29012d884b7afb0bfbb5881d143135047d64b1e5c0a999fe3b747` | `sha512-TsQtw9/gG0LNhXiU1Fiw2Vc+d5/5SuTz1Q2Fa4jVXVCJhYfrNxr2C4KDWmq+08qgOq27vW2m+jav3iwClxKFdQ==` |
| `create-axmorf-studio-0.1.0.tgz` |    19,174 |         57,272 |      36 | `69bafda455964802b19b08789b3452a51ecbf7ce8c76d7a6e448f9c95edf4184` | `sha512-N9LBaRsGDGzpSPh1i3GlEhNEHawr8dZsxCK9Lz26g9awE6UNYpb+0q1aFDWmsCDdYzV2jK62aZ5Ti9cjtaZdyQ==` |

## Public release receipt

- tag/release：[`v0.1.0`](https://github.com/AXMORF/axmorf-studio/releases/tag/v0.1.0)，annotated tag exact 指向
  `7b5fea3329d2ef5eb10f82ef67a3606ca5476bfb`；
- final publish/integrity gate：
  [`#33362584883`](https://github.com/AXMORF/axmorf-studio/actions/runs/33362584883)，完整 repository/package gates、
  exact pack、双包 registry integrity 与 receipt upload 全部 Green；
- 首次两个 publish 请求分别成功返回 `+ @axmorf/studio@0.1.0` 与 `+ create-axmorf-studio@0.1.0`，且发布 provenance
  到 Sigstore transparency log；npm 的新包 packument 在写入成功后短暂返回 E404。幂等重跑只在 registry integrity
  与本地 candidate 相同时跳过已存在版本；最终 Green run 没有重复写入；
- official-registry 外部用户验收使用 published creator 创建并默认安装 250 packages；bootstrap/doctor 五项、三个
  compositions、三个 public imports 与零漏洞 audit 全部通过。`npm audit signatures` 验证 250 个 registry signatures
  和 47 个 attestations；
- publish receipt 的两份 tarball SHA-256 与上表逐字节一致。后续 workflow 在 publish 后最多等待五分钟读取公开
  integrity，并生成只含 tarball basename 的 portable `SHA256SUMS`，避免把 runner 绝对路径写入 receipt。

## Fresh consumer receipt

creator 仅从上表两份 tarball 原子创建全新 `final-consumer` Workspace。进程级 `npm_config_registry` 与
`npm_config_cache` 使 creator 及其安装子进程共同使用官方 registry 和独立 cache；默认 install、lockfile、
bootstrap 与 doctor 一次完成。随后：

- `@axmorf/studio`、`@axmorf/studio/contracts`、`@axmorf/studio/remotion` 三个公开入口均可 import；
- 顶层精确版本为 `@axmorf/studio@0.1.0`、`@react-three/fiber@9.6.1`、`three@0.185.0`、
  `react@19.2.3`、`react-dom@19.2.3`、`remotion@4.0.489` 与 `@remotion/cli@4.0.489`；
- `npm ci` 从 lockfile 重新安装 250 packages，`npm run doctor` 五项检查通过；
- official-registry `npm audit --json` 为 0 finding；
- `npm run compositions` 列出 `CapabilityGallery`、`DefaultIntroPreview`、`DefaultOutroPreview`。

一次受污染环境的预检继承了用户级 `registry.npmmirror.com` 与旧 `/data/cache/npm`，其 stale `three` packument 让 npm
报告 `three@undefined`；creator 按原子语义删除 staging，没有留下半成品。官方 registry 与 fresh mirror cache 都能
解析相同 `three@0.185.0` integrity。未使用 `--force`、`--legacy-peer-deps`，也未修改 dependencies 或 package
internals；上面的 Green receipt 来自官方 registry 与独立 cache。

## Packed production receipt

- Workspace/Project：仓库外 `ubuntu-current-acceptance` / `ubuntu-current-features`
- Revision：`revision-d83e5e609a9fed70f9ebfd9e87a534463983a4ac69bd90d321a52462f6eb64c1`
- Attempt：`29feb5be-46bc-47d2-89ef-a6fe830f8609`
- DeliveryBuild：`delivery-1b85c344bd130b2af3ce074ae35971ad193fb66e27a9bee235f94db2ec6a66a8`
- Execution：显式 `inline`；最终 macOS portability tarball 复用 5 个 valid artifacts，两个 `scene-owner` 与一个
  `global-visual-owner` 逐一 exact bind/describe/finalize/check/commit；最后只启动一次 attempt-bound continuation
- Actual cost：0 provider requests、2 provider cache hits、3 Agent tasks、5 reused tasks
- Fixed terminal：`project-production-complete`；随后 progress API 为 `current`，`error: null`

先前 Organization metadata tarball 只改变 package identity，三个 Agent artifact TaskRevision 保持 valid；本次
`attempt-event-wait` correctness 修复改变 production runtime identity，因此三项 Agent task 正确失效并由 `inline` Root
重新创作/验证。fixed continuation 独占完成 convergence、render 与 Delivery，没有额外 provider 请求。

Delivery directory exact 只有四个 regular files：

| File            |     Bytes | SHA-256                                                            | Media facts                                      |
| --------------- | --------: | ------------------------------------------------------------------ | ------------------------------------------------ |
| `video.mp4`     | 1,810,300 | `089c54e95eca51baa7cc36c5ce9792d6e23747373f4397d82660f82f13e7b107` | H.264/AAC, 1080×1920, 30 fps, 272 frames, stereo |
| `cover-4x3.png` |   146,234 | `ca2a4f6e1dec8de39206f978a89ac5a70e78d349fca39b73183eeefdda478749` | PNG, 1600×1200                                   |
| `cover-3x4.png` |   169,447 | `8b9b4c345caa987aa9fc9f34a12318c3eb36bb84e9f19f9153482a75b9b67791` | PNG, 1200×1600                                   |
| `publish.json`  |     2,115 | `6a4ce66d60ae87097358d18d75682cf80b258d3e8257d6604e53985ad09f9c10` | publish-last identity and checksums              |

## Verified-Delivery Viewer receipt

packed Web 在 loopback `127.0.0.1:43174` 上提供 current Delivery。Chrome 151 的真实浏览器验收结果：

- desktop `1440×1200`：progress API 200；video Range API 206，`Content-Range` 为
  `bytes 0-1023/1810300`；双 Cover API 200；video `readyState=3`，从 `0` 播放到 `1.428305` 秒；Cover natural
  sizes 为 `1600×1200` 与 `1200×1600`；
- console errors、page errors 与 bad HTTP responses 均为空；
- 浏览器切换 MP4 range 时会主动取消首个 metadata request，记录一个预期 `net::ERR_ABORTED`；后续 206、
  `readyState=4` 与实际播放共同证明媒体成功，不能把该取消记录描述为 server failure。

Viewer 验收暴露并修复三处 release blocker：packed progress 缺少 runtime policy manifest、三秒 poll 反复 abort 慢
inspect、客户端取消 MP4 时 Delivery stream 未释放 `FileHandle`。新增 regression 覆盖 packed manifest、in-flight
request coalescing，以及 Linux `/proc/self/fd` 下 abort 后 descriptor count 恢复为 0；修复后的 Web server 停止前
等待 12 秒没有 FileHandle GC warning。

浏览器验收优先尝试 repository-independent `playwright-cli`，但 npm registry 中其当前 package 依赖了不存在的
`playwright-core` alpha，返回 `ETARGET`。因此使用稳定 Playwright API 1.55 与宿主 Chrome 151 执行同一真实浏览器
检查；这项工具回退不进入 package，也不掩盖页面、console、媒体或 HTTP 结果。

## macOS path portability and release automation

push 后的 macOS gate `#33327350179` 在 full tests 捕获 `/var/...` 到 `/private/var/...` 的 canonical ancestor alias。
`resolveWorkspaceRoot` 现在分别 `lstat` requested/canonical root，并以相同 filesystem metadata 接受祖先别名，同时继续
拒绝 leaf root symlink、内部 symlink 与 path escape。随后 macOS gate
[`#33329569091`](https://github.com/AXMORF/axmorf-studio/actions/runs/33329569091) 又暴露两个 Linux 未复现的边界：macOS
会延迟投递订阅前文件的 `fs.watch` 通知；测试中的 `/var` 路径也没有命中生产代码已 canonicalize 的 `/private/var`
路径。event wait 现在以 immutable event log 相对 baseline 的真实新增 JSON 为准，不能只信 watcher notification；
originality drift test 则比较 canonical renderer path。focused 22 tests 和完整 666/666 gate 已在 Linux Green；修复提交
push 后的 macOS gate
[`#33330699611`](https://github.com/AXMORF/axmorf-studio/actions/runs/33330699611) 已完成完整 gates、双包 pack、fresh
Workspace 与 receipt 上传。artifact `9737615274` 的 digest 是
`sha256:439d2fe4fc7fdbd8d1f2a9b263af7eddc56454526e7010569751235887ed24cf`。runtime SHA-256 与本表一致；creator
解包比较又暴露 clean GitHub checkout 缺少 6 个被根 `.gitignore` 捕获的 template `.gitkeep`，而本地 pack 会把这些
ignored files 混入 tarball。六个 placeholder 现作为 creator template source 精确纳入 Git，`check:package` 要求它们为
regular files；本地 creator 恢复本表的 36 entries/hash，`--no-install` Workspace 也验证六个目录存在。最终 release
commit 的 macOS gate
[`#33331148535`](https://github.com/AXMORF/axmorf-studio/actions/runs/33331148535) 已 Green；artifact
`9737728324` digest 为 `sha256:38e630e2d67340472954f0dc7d6c1d1e3c8a1b12f0c9b427d56d20700cabc1d2`，其中两份
tarball 与 Linux release candidates 逐字节相同。

仓库已转移到 `AXMORF/axmorf-studio`，三个 `package.json.repository` 均与 provenance source exact match。新增
`.github/workflows/npm-publish.yml`：只允许从 exact `v<version>` tag 手动触发，要求二次输入相同 tag，使用 GitHub-hosted
runner、`id-token: write`、完整 gates、exact tarball checksums、provenance publish，以及“registry 已存在时 integrity
必须相同”的幂等重跑语义。首次 push 的 GitHub parser receipt 又捕获 job-level `env` 不能引用 `runner.temp`；release
root 现只在 step-level `env`/input 使用 runner context，不再生成 push-time invalid-workflow run。首次发布仍需 npm scope
权限与 `NPM_TOKEN`；`v0.1.0` 首次发布已完成。实际发布暴露 npm 新包写入成功后 packument 短暂 E404，workflow 现对
post-publish public integrity 执行 bounded retry，并输出 portable checksum receipt。两个包可分别配置 npm trusted
publisher 到 `AXMORF/axmorf-studio` / `npm-publish.yml`，确认 OIDC 后移除临时 publish token。

## Controlled Project delete receipt

用户明确授权后，将包含上述 Project、多个历史 attempts 与当前 attempt、完整 task work/artifact 集合和 exact-four Delivery 的真实
验收 Workspace 复制到一次性 `/tmp/axmorf-final-macos-fix-delete-eqBPJE/workspace`，只在副本执行删除。删除前副本的
Project-owned file counts 为：source 52、public 4、narration work 7、task work 190、artifacts 180、attempts 59、
Delivery 4。

先运行不带确认参数的命令：

```text
npm run project:delete -- --project ubuntu-current-features
```

命令返回 `command-failed`、exit 1；Project、artifacts、attempts 与 Delivery 均仍存在，四个 Delivery checksum 与上表
一致。随后运行用户授权的 exact command：

```text
npm run project:delete -- --project ubuntu-current-features --confirm-delete
```

结构化终态为 `deletionVersion: 1`、`deletedProjectIds: ["ubuntu-current-features"]`、`projectEntryCount: 0`，并只报告
删除以下七个实际存在的 ownership roots：

- `.narration-work/ubuntu-current-features`
- `.producer-artifacts/ubuntu-current-features`
- `.producer-attempts/ubuntu-current-features`
- `.producer-work/ubuntu-current-features`
- `deliveries/ubuntu-current-features`
- `public/projects/ubuntu-current-features`
- `src/projects/ubuntu-current-features`

删除后 source/public/narration/work/artifact/attempt/revision candidate/legacy Run/out/delivery 的 storyId-owned roots
全部不存在，生成的 Project Registry 为 0 entry。caller-owned 根目录 create input 被保留；package.json、lockfile、
AGENTS、private producer config、共享 `public/assets/library` 与 Workspace `src/index.ts` checksum 全部不变。Catalog
保留 15 个共享 entries。

副本在删除后继续通过 doctor 五项检查和三个系统 compositions；packed Web root 返回 HTTP 200，progress API 返回
`{"schemaVersion":5,"projects":[]}`。原验收 Workspace 的 Project、artifacts、attempts 与 exact-four Delivery 仍存在，
四个 checksum 与删除前一致。该 receipt 证明受控删除和 zero-Project 状态，不代表授权删除任何真实用户 Project。
