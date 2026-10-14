# Direct Film 生产方案

> 文档类型：实施计划
>
> 状态：已批准（2026-10-14），实施中：第 1 步源码完成，待发布验收（实现事实与偏差见
> [ITERATION_STATUS.md](../ITERATION_STATUS.md)）
>
> 目标 authority 见 [FINAL_PRODUCT_GOAL.md](../FINAL_PRODUCT_GOAL.md)；阶段门槛见 [ROADMAP.md](../ROADMAP.md)。
> 当前实现仍是 Project production 主链，事实以 [ITERATION_STATUS.md](../ITERATION_STATUS.md) 为准。

## 1. 为什么改

0.1.x 把视频生产做成内容寻址工厂：ProductionRevision → Task DAG → TaskExecutionContract → attempt-bound
bind → finalize/check/commit → fixed continuation → converge → delivery。它为崩溃恢复、并行隔离和审计而设计，
但视频质量取决于创作手艺和“渲染出来看一眼再改”的反馈回路。2026-10-14 的 HTTPS 握手验证片量到：

| 项目                     | 数据                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| 一个 Scene worker 的输入 | `context.json` 82KB + `task-contract.json` 53KB，创作信息约 18KB（13%） |
| 与创作无关的输入         | originality 指纹 20KB、完整资源目录 43KB                                |
| 声明输出                 | 8 个文件，只有 `Renderer.tsx` 是作品，7 个 JSON 计划约 35KB             |
| 任务 workflow            | 16 条，已达上限                                                         |
| Workspace npm scripts    | 39 个，17 个属于 task/attempt 生命周期                                  |
| 检查器打回               | 5 次（URL 文本、字号证明、同步锚点、`.map()`、封面渐变），无一改善画面  |

同一 Agent 直接写一个 Remotion 工程、渲染截图再修改时，成片明显更好。维护者已确认 direct 方式效果更好，
不再做对照实验。旧作品不需要迁移，可以删除。

## 2. 目标形态

### 2.1 Workspace 布局

```text
src/films/<filmId>/
  film.json          剧本、渲染规格、声音和配乐配方、发布文案（Agent 编写）
  Film.tsx           正片 Composition（Agent 自由编写，可拆分为 scenes/*.tsx）
  Cover.tsx          封面组件，按 4:3 与 3:4 两种尺寸渲染
  assets.json        素材来源与许可记录（由 film:asset 维护）
  generated/         工具生成、只读：timing.json、music.json 及其类型化入口
src/films/index.ts   生成的静态注册表，供 Remotion Root 使用
public/films/<filmId>/  旁白、配乐与准入素材
deliveries/<filmId>/    video.mp4、cover-4x3.png、cover-3x4.png、publish.json
.axmorf/cache/          TTS 缓存（按 provider、voice、文本内容寻址）
.axmorf/history/<filmId>/<time>/  被新交付替换的旧交付
```

`film.json` 是精简合同，不复用 StorySpec/Beat/meaningId：

```json
{
  "schemaVersion": 1,
  "filmId": "https-handshake",
  "render": { "width": 1080, "height": 1920, "fps": 30 },
  "narration": [
    { "id": "s01", "text": "你在咖啡馆连上 Wi-Fi，打开银行网站。" },
    { "id": "s02", "text": "这一路上，谁都可能在偷看。", "pauseAfterMs": 300 }
  ],
  "music": { "engine": "studio-v2", "bpm": 112, "arrangement": {} },
  "publish": { "title": "", "description": "", "tags": [] }
}
```

`render` 未写的字段继承 Workspace 配置；`narration` 可为空数组表示无旁白；`music` 可为 `null`。

### 2.2 运行时组件与 hook（`@axmorf/studio/remotion`）

| API                                   | 作用                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `useFilmTiming()`                     | 旁白每句的起止帧、总帧数；配乐的拍、小节、段落与重音帧 |
| `<FilmCaptions />`                    | 按实测时序显示字幕，样式可覆盖，默认放在安全区         |
| `<FilmSoundtrack />`                  | 旁白、配乐、旁白下的 ducking，可加独立音效             |
| `<AxmorfIntro />` / `<AxmorfOutro />` | 品牌片头片尾，可选，带各自的音频                       |
| `snapToBeat()` 等                     | 现有 motion、camera、ShotStage、界面组件全部可直接导入 |

Composition 由 Agent 自己组织：字幕、旁白、配乐通过组件放入，不再有强制的顶层图层、透明 Scene root、
GlobalVisual/Cover 任务隔离或 decoration 占比上限。

### 2.3 命令

| 命令                           | 作用                                                              | 复用                                            |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------- |
| `film:new`                     | 建立 film 目录、可运行的 `Film.tsx`/`Cover.tsx` 骨架并刷新注册表  | create input 的渲染规格解析                     |
| `film:voice`                   | 逐句 TTS、PCM 实测、母带、`generated/timing.json`；按内容缓存     | `scripts/narration` 的 provider、PCM、mastering |
| `film:music`                   | 按配方和实际总帧数合成配乐与 `generated/music.json`               | `synth-score.mjs`、`studio-score.mjs`           |
| `film:asset`                   | 校验并复制图片/SVG/音频，写入 `assets.json`                       | `scripts/project-assets` 的来源与许可校验       |
| `dev`                          | Remotion Studio 实时预览                                          | 现有                                            |
| `film:review`                  | 在每句旁白中点、段落起点和重音帧渲染缩小的联系表，可选低清短片    | task preview 渲染适配器                         |
| `film:check`                   | 硬规则与渲染实测（见 2.4）                                        | 现有 forbidden-pattern 与 typecheck             |
| `film:deliver`                 | 渲染正片和两张封面、复验、写 `publish.json`、旧交付归档到 history | `build-delivery` 的媒体复验                     |
| `film:list` / `film:delete`    | 列出与删除，只清理该 film 自有路径                                | `project:delete` 的清理语义                     |
| `doctor` / `workspace:upgrade` | 环境检查与升级                                                    | 现有                                            |

### 2.4 `film:check` 规则

硬错误只保留会导致渲染失败、交付不合格或许可问题的项：

1. TypeScript 编译通过。
2. 渲染时不联网：用 AST 识别 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 调用以及远程
   `src`/import；字符串里的 URL 文本允许出现。
3. 不使用 CSS animation/transition 或 Tailwind 动画工具类。
4. 媒体只通过 `staticFile()` 引用 `public/films/<filmId>/` 或共享素材，且每项都在 `assets.json` 或共享清单里。
5. 有旁白时挂载了 `<FilmCaptions />` 与 `<FilmSoundtrack />`；Composition 时长覆盖旁白和尾部。
6. `film.json` 合法，每句旁白不超过 72 caption display half-units。

渲染实测只给警告：在联系表采样帧里测量实际文字像素高度、是否越出安全区。

### 2.5 不再存在的机制

ProductionRevision、Task DAG、TaskExecutionContract、TaskRevision、ArtifactAttestation、DeliveryBuildId、
ExecutionAttempt、bind/describe/finalize/commit/fail、fixed continuation、converge、recover/reissue/interrupt、
worker transport 与 execution resolve、revision candidate/promotion、originality baseline、可读性静态证明、
7 个 Scene 计划 JSON、scene-template fixed task、GlobalVisual/Cover 独立任务。

修订就是修改源码后重新 `film:deliver`。并行是 Skill 中的可选做法：Root 写好整片规划，把各 scene 文件分给
子 Agent，合并就是文件本身，Root 用联系表统一审片。

### 2.6 Skill

新 Skill `axmorf-film` 以导演手册为主：视觉质量线、整片构思、镜头与运动、标杆 Scene、配乐与卡点、
看图回路；命令说明只占一节。目标体积约为现有 Skill 的三分之一。文档测试只检查链接、命令名与路径存在，
不锁定措辞。

## 3. 实施步骤

### 第 1 步：0.2.0，新增 direct 并设为默认

旧 `project:*` 主链保留一个版本作为回退，不再新增功能。

1. 文档 authority：重写产品目标与路线图，登记本计划（本 PR）。
2. 合同：`FilmSpec`、`FilmTiming`、`FilmMusic`、`FilmAssets` schema 与 `publish.json`。
3. 运行时：`@axmorf/studio/remotion` 中的 film hook 和组件；Remotion Root 同时注册 films 与旧 Projects。
4. CLI：第 2.3 节命令。
5. Skill 与模板：新增 `axmorf-film`，Workspace AGENTS.md 把新视频路由到它；旧 Skill 只处理旧作品。
6. creator：新模板含 `src/films/`；`workspace:upgrade` 把新 Skill 加入托管目录。
7. 验收：在维护者已升级的 Workspace 上用 direct 重做 HTTPS 握手片，记录用时、检查器打回次数与成片；
   Codex 额度恢复后另做一部。按现有两道门发布。

完成标准：一部片从 `film:new` 到四文件交付，不调用任何 task、attempt 或 revision 命令。

### 第 2 步：0.3.0，删除旧主链

1. 删除 `scripts/project-production/` 的生产主链、`scripts/projects/` 的 revision/originality、
   scene-template fixed task、相关 contracts、CLI、Web 视图、测试与文档。
2. Workspace 不再注册 `src/projects/`；升级时列出残留的旧 Project，不自动删除用户文件，
   提示用 0.2.x 的 `project:delete` 清理。已交付文件保留。
3. 文档收敛为约十几个 active 文件，ITERATION_STATUS 的历史段落归档。

完成标准：`npm run check` 通过；全新 Workspace 与从 0.2.x 升级的 Workspace 都能完成一部片。

## 4. 风险与对策

| 风险                             | 对策                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| 失去崩溃恢复与场景级复用         | 本地整片重渲为分钟级；TTS 按内容缓存，配乐确定性生成            |
| 护栏减少后质量下滑               | Skill 强制联系表审片；硬规则只保留第 2.4 节；实测可读性给出警告 |
| 0.2.0 双路径增加维护面           | 旧主链冻结，只修阻塞性缺陷；0.3.0 删除                          |
| Agent 绕开组件自己处理字幕与声音 | `film:check` 要求挂载组件；时序只来自 `generated/timing.json`   |
