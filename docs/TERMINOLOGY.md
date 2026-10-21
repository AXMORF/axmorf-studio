# 名词表

> 文档类型：术语 authority

<!-- prettier-ignore -->
| 名词 | 精确定义 |
| --- | --- |
| Workspace | `create-axmorf-studio` 生成的普通 npm 项目，`package.json` 带 `axmorf.workspaceVersion: 1`，依赖精确版本的 `@axmorf/studio`。 |
| film | `src/films/<filmId>/` 下的一部作品：`film.json`、`Film.tsx`、`Cover.tsx`、`assets.json` 与 `generated/`。 |
| filmId | 小写 kebab-case 的作品 ID，同时决定源码、`public/films/<filmId>/` 与 `deliveries/<filmId>/` 路径。 |
| `film.json`（FilmSpec） | 一部片的剧本与配方：渲染规格、时间轴、旁白分句、配乐配方、发布文案与片头片尾。由 Agent 编写，CLI 校验。 |
| 正片（body） | Agent 编写的 `Film.tsx` 画面；`useFilmTiming()`、审片与配乐只计正片帧。 |
| 片头片尾（bookends） | `film.json.bookends` 选择的系统模板（`axmorf-brand-reveal-v1` 2 秒、`axmorf-source-follow-v1` 8 秒），交付时接在正片前后，各带模板音频。 |
| 旁白时序（FilmTiming） | `film:voice` 写入的 `generated/timing.json`；每句帧范围由实测 PCM samples 按 `ceilDiv(samples × fps, sampleRate)` 换算。 |
| caption 预算 | 每句旁白最多 72 caption display half-units；超限由 Agent 改写或拆句，不放宽检查。 |
| 配乐（FilmMusic） | `film:music` 按 `music.score` 确定性合成的 `music.wav` 与 `generated/music.json`（bpm、拍、小节、段落与重音帧）。 |
| 素材登记（FilmAssets） | `assets.json` 中每个媒体文件的来源、作者、许可与 checksum，由 `film:asset` 写入；`film:check` 拒绝未登记或被改动的媒体。 |
| 审片（review） | `film:review` 用 `<filmId>--review` 组合渲染所选帧，生成联系表、`stillWarnings`（相隔 2 秒以上且几乎不变的帧对）与 `readabilityWarnings`（实测字号、文字越界、字幕遮挡）；`readability` 列出测量帧数与缺失帧。可读性仅作提示，不拦截检查或交付。 |
| 交付（delivery） | `deliveries/<filmId>/` 下恰好四个文件：`video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`，全部复验后才替换上一版。 |
| 历史交付 | 被新交付替换的旧交付，按其 `deliveredAt` 存于 `.axmorf/history/<filmId>/`。 |
| Workspace 操作锁 | `.project-operation.lock`；film 写命令与 Workspace 升级互斥，被占用时直接失败。 |
| managed file | creator 拥有、升级时按 `.axmorf/managed.json` 更新的 Workspace 文件；用户改动会先备份并报告为 `localChanges`。 |
| doctor | `npm run doctor`：检查 Workspace 布局、运行时资源、Remotion CLI、真实浏览器渲染与 producer config，是 Workspace 是否 ready 的唯一判定。 |
| external blocker | provider、宿主工具、沙箱、权限或认证失败；报告后停止，不加 fallback 或自动重试，用户同意后才可重试。 |
| legacyProjectData | 升级时报告的旧 Project 链目录（`src/projects/`、`.producer-*` 等）；0.3.0 不再使用，也不自动删除。 |
