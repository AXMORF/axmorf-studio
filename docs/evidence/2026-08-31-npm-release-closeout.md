# npm release closeout

> 文档类型：可复核实施证据
>
> 验收日期：2026-08-31

## Scope

本次从 `axmorf/npm-workspace-open-source` 的 current closeout source 构建真实 npm tarballs，在仓库外验证 fresh
consumer、packed production/current Delivery 与 verified-Delivery Viewer。宿主是 Ubuntu 24.04 x86_64、Linux
`7.0.0-28-generic`、Node.js `24.16.0`、npm `11.13.0`。安装、audit 与 registry availability 查询显式使用官方 npm
registry；Project、artifacts、Delivery、浏览器截图与 npm cache 均位于 `/tmp`，没有进入 Git。

本次没有执行真实 npm publish、Git push/tag 或 GitHub Release。用户后续明确授权的受控 Project delete 只作用于
真实验收 Workspace 的一次性副本；原 Workspace 保持不变。tarball hash 是 current closeout candidate bytes 的
证据；若后续修改任何 packaged file，必须重新 pack 和复核，不能沿用本 receipt。

## Source and package gates

- `npm run check`：665/665 tests，typecheck、lint、docs links、Catalog/Registry、配置构建、Remotion bundle/
  compositions 与 host Project gate 全部通过；
- `npm run packages:typecheck`：通过；
- release-focused 17 tests、typecheck 与 lint：通过；
- runtime/creator `check:package`、`npm pack`、tarball allowlist 与
  `npm publish --dry-run --access public --json`：通过；
- 2026-08-31 官方 registry 对 `@axmorf/studio` 与 `create-axmorf-studio` 均返回 E404；真实 publish 未发生。

Closeout tarballs：

| Tarball | Bytes | Unpacked bytes | Entries | SHA-256 | npm integrity |
| --- | ---: | ---: | ---: | --- | --- |
| `axmorf-studio-0.1.0.tgz` | 1,870,664 | 8,479,842 | 246 | `a2ba9fd101c2116217d4bf8d5ebefcb7ba01afd66b759943a5dbf8523ef15f87` | `sha512-1L4aRUNhqZxT5OSqO2P3TwkiA62mQpX+fGhu4prR56Cc63bJibRzkA+ihbujDo9F6IdIualRYdWExRJwOf/JPg==` |
| `create-axmorf-studio-0.1.0.tgz` | 19,179 | 57,277 | 36 | `afca27882731761cdcb91b04537b9a4de602f9027d87adbfaea63815cad18d33` | `sha512-qxsaRy3HEbBB4yHHW6RLtCCe6nu62ZRU65fSlNvsIxF8YxC/Ym3wsASbblDoPpSD6d2ezb45+MgedBybGkAejQ==` |

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
- Revision：`revision-c449e64e3360575b9b589eb727f74c6ae5351cc0843587505b918087fa888831`
- Attempt：`d70e49db-7822-4041-9258-6dfa558b59e1`
- DeliveryBuild：`delivery-bfb3764b738af0d67ffe4001391b9b6c0a1380d0e49b73da7ee23fdf5aa809fa`
- Execution：显式 `inline`，三个 Agent tasks 逐一 exact bind/describe/finalize/check/commit，最后只启动一次
  attempt-bound continuation
- Actual cost：0 provider requests、2 provider cache hits、3 Agent tasks、5 reused tasks
- Fixed terminal：`project-production-complete`；随后 progress API 为 `current`，`error: null`

这三个 dirty Agent tasks 由 packed runtime identity 变化触发，分别是两个 `scene-owner` 与一个
`global-visual-owner`。每个 executor 只写其 bound workspace；continuation 完成 convergence、render 与 Delivery。

Delivery directory exact 只有四个 regular files：

| File | Bytes | SHA-256 | Media facts |
| --- | ---: | --- | --- |
| `video.mp4` | 2,186,132 | `63544a1dce4d1bb6393e7ce7faedc3f2878bc58e7ed6b7f893e77dcf9452aa7d` | H.264/AAC, 1080×1920, 30 fps, 272 frames, stereo |
| `cover-4x3.png` | 146,234 | `ca2a4f6e1dec8de39206f978a89ac5a70e78d349fca39b73183eeefdda478749` | PNG, 1600×1200 |
| `cover-3x4.png` | 169,447 | `8b9b4c345caa987aa9fc9f34a12318c3eb36bb84e9f19f9153482a75b9b67791` | PNG, 1200×1600 |
| `publish.json` | 2,115 | `e920e9307172534f2b87d0ef5ab5fb464ae826ea26659ec246fc4514fbf0ad60` | publish-last identity and checksums |

## Verified-Delivery Viewer receipt

packed Web 在 loopback `127.0.0.1:43173` 上提供 current Delivery。Chrome 151 的真实浏览器验收结果：

- desktop `1440×1000`：progress API 200；video Range API 206；双 Cover API 200；video `readyState=4`，从
  `0` 播放到 `1.143992` 秒；Cover natural sizes 为 `1600×1200` 与 `1200×1600`；
- narrow viewport `390×844`：current Delivery 可见，video `readyState=4`，双 Cover 尺寸正确；
- 两个 viewport 的 console errors、page errors 与 bad HTTP responses 均为空；
- 浏览器切换 MP4 range 时会主动取消首个 metadata request，记录一个预期 `net::ERR_ABORTED`；后续 206、
  `readyState=4` 与实际播放共同证明媒体成功，不能把该取消记录描述为 server failure。

Viewer 验收暴露并修复三处 release blocker：packed progress 缺少 runtime policy manifest、三秒 poll 反复 abort 慢
inspect、客户端取消 MP4 时 Delivery stream 未释放 `FileHandle`。新增 regression 覆盖 packed manifest、in-flight
request coalescing，以及 Linux `/proc/self/fd` 下 abort 后 descriptor count 恢复为 0；修复后的 Web server 停止前
等待 12 秒没有 FileHandle GC warning。

窄屏证据只证明 Delivery 可加载和 API/媒体正确，不把当前 desktop-oriented 控制台描述为已完成响应式视觉优化。

## Controlled Project delete receipt

用户明确授权后，将包含上述 Project、五个历史 attempts、完整 task work/artifact 集合和 exact-four Delivery 的真实
验收 Workspace 复制到一次性 `/tmp` 目录，只在副本执行删除。删除前副本的 Project-owned file counts 为：source 52、
public 4、narration work 7、task work 134、artifacts 124、attempts 38、Delivery 4。

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
