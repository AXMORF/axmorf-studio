# Iteration Status

## 0.3.0：删除 Project production 主链（2026-10-19，源码完成，未发布）

按[迁移方案](promotions/2026-10-14-direct-film-production.md)第 2 步删除旧主链，只保留 direct film：

- 删除 `project:*`、`catalog`、`registry`、`renderer`、`scene`、`narration`、`reference` 等 CLI 与其实现，45 个旧合同，
  旧 Remotion 运行时（story-visual、narrative-core、composition-assembly 等）、资源目录 catalog、`proofs/`、
  `axmorf-video` Skill、旧 Agent 首用审计工具，以及只服务旧 attempt 恢复的进程登记与期限作用域。
  `@axmorf/studio/remotion` 保留 film 组件、片头片尾与 Skill 文档列出的可选组件。
- 配乐引擎从 `axmorf-video` Skill 移到 `scripts/films/score/`；成片检查函数移到 `scripts/films/inspect-media.ts`。
- Web 控制中心改为“作品 / 通用 / 片头片尾 / TTS”：作品页读 `film:list` 并按 `publish.json` 记录的文件大小预览交付，
  删除需输入完整 ID；去掉旧的 Agent 执行、画面安全区、合集与全局 BGM 设置（配置字段为兼容保留）。
- Workspace：bootstrap 与 doctor 不再创建或要求 `src/projects/`、`.producer-*` 和资源目录；doctor 五项检查。
  升级删除退役的 `axmorf-video` 与旧 `remotion-best-practices` Skill、`src/runtime/` 兼容层、仍是原值的旧脚本，
  并清理留下的空目录；旧 Project 目录只在有内容时列入 `legacyProjectData`，不删除。
- `axmorf-film` Skill 新增两个可编译的[示例段落](../.agents/skills/axmorf-film/references/examples.md)，由测试保证
  它们放进 film 后 `film:check` 零错误零警告。
- 文档收敛为 11 份 active 文档；旧主链的文档、合同、guides 与 0.2.0 之前的证据移入
  [archive/project-production/](archive/project-production/)，0.1.22–0.1.23 状态移入
  [归档](archive/iteration-status-0.1.23-and-earlier.md)。

验证：`npm run check` 通过（320 项测试，耗时由 5 分 42 秒降到约 2 分 10 秒）；运行时包由 314 个文件、40.7MB 降到
246 个文件、32.8MB。用本地 tarball 新建 Workspace，doctor 通过、无旧目录，交付一部 240 帧无旁白片
（片头片尾在内 540 帧，H.264/AAC 双声道），Web 作品页列出作品并播放交付视频与封面。用 npm 上的 0.2.1 新建
Workspace、交付一部片并放入旧 Project 残留后升级：删除 49 个退役文件、无本地改动冲突、doctor 通过，旧片重新交付
并归档上一版，新片完整交付。同一轮中带旁白的片在 Edge TTS 第一句失败（外部阻塞，未重试），带旁白的升级后
完整生产留待发布前验收。

## 0.2.1 发布与宿主验收（2026-10-18）

`0.2.1-rc.1`（Edge TTS 请求节奏、`/axmorf-film` 入口）与 `0.2.1-rc.2`（片头片尾、审片自查）先后发布到 `next`，
维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade` 就地升级，doctor 六项通过。

Codex（gpt-6.1-sol，高推理）在 rc.2 上按 `axmorf-film` 流程完成 `dns-address-journey-v2`：

- 交付 1400 帧 = 片头 60 + 正片 1100 + 片尾 240，1080×1920、30fps，46.67 秒；片尾列出 3 条参考来源。
- 抽帧确认片头片尾与音频都在；第一版“顶部标题 + 居中物体 + 底部字幕”的版式改为同一场景内的物体与贴附标签，
  各级服务器造型不同，镜头在对象之间移动，结尾无长时间静止。剩余倾向：多数段落仍以单个居中物体为主。

发布流程同时修正：新版本在公共 registry 可见可能超过 10 分钟，rc.2 因原 5 分钟等待误判失败（runtime 已发布、creator 未发布，
人工重跑后完成）。现在发布后最多等待 30 分钟；`npm publish` 报版本已存在时不再直接失败，而是等待并核对 registry integrity
与本次 tarball 一致。

未验证：人工连续观看与听审。

## 片头片尾与审片自查（2026-10-16，随 0.2.1 发布）

0.2.0 的 direct 流程没有接 Workspace 配置里的 `sceneDefaults.introSceneTemplateId/outroSceneTemplateId`，
Codex 制作的 `dns-address-journey` 因此没有片头片尾。现在：

- `film.json` 新增可选 `bookends`（`intro`、`outro`、`theme`、`sources`），`film:new` 按配置写入；省略即无片头片尾，既有片不变。
- 交付组合在正片前后自动接上系统模板 `axmorf-brand-reveal-v1`（2 秒）与 `axmorf-source-follow-v1`（8 秒），各带模板音频；
  其他帧率按秒换算。`Film.tsx`、`useFilmTiming()`、审片与配乐仍只计正片。交付校验与 `publish.json` 使用总长。
- `film:review` 新增 `stillWarnings`：相隔 2 秒以上、64×64 灰度缩略图平均差小于 3 的相邻审片帧。阈值用该片校准：
  结尾静止 4 秒的两帧差 2.37，有变化的相邻帧 4.9–14.3。只提示，不拦截交付。
- Skill 要求审片清单逐条给出帧号证据，新增“每段顶部标题 + 居中物体 + 底部字幕”的失败信号与替代做法，结尾同样需要次级运动。

验证：film 测试 19 项通过；本地打包的 runtime 在测试 Workspace 交付 510 帧（60 + 210 + 240），抽帧与分段音量确认片头、
正片、片尾参考来源与品牌落版及各自音频都在。

## Edge TTS 请求节奏与诊断（2026-10-15，随 0.2.1 发布）

隔离诊断的五次低频请求全部获得 HTTP 101 与可解码音频：当前 API/v1 与 Bing/v2 均通过代理和应用层直连，
当前 API/v2 也通过代理。未复现 429，不能认定旧 GEC 是当前 API 的失败原因，也未证实出口 IP 持续被封。
历史突发请求后 429、稍后恢复的表现仍支持短时节流假设，具体阈值与计数范围未知。

源码 Edge adapter 现在串行发送真实请求，前一次结束后至少间隔 10 秒；首句立即发送，缓存命中不等待。
10 秒是待真实生产验证的缓解初值，不是已测得的微软配额。失败会立即停止该 adapter 的排队请求，仍无自动重试或 fallback。
stderr 只记录开始/结束时间、chunk ID、代理/直连标签、耗时和固定 HTTP/超时状态，不含旁白、URL 或凭据。
保留 `node-edge-tts@1.2.11`、当前端点和握手参数；不改变音频停顿、缓存 identity 或实测时序。

离线假时钟、假客户端及缓存集成验证覆盖上述行为；108 项相关回归、类型、定向 lint、格式与文档链接检查通过。
本次实现未新增真实 TTS 请求；随 `0.2.1-rc.1` 发布到 `next`，同版还带有 Claude Code 的 `/axmorf-film` Skill 入口。
诊断与验证边界见[记录](evidence/2026-10-15-edge-tts-pacing.md)。

## 0.2.0 发布与宿主验收（2026-10-15）

`0.2.0-rc.1` 经 tag 触发的 CI 完整检查后发布到 `next`。维护者的 Workspace 用 `npx create-axmorf-studio@next upgrade`
从 0.1.23 就地升级：新增 `axmorf-film` Skill，更新 5 个托管文件，无本地改动冲突，doctor 六项通过，既有作品与交付保留。

Claude 作为宿主按 `axmorf-film` 流程完成 `https-handshake-direct`（与 0.1.23 验收片同一脚本）：

- 源码先在测试 Workspace 中用估算时序起草并审片一轮，修正重叠、裁切和过小元素后复制到正式 Workspace。
- Edge TTS 首次在第 5 句超时（外部故障，未自动重试）；维护者同意后重试一次，已缓存的前 4 句未再请求，8 句全部完成。
- 按实测时长重排配乐，使最满段落及重音落在第 692 帧，与两端金钥匙合成同帧；尾声段落起点第 1038 帧对应地址栏小锁亮起。
- 审片联系表确认取景逐段变化、两个落点对齐；交付 38.87 秒、1080×1920、30fps、1166 帧 H.264 与 AAC 双声道，
  exact 四文件复验通过，-15.7 LUFS。

未验证：Codex 宿主的表现、人工连续观看与听审。

## Direct film 制作方式（2026-10-14，随 0.2.0 发布）

按[实施计划](promotions/2026-10-14-direct-film-production.md)第 1 步实现，计划作为 0.2.0 发布；0.1.23 的
Project production 主链保持不变，只处理既有作品。

- 合同：`FilmSpec`（`film.json`）、`FilmTiming`、`FilmMusic`、`FilmAssets`、`FilmPublish`，以及 `filmCompositionIds`。
  旁白每句最多 72 caption display half-units；时序按实测 samples 用 `ceilDiv(samples × fps, sampleRate)` 换算。
- 运行时（`@axmorf/studio/remotion`）：`useFilm`、`useFilmTiming`、`FilmCaptions`、`FilmSoundtrack`
  （旁白、循环配乐、旁白下 ducking、结尾淡出）、`FilmCompositions`；每部片注册正片、`--review` 与两张封面 Still，
  另有共享的 `axmorf-contact-sheet` Still。计划中的独立 `@axmorf/studio/film` 入口改为并入 `/remotion`：
  两个 bundle 会各带一份 React context，Provider 与 hook 将无法互通。
- CLI：`film:new`、`film:voice`（按 provider 与文本缓存每句 TTS）、`film:music`、`film:asset`、`film:review`、
  `film:check`、`film:deliver`（临时目录渲染、复验后替换，旧交付按其交付时间归档）、`film:list`、`film:delete`；
  写操作共用 `.project-operation.lock`。bootstrap 生成 `src/films/index.ts` 静态注册表。
- 审片：review 组合与正片等长（Remotion 会把冻结帧裁剪到组合长度），CLI 只渲染前 N 帧；联系表由 Remotion
  渲染，因为随 Remotion 发行的 ffmpeg 没有 `tile` 等滤镜。
- 检查：硬错误为 TypeScript、渲染时联网（按调用和属性判断，屏幕上的 URL 文本允许）、CSS 动画、
  `Math.random`/`Date.now`/`new Date()`、未登记或已改动的媒体、跨片导入、缺少字幕/声音组件、旁白或配乐过期；
  小字号只给警告。计划中的“渲染后实测可读性”尚未实现。
- 模板与 Skill：新 Skill `axmorf-film`（流程、画面手艺、配乐与卡点、素材、API），Workspace `AGENTS.md`、
  README 与 9 个 `film:*` scripts；`workspace:upgrade` 镜像新 Skill。首尾品牌组件尚未提供。

验证：film 单元与流程测试 12 项（含真实 TypeScript 检查、伪造 TTS 的旁白时序、交付替换与回滚、删除范围）。
用本地打包的 runtime 与 creator 新建 Workspace（doctor 六项通过），完成一部无旁白的 7 秒测试片：
`film:music` → `film:check` → `film:review`（联系表帧内容正确）→ `film:deliver`（29 秒，H.264 210 帧、AAC 双声道，
配乐与重音音效实际混入）。同一次运行中 Edge TTS 对第二句返回 HTTP 429（外部阻塞，未重试），第一句的真实 TTS、
归一化与缓存成功；带旁白的完整真实生产留待发布前验收。
