# Ubuntu npm current-feature re-acceptance

> 文档类型：可复核实施证据
>
> 验收日期：2026-08-30

## Scope

本次在 revision candidate、Scene originality、TaskExecutionContract/TaskWorkerBinding、failed-attempt reissue 与
GlobalVisual 双层 policy 加入当前 feature snapshot 后，重新从 repository 外验收真实 npm tarballs。宿主是 Ubuntu
24.04 x86_64、Linux `7.0.0-28-generic`、Node.js `24.16.0`、npm `11.13.0`，安装/audit 显式使用官方 npm
registry。

生产验收开始时 source base 为 `285dbf3cec78b0bcd8c7357d98ff0dfe0dde17d7` 加当前 feature patch。验收前后
tracked binary diff、untracked content aggregate 与完整 porcelain status 三个 SHA-256 分别保持：

```text
4680fbd8b49bf7851f2952be490a57877b592047239fa85dc4105e70c38b54d2
789e4b1216a5ca9a6ac780911a1e324fb42bcae04b0478c32b6273c0d0081467
11c6cb7664e1b9e1c290597a56d5b67eabf4f2911fdae8d016c64fcded7f5cd5
```

临时 Workspace、Project、provider cache、artifacts 与 Delivery 都位于 `/tmp`，没有进入 Git。后续文档 closeout
只对齐 active authority、package README/creator help 与 contract tests；不得把下面的 production-stage tarball hash
描述为未来 npm registry 包的 hash。

## Source and package gates

- `npm run check`：661/661 tests，typecheck、lint、docs links、Catalog/Registry、Web build、Remotion bundle/
  compositions 与 host Project gate 全部通过；
- `npm run packages:typecheck`：通过；
- runtime 与 creator 的 `check:package`、`npm pack`、`npm publish --dry-run --access public --json`：通过；
- tarball allowlist 扫描未发现 `node_modules`、private、Desktop 或 tests 泄漏；
- 验收当时官方 registry 对 `@axmorf/studio` 与 `create-axmorf-studio` 仍返回 E404，真实 publish 未发生。

Production-stage tarballs：

| Tarball | SHA-256 |
| --- | --- |
| `axmorf-studio-0.1.0.tgz` | `64c23515ccaa94748a3c8042bbe5b9621ae4bdeeeb9c65b2192041dfc70aca63` |
| `create-axmorf-studio-0.1.0.tgz` | `d31caca762ac74b28c2105843f1f9641e402f9c5265dca38e893367d44d19b33` |

文档 closeout 后又从最终待提交源码执行 `npm run check`（662/662）、`npm run packages:typecheck` 和两包
`npm pack`；两个 `check:package` 均返回 `publicRelease: ready`，tarball 可完整解包。closeout tarballs 只证明当前
待提交源码的 package bytes，不替代上表实际生产 Workspace 使用的 tarballs：

| Closeout tarball | Bytes | SHA-256 |
| --- | ---: | --- |
| `axmorf-studio-0.1.0.tgz` | 1,870,388 | `335bd3b53ddd143288427d658a0751f673a3b99621a4c5430b2103f109c3060b` |
| `create-axmorf-studio-0.1.0.tgz` | 19,179 | `afca27882731761cdcb91b04537b9a4de602f9027d87adbfaea63815cad18d33` |

creator 仅从这两份 tarball 创建外部 `ubuntu-current-acceptance` Workspace。默认 install/bootstrap/doctor 成功；
随后 `npm ci` 可重放安装，official-registry `npm audit --json` 为 0 finding。public `/contracts` 与 `/remotion`
imports 分别暴露 479/157 exports；lockfile 中所有 `remotion`/`@remotion/*` 精确为 `4.0.489`。首次
`npm run compositions` 在 Ubuntu 下载 Chrome Headless Shell 后列出三个 package compositions。

## Production receipt

- Project：`ubuntu-current-features`
- Revision：`revision-30325fc5789b65bb44496e2fea4fa5a046a7f6581b1b55b5dd8e6af080582df1`
- Attempt：`e2a8fc1c-4476-4c90-a5a8-fca559c207bf`
- DeliveryBuild：`delivery-9d7215c31eb1012186d7cb0443e49c04dfd2f09622908817799ab6f88fb5bea8`
- Execution：显式 `subagents`，verified `shared-workspace`，requested/effective concurrency 均为 4
- Actual cost projection：2 provider requests、2 provider cache hits、4 Agent tasks
- Fixed terminal：`project-production-complete`，`attemptRecorded: true`

只读 inspect 先返回 `configured-authoring`、2 个预计 provider requests、0 cache hits 与
`prepare-narration`。报告 readiness/cost/reuse 后才运行 prepare。四个 dirty tasks 分别执行 exact attempt-bound
bind，只有 `task-worker-bound` 后读取 immutable inputs；各自 finalize/check/commit 并产生
ArtifactAttestation。Root 在四个 child admission 后只启动一次 prepare 返回的 continuation；没有轮询、第二次
continuation、inline fallback 或 failed-attempt retry。

本 Project 验证了 packed shared-workspace binding 和完整 fixed continuation。candidate create/promotion 与 failed-attempt
recover/reissue 由 repository regression tests 覆盖，本次 Project 没有伪造这些 runtime terminal receipts。

## Exact Delivery

Delivery directory exact 只有四个 regular files：

| File | Bytes | SHA-256 | Media facts |
| --- | ---: | --- | --- |
| `video.mp4` | 1,542,724 | `194b5db098792cbd0ac4e91eef6e00e86cf756e1404483efcb8248af00871149` | H.264/AAC, 1080×1920, 30 fps, 272 video frames, 48 kHz stereo |
| `cover-4x3.png` | 146,234 | `ca2a4f6e1dec8de39206f978a89ac5a70e78d349fca39b73183eeefdda478749` | PNG, 1600×1200 |
| `cover-3x4.png` | 169,447 | `8b9b4c345caa987aa9fc9f34a12318c3eb36bb84e9f19f9153482a75b9b67791` | PNG, 1200×1600 |
| `publish.json` | 2,115 | `3773e0e0b50108b4c5253c23d7be27c74f928cb55a497958132758f4c022e31d` | publish-last identity and checksums |

终态后重新 bundle/list compositions，`UbuntuCurrentFeatures` 为 1080×1920、30 fps、272 frames。package 内预构建
Web 通过 `npm run web -- --port 43173` 监听 loopback，根文档返回 HTTP 200；这只是 packaged HTTP smoke，不替代
尚待单独完成的 verified-Delivery endpoint/viewer 浏览器证据。

真实 npm publish、Git push/tag、GitHub Release 与受控 Project delete 均未执行。
