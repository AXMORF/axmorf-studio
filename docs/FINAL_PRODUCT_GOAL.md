# 最终产品目标

> 文档类型：产品目标 authority
>
> 当前实现事实见 [ITERATION_STATUS.md](ITERATION_STATUS.md)。0.2.0 起新作品使用 direct film，0.3.0 删除了
> Project production 主链（[迁移方案](promotions/2026-10-14-direct-film-production.md)）。

## 1. 产品结论

AXMORF Studio 是一个本地视频工作室：Agent 像导演兼动效设计师一样，直接用 Remotion 代码制作讲解短视频。

用户通过 `create-axmorf-studio` 建立普通 npm Workspace。`@axmorf/studio` 提供 CLI、合同、Remotion 组件、
旁白与配乐服务和交付校验；Workspace-local Skill 提供创作方法。每部作品是 `src/films/<filmId>/` 下一个
普通的 Remotion 源码目录，由 Agent 完整拥有。产品不含 Desktop、Electron、Runtime Pack 或 `rsp`。

一部片的制作过程：

1. 写剧本与配方 `film.json`（旁白分句、渲染规格、配乐编曲、发布文案）；
2. `film:voice` 生成旁白并实测时序；
3. `film:music` 按整片时长合成配乐与节拍网格；
4. 按需用 `film:asset` 准入生成图片、原创 SVG 或许可素材；
5. Agent 自由编写 `Film.tsx` 与 `Cover.tsx`，用 hook 读取时序和节拍；
6. 用 `dev` 和 `film:review` 渲染出来看，反复修改；
7. `film:check` 检查硬规则；
8. `film:deliver` 渲染并复验四个交付文件。

## 2. 设计原则

- **创作源码归 Agent**：Composition 结构、镜头、图层、转场、字幕样式都由 Agent 决定，系统只提供可选组件。
- **服务做 Agent 做不稳的事**：TTS 与实测时序、确定性配乐与节拍、素材许可、媒体编码与复验。
- **硬规则只防真实故障**：只拦截会导致渲染失败、交付不合格或许可问题的情况；审美和可读性靠创作方法、
  渲染后实测和看图回路，不用静态代理指标拦截。
- **本地单用户，保持简单**：没有任务 DAG、执行 attempt、内容寻址 artifact 或候选晋级；修改作品就是修改源码
  并重新交付，旧交付自动归档。
- **质量要看成片**：机械检查通过只说明可交付，不说明好看；审美结论来自实际观看。

## 3. 必须长期保持的产品不变量

- 只使用宿主 Node.js/npm 与 Workspace-local Remotion CLI，不使用 Docker；所有 `remotion` 与 `@remotion/*`
  使用完全相同的精确版本。Agent 不得修改 `node_modules`、package internals 或 validator 来通过检查。
- 环境由生成的 `npm run doctor` 判定是否 ready；无法通过时报告 blocker。
- 渲染期间不调用网络、Agent、Skill、MCP、Git 或目录扫描；运动只由 Remotion frame API 驱动，不使用 CSS
  animation/transition。Remotion Root 通过生成的静态注册表引用各 film。
- 所有媒体位于当前 Workspace `public/`，通过 `film:asset` 或共享素材清单登记来源与许可；未确认许可的
  音频不得进入作品。
- 旁白每句由 Agent 写定，工具不改写；每句最多 72 caption display half-units。实测 PCM samples 是时间
  authority，帧边界统一为 `ceilDiv(cumulativeSamples × fps, sampleRate)`；字幕与旁白来自同一时序。
- 配乐由配方确定性生成，导出拍、小节、段落与重音帧；有旁白时配乐在旁白下平滑压低。
- 用户明确的尺寸、横竖屏、fps、locale 写入该片 `film.json`，未指定字段继承配置，不为单次需求修改默认值。
- 交付恰好是 `video.mp4`、`cover-4x3.png`、`cover-3x4.png`、`publish.json`，见第 4 节。
- private config 与 voice profile 不进入 Git、交付或日志。
- 删除作品只用 `film:delete`，只清理该 film 自有的源码、媒体、交付与历史交付，不触碰其他作品、共享素材、
  TTS 缓存、private config 与 `public/voice_profile/`。

## 4. 交付目标

```text
deliveries/<filmId>/video.mp4
deliveries/<filmId>/cover-4x3.png
deliveries/<filmId>/cover-3x4.png
deliveries/<filmId>/publish.json
```

`film:deliver` 先在临时目录渲染，复验 H.264/AAC、声道、尺寸、fps、帧数、PNG、checksum 与 EOF decode，
全部通过后才写 `publish.json` 并替换当前交付；被替换的旧交付移入 `.axmorf/history/<filmId>/`。
任何一步失败都保留原交付不变。

## 5. 用户体验目标

- 用户只需复制 public README 的一句 Agent prompt，让 Agent 在指定路径完成 Workspace 搭建与可用性验收，
  停在视频制作之前；之后用 generated README 的视频 prompt 提交创作需求。
- 从讲解含义出发：先定整片构思和代表画面，再组织镜头、运动、阅读停留和音乐落点。
- Agent 在交付前至少看一次联系表，并在说明中指出关键画面与卡点位置。
- 修改作品只需说明要改什么，Agent 直接修改源码并重新交付；上一版交付保留在 history。
- 长片可由 Root 规划后把各 scene 文件分给子 Agent 并行编写，最终由 Root 统一审片；这是可选做法。
- Runtime 升级通过 `workspace:upgrade` 同时更新 Skill 与运行时，不改动用户作品。

## 6. 非目标

不实现平台上传、账号、远程队列或存储、常驻调度器；不实现任务 DAG、执行 attempt、内容寻址 artifact、
候选晋级、原创性指纹或静态审美/可读性 gate；不引入 Docker 或新的 TTS Gateway。
