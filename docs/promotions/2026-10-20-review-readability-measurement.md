# 审片渲染实测可读性提示（film:review readabilityWarnings）

> 文档类型：实施计划
>
> 状态：实施中（2026-10-20 源码与验证完成，未提交、未发布；字幕遮挡的带旁白真实渲染待验）。完成并记入 [ITERATION_STATUS.md](../ITERATION_STATUS.md) 后移入
> `docs/archive/implementation-plans/` 并补归档说明。

## 1. 目标

[ROADMAP.md](../ROADMAP.md) 下一步候选第二项“渲染后的可读性实测……作为审片提示”，以及
[Direct Film 生产方案](2026-10-14-direct-film-production.md) 第 2.4 节“渲染实测只给警告：在联系表采样帧里测量
实际文字像素高度、是否越出安全区”目前没有实现（ITERATION_STATUS 0.2.0 段：“计划中的‘渲染后实测可读性’尚未实现”）。
现在只有 `film:check` 的静态 `small-text` 警告：它只看字面量 `fontSize`，看不到 `scale` 变换、SVG 文字、
计算出来的字号、越出画面或被字幕挡住的文字。

本批交付：`film:review` 在渲染审片帧的同时，在浏览器里实测每个采样帧上**实际可见的文字**，输出
`readabilityWarnings`。只是审片提示，不拦截 `film:check` 或 `film:deliver`。

## 2. 范围

本批实现三条规则（都是对交付分辨率、即 `film.json` 的 `render.width × render.height` 坐标而言）：

| rule                  | 判定                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `small-text`          | 非字幕文字的实际字号（计算字号 × 累计变换缩放）小于 `minimumReadableFontSize(width, height)`         |
| `text-outside-frame`  | 非字幕文字的可见矩形部分越出画面边界（超出 > 1px）；完全在画面外的文字视为未出场，不计               |
| `text-under-captions` | 非字幕文字矩形与同帧字幕框（`[data-axmorf-captions]` 内的字幕块）相交，相交面积 ≥ 文字矩形面积的 10% |

`minimumReadableFontSize` 与 `film:check` 现有静态阈值相同：`round(min(width, height) × 0.024)`，抽成一个共享函数，
两处使用同一实现，避免两套阈值。

不在本批：对比度、文字停留时长（需要像素采样或密集采帧，另立方案）、平台 UI 安全区内缩（需要按平台给出依据）、
片头片尾（不是作者源码，审片组合本来也不含）、封面。

## 3. 设计

### 3.1 浏览器内测量（运行时，只在 review 组合中）

- 位置：`packages/studio/src/remotion/film/` 新增内部模块（例如 `review-measure.ts`），不加入
  `@axmorf/studio/remotion` 公共导出；`compositions.tsx` 的 `reviewLoader` 用一个容器包住 `<Freeze><Authored/></Freeze>`
  并在该容器上测量。正片、封面、片头片尾组合不变。
- 时机：每个审片帧（review 组合帧 index）渲染后，用 `delayRender`/`continueRender` 等待 `document.fonts.ready`
  和布局稳定（例如两次 `requestAnimationFrame`）再测量，然后释放 handle；测量不得改变任何像素。
  失败时也必须释放 handle 并输出带错误说明的记录，不能让渲染挂起。
- 采集：用 `TreeWalker(SHOW_TEXT)` 遍历容器内非空白文本节点；对每个节点用 `Range#getClientRects()` 得到可见矩形
  并合并为外接矩形；跳过 `display:none`、`visibility` 非 visible、祖先累计 `opacity < 0.05` 或零面积的文字。
  - HTML 文字：实际字号 = `getComputedStyle(el).fontSize` × 累计缩放（`el.getBoundingClientRect().height / el.offsetHeight`，
    `offsetHeight` 为 0 时退回 1 或按矩形推算，实现时选定并注释理由）。
  - SVG `<text>`/`<tspan>`：实际字号 = 计算字号 × `sqrt(|det(getScreenCTM())|)`。
  - 祖先链上存在 `[data-axmorf-captions]` 的文字标为 `caption: true`，并记录字幕块（文字所在块元素，含内边距与背景）的矩形。
- 输出：每个审片帧一行，`console` 打印“固定标记 + 单行 JSON”。标记常量与载荷 zod schema 放在
  `packages/studio/src/contracts/film.ts`（浏览器安全，运行时与 scripts 共用）。载荷包含
  review 帧 index、对应正片帧号、`width`/`height`、文字列表（截断的文字摘要 ≤ 24 个字符、`caption`、实际字号、
  矩形）；每帧最多 120 条，超出时记录 `truncated: true`。坐标一律是组合坐标（`--scale` 只改变 deviceScaleFactor）。

### 3.2 CLI 收集与分析（scripts/films）

- `scripts/films/media.ts`：`renderFilmReviewFrames` 返回 Remotion 进程的 stdout/stderr（或解析好的测量记录）；
  只为 review 渲染调整日志级别，其他渲染保持 `--log=error`。
- 日志通道必须用真实渲染核实（Remotion 4.0.489，非 TTY 子进程）：`@remotion/renderer` 把 bundle 内的
  `console.log` 记为 verbose、`console.warn` 记为 warn、`console.error` 记为 error，CLI 在非 TTY 下按 `--log` 级别直接打印。
  选能在最低必要日志级别下稳定拿到完整单行的组合（优先不打开 verbose：`bounded-process` 只保留最后 1 MiB stdout），
  并在代码注释里写明依据。
- 新增 `scripts/films/readability.ts`（纯函数，可单测）：
  1. 从输出文本中提取标记行：去 ANSI 颜色、容忍 Remotion 的 tag 前缀、用 schema 校验 JSON；坏行忽略但计数。
  2. 按 §2 规则产生警告；同一 rule + 同一文字摘要在多帧出现时合并为一条，列出帧号（正片帧）与实测值。
  3. 未拿到测量的审片帧列入 `readability.missingFrames`，不让 review 失败。
- `scripts/films/review.ts`：`runFilmReview` 输出新增 `readabilityWarnings`（数组）与简短的 `readability`
  摘要（测量帧数、缺失帧），`next` 文案提示逐条处理或说明理由。`stillWarnings` 行为不变。
- `scripts/films/check.ts`：静态 `small-text` 改用共享的 `minimumReadableFontSize`，行为与消息不变。

### 3.3 文档与 Skill

- Skill：`.agents/skills/axmorf-film/SKILL.md` 第 9 步与 `references/craft.md` 审片清单第 3、7 项提到
  `readabilityWarnings`（为空或逐条给出理由）；`packages/create-axmorf-studio/template/.agents/skills/axmorf-film/`
  的镜像保持逐字一致。
- `docs/TERMINOLOGY.md` 审片行、`docs/ARCHITECTURE.md` 数据流中 `film:review` 一行、`docs/ITERATION_STATUS.md`
  新增“未发布”条目（写明实际验证范围与未验证项）、`docs/ROADMAP.md` 候选项改为只剩对比度与停留时长、
  `docs/README.md` 的 promotions 导航加入本计划。
- 同时修正 ITERATION_STATUS 0.3.0 标题中的“未发布”：`0.3.0-rc.1` 已在 npm `next`（2026-10-20 `npm view` 核实，
  `latest` 仍为 0.2.1）。

## 4. 涉及文件与所有权

Codex 负责实现、测试与相关文档；Claude 负责本计划与协调报告。预计修改：

- `packages/studio/src/contracts/film.ts`
- `packages/studio/src/remotion/film/compositions.tsx`、新增 `packages/studio/src/remotion/film/review-measure.ts(x)`
- `scripts/films/media.ts`、`scripts/films/review.ts`、`scripts/films/check.ts`、新增 `scripts/films/readability.ts`
- `tests/films/` 下新增或扩展测试
- §3.3 列出的文档与 Skill（含 template 镜像）

不改：`film:deliver`、`film:check` 的错误规则、交付四文件、片头片尾、依赖与版本号、`node_modules`、公开导出面
（除 contracts 新增常量/schema/函数外）。

## 5. 实施步骤

1. 在 contracts 中加入 `minimumReadableFontSize`、测量标记常量与载荷 schema；`check.ts` 改用共享函数。
2. 实现浏览器测量模块并接入 `reviewLoader`。
3. 用一部临时片做真实 review 渲染，核实日志通道与级别，确定 `media.ts` 的参数。
4. 实现 `readability.ts`（提取、校验、规则、合并）与 `review.ts` 输出。
5. 单元测试（见 §6），更新文档与 Skill 镜像。
6. focused 检查后运行 `npm run check`；真实渲染验收后用 `film:delete --confirm-delete` 清理临时片。

## 6. 验收标准

自动化：

- `tests/films/` 新测试覆盖：标记行提取（含 ANSI 与 Remotion tag 前缀、坏 JSON、截断记录）；三条规则的正例与反例
  （阈值边界、完全在画面外不计、字幕自身不计、10% 相交边界）；多帧合并；缺失帧；`check.ts` 与 review 使用同一阈值。
- `npm run check` 全部通过（基线：2026-10-20 在 `7f324a4` 上 `npm run check` 通过，320 项测试）。

真实渲染（宿主权限直接运行，不降低 Chromium sandbox，不调用 TTS）：

- 在仓库根开发 Workspace 用临时 film（例如 `readability-probe`，无旁白）写入：一段正常大字号文字、一段字面量正常但被
  `transform: scale(0.4)` 缩小的文字、一段 SVG 小字、一段部分越出右边界的文字。运行 `film:review`：
  - 缩小文字、SVG 小字报告 `small-text`，越界文字报告 `text-outside-frame`，正常文字无警告；
  - `readability.missingFrames` 为空；联系表与单帧图片照常生成，`stillWarnings` 行为不变；
  - 同一片 `film:check` 的结果与改动前一致（静态 `small-text` 只对字面量生效）。
- `text-under-captions` 需要旁白才有字幕；本批不调用 TTS，用单元测试覆盖，真实渲染未验证要在报告中写明。
- 验收后 `film:delete --film readability-probe --confirm-delete` 清理，`git status` 只剩本计划范围内的改动。

## 7. 风险

- 日志通道依赖 Remotion CLI 的非 TTY 打印行为：已固定精确版本；用真实渲染验证，并让解析容忍前缀与颜色。
  升级 Remotion 时需复验（在代码注释和测试中体现）。
- 测量在字体或图片加载后布局变化：等待 `document.fonts.ready` 与布局稳定；图片不影响文字字号。
- 测量自身拖慢审片：每帧只遍历一次文本节点，载荷有上限。
- 误报：只给提示；规则只覆盖可以客观测量的三项，阈值沿用已有静态规则。

## 8. 后续待办（不在本批）

1. 对比度实测（文字颜色与渲染帧背景像素）与停留时长（密集采样）——ROADMAP 候选剩余部分。
2. 清理 `@axmorf/studio/contracts` 中旧主链残留（`story`、`semantic-timing`、`resource-catalog`、`scene-readability`
   等约 3 千行，多数导出在 contracts 外无引用）。会改变公开导出面，需单独确认后放在 0.3.0 正式版前。
3. 0.3.0 正式版门槛：带旁白的“升级后生产”验收、真实 Agent 宿主在 `next` 上完成一部片，然后发布到 `latest`
   （发布需要单独授权）。
4. Skill 内的短示范片（ROADMAP 候选第一项）与 TTS provider 选择说明（候选第三项）。
5. `docs/promotions/2026-10-14-direct-film-production.md` 按 docs/README 所写在 0.3.0 发布后归档。

## 9. 基线

- 分支 `axmorf/0.3.0-remove-project-chain`，HEAD `7f324a4`（`release: 0.3.0-rc.1`），工作区干净；与默认分支
  `origin/axmorf/npm-workspace-open-source`（PR #12 合并提交 `1ac6458`）内容一致。
- npm：`@axmorf/studio` 与 `create-axmorf-studio` 均为 `next=0.3.0-rc.1`、`latest=0.2.1`。
- 不提交、不推送、不发布。
