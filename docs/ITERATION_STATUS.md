# Iteration Status

## 制作汇报提前结束修复（0.1.14 候选，未发布）

[原始事件与修复记录](evidence/v0.1.14-progress-handoff-fix.json) 记录 Hermes / Terra medium / inline
在 doctor 和 create context 成功后仅汇报方案便结束：原生 `message.complete`、`running:false` 先于控制器关闭，
没有 Project、production attempt 或成片。旧指令要求独立汇报，但未区分中间进度与结束轮次的 final 回复。
当前 CLI handoff 和仓库/creator Skill 明确汇报后同轮继续工具执行；Hermes 使用 assistant text 搭配下一次 tool call。
真实 blocker、用户暂停与已启动 native work 的 yield 保留，四文件 fixed 终态仍是唯一交付完成依据。
这只是 Agent 提示修复，没有新增生产状态或自动重试；原始失败、业务提示、宿主控制器与发布门禁保持不变。
28 项定向回归、933/933 全量测试、类型检查、lint、文档链接、包构建/检查、真实 compositions 和零 Project source gate 通过。
同一业务提示和未改动的原生控制器在全新 Workspace 使用 Terra/medium、inline 完成：6 条中间汇报，
5 个串行任务、0 子代理/派发/控制器追加提示、1 次 continuation，最终只报告一次完成。
独立 final 7/7、四文件 checksum 和视频/两张封面完整 EOF 解码通过；成片 1920×1080、30fps、1137 帧、37.9 秒。
首次标准安装的浏览器下载在 300 秒超时，失败日志保留；本轮改用公开 creator 的 no-install 流程，安装依赖后
校验并准备已有同版浏览器缓存，再经原版 doctor 六项通过。两包与 12 份指南均未改动。
因此这是汇报衔接与 inline 交付的专项回归，不替代默认并发首次使用发布 receipt；未发布 npm，未宣称完整视觉/听审或统计稳定率。

> 文档类型：current implementation authority
>
> 最后复核：2026-09-12，统一视觉主题与固定 Logo 修复已同步到 `axmorf/npm-workspace-open-source`，0.1.14 候选未发布。
> 当日复核公共 npm 两包 latest 仍为 0.1.13。用户接受时长偏差并选择 Hermes inline；横屏实测暴露的创建参数覆盖缺口已修复，完整视频复测尚未执行。

## 提示词画面参数覆盖（0.1.14 候选，未发布）

新建项目的 strict create input 支持可选 `render.width/height/fps/locale`。用户明确要求优先，省略字段逐项继承
ProducerConfig `renderDefaults`；配置文件不改写。覆盖值沿既有 RenderSpec/creation fingerprint 冻结，重复创建仍只读，
非法尺寸/帧率/locale 在创建前拒绝。既有 Project 不迁移，也未扩展 revision 的可编辑范围。
`project:create:context` 提供独立横屏示例并移除通用示例中的固定竖屏文字；CLI 返回已复验的实际 `render`，
仓库及 npm Workspace 指南要求 Agent 将自然语言要求写入对应字段，并在 provider preparation 前核对。
这不是运行时自然语言解析器，也不把文字约束本身当作尺寸 authority。

[修复验证](evidence/v0.1.14-render-overrides-fix.json) 包含 25 项定向回归、933/933 全量测试、type/lint/docs/build、
包类型/构建/检查，以及真实 compositions 和 Project source gate。原 `npm run check` 的静态阶段通过后，
因重复浏览器下载缓慢而停止该下载；剩余宿主检查使用外部 Workspace 已准备并通过 PNG 验证的同版浏览器单独通过。
首轮全量检查的 Skill 文档预算失败保留；仅精简重复文字，未修改预算或测试阈值。

新候选包通过全新 npm Workspace 的公开 CLI 验证：默认 1080×1920、本次覆盖 1920×1080、仅宽度覆盖、
仅 fps/locale 覆盖均符合预期；每组立即重复创建为只读 current，奇数宽度拒绝且无 Project-owned production 状态。
配置 bytes、254 个 runtime 文件和检查的 10 份指南保持不变。两个外部检查脚本错误（CLI schema 退出码与 bootstrap
目录占位文件）保留，未修改安装包或 validator；后者通过只读检查项目所属路径完成复核。
包内容已变化，旧候选 receipt 不能作为新包的完整验收。尚未重跑真实 Agent 完整成片，也未发布 npm 或升级原工作空间。

## 统一视觉主题与固定模板回归（0.1.14 候选，未发布）

`0.1.14` 已冻结并完成[升版工程检查](evidence/v0.1.14-engineering-checks.json)：同一完整测试集合以本机单文件并发运行 930/930，随后 type/lint/docs/build、真实 compositions、包检查和零漏洞审计通过。默认文件并发下两轮进程启动超时失败保留；未修改断言或阈值，CI 仍使用原 `npm run check`。升版后重新渲染 144 张 still 与 4 段动画，全部 PNG 与已抽检矩阵逐字节一致。真实候选双宿主已运行，发布门禁未通过；公开包复测与原本地工作空间升级制作尚未执行。

`6ffb921` 已快进推送至 npm 分支，其 [macOS CI](https://github.com/AXMORF/axmorf-studio/actions/runs/34665779028)
通过原有 repository/public package gates 和全新外部 Workspace 检查。原主 checkout 的未提交修改未动。

[Hermes inline 横屏专项实测](evidence/v0.1.14-hermes-inline-landscape.json) 使用同一候选、全新 Workspace/profile、
Luna/medium 和一条明确要求 1920×1080 的业务提示。5 个任务逐个绑定并提交，零 child、零派发、零控制器追加提示；
唯一 attempt/continuation 生成四文件，独立 final 7/7 和 EOF 解码通过。成片仍为 1080×1920、35.6333 秒，
Hermes 最终明确报告尺寸不符。时长偏差按用户要求不作为问题，inline 仅为本次 override，未改保存设置或默认发布门禁。
零派发不会满足既有 recorder 的 background delegation 断言；另记录 global task 绑定后一次越过 workspace 的 live RenderSpec 读取，
因此这里只确认串行行为与媒体检查，不能写成完整 task protocol 或默认多 Agent 首次使用验收通过。

尺寸来自创建时的 Workspace `renderDefaults`；Agent 只写入文字横屏约束，未同步实际设置。
隔离副本通过正式 Web 设置 API 改成 1920×1080 后，公开 `project:create` 正确继承尺寸；该对照零 provider、
零 production attempt，未制作横屏成片。原 Project/交付、254 个安装包文件和 12 份指南保持不变。
两个外部检查脚本的断言错误及原代码完整保留：inline 使用零 child slots，配置写入会重算 fingerprint；
仅修正外部检查，没有修改安装包、validator 或重跑实际生产。下一步需在创建前落实尺寸，并在 prepare 前复验 RenderSpec。
六帧及两张封面的抽检确认主题与 Logo 修复仍有效，同时记录正文通知标签重叠和字幕孤字换行；不宣称横屏视觉或完整听审通过。

[首轮候选实测](evidence/v0.1.14-candidate-review.json) 使用同一批 254/41 个发行文件、全新 npm Workspace 和宿主 profile、
Luna/medium、各一条普通业务提示，控制器无追加指导。两边均生成四文件并通过独立 final 7/7 与完整 EOF 解码，
各有 5 个创作 child、4 个 probe、1 次补位；四任务绑定到提交的实际重叠为 Codex 216634 ms、Hermes 172889.81 ms。
[Codex 单宿主 recorder](evidence/v0.1.14-candidate-codex-receipt.json) 通过，但提示和创建前报告要求横屏，
模型未落实 render defaults，成片实际为 1080×1920、30.9 秒；不能把机械通过写成完整需求通过。
Hermes 成片为 1080×1920、35.6 秒，Root 调用 14 次 child-list、5 次 shell sleep、10 次子任务日志读取和 3 次 steer；
三批原生通知均在首次完整交付报告之后进入模型上下文，recorder 以 `Child list polling is not native completion` 拒绝。
宿主 dispatch 提示同时禁止 polling 又推荐 list/live transcript，已保留冲突证据；模型也已完整读过 Workspace 禁令，
不能将失败归为检测误报或声称已证明唯一根因。未修改宿主、安装包、失败记录或门禁，未重跑相同候选来替换失败。

实际查看每条成片的 34 个抽样帧及两张封面，深浅主题的首尾与正文保持一致，旧 Logo/引用浅底贴片未再出现。
Hermes 第三段序号重复及孤字换行、Codex 横屏需求偏差和字幕断词均已记录；未做全帧或完整听审。
这两条实际样片均为竖屏；横屏、长引用及六引用覆盖来自下述合成矩阵。
原本地 Workspace 已完整备份，393 个非 node_modules 普通文件与备份再次匹配，安装版本仍为 0.1.13。
没有创建发布 tag 或触发 npm 发布工作流，不宣称已完成新公共包的本地制作验收。

[安装包 revision 闭环](evidence/v0.1.14-revision-closure.json) 在已完成候选 Workspace 的全新隔离副本中通过：
等价 no-op 正确拒绝，publishing.description 修改经 validate/create、inspect/prepare、唯一 continuation、
自动 promotion、手动幂等 promotion 与两次 final 7/7。新增 provider/Agent 均为 0，复用 6 个旁白缓存，
视频和两张封面 bytes 不变，publish.json 随文案修订变化；原 Workspace、安装包及指南完整哈希不变。
首个测试副本因外部控制器误将 CLI 的 agentHandoff 字段交给 strict domain schema 而在 prepare 前停止；
失败完整保留，仅修正控制器的已知输出边界并通过 23 项非生产回归后，在新副本运行上述闭环。
此脚本化修订兼容性检查不替代双宿主首次制作验收，也不宣称 Agent 修订或故障恢复已验证。

新增 [Visual theme contract](contracts/VISUAL_THEME_CONTRACT.md)：创建时将 dark/light/custom 解析为一份已校验的
background、primaryText、secondaryText、accent。Composition 实际绘制该背景，正文 task context 与固定首尾共用
VisualStyleSpec；不再以文字提示或局部白色衬板保证一致性。三个前景角色在固定 8% 装饰合成范围内须达到 4.5:1。
themed GlobalVisual base 必须直接返回 null；其 decoration 由 runtime 隔离到正文后方并限制组透明度，源检查拒绝
CSS/DOM 注入和副作用入口。该检查是受限创作合同，不宣称任意 JavaScript 的安全沙箱或任意正文视觉认证。

固定模板移除 0.1.12 引入的浅底、48px 偏移和品牌局部裁剪，保留 Logo paths、字体、布局及 frame 动画。
真实过渡帧另确认旧横版关注按钮会将完整文案挤成两行；按钮容纳和长引用间距单独修正，不缩小文字或更改 Logo。
旧 Project 的 immutable template bytes 不原地迁移；已有 themed Project 通过 revision 更新颜色，旧模板 Project
拒绝直接添加主题。theme 与相关实现通过既有 fingerprint/policy 链使受影响任务和交付失效。

[无 provider 渲染回归](../proofs/scene-theme/README.md) 使用真实 CompositionAssembly、SceneViewport 和固定模板，
覆盖深浅主题、横竖屏、0/1/6 条引用及长标题/链接。首轮实际查看发现横版长引用挤掉最后一排，机械检查未发现该问题；
失败媒体保留在本地 `out/scene-theme-proof-reference-layout-failure/`；第二轮按钮问题保留在
`out/scene-theme-proof-button-layout-failure/`，均不作为视觉通过证据。
第三轮 144 张原尺寸 still、4 个完整 360 帧动画及媒体/源码复验通过；实际查看全部 still 联系表并放大关键帧，
已确认本矩阵的引用完整、按钮单行、首尾无浅底贴片。最大 Logo 入场仍按原设计超出 SceneViewport，由既有安全区裁切，
没有恢复品牌卡片级裁剪。全量静态检查 929/929；最后按钮改动后再通过 20 项模板/编译回归、type/lint、真实 compositions、
package build 与两包 check。9 份模板发行资源与源码逐字节相同。完整边界和指纹见
[工程与视觉记录](evidence/visual-theme-20260912-review.json)。这些是合成场景的抽帧证据，不等同真实制作或逐帧播放/听审。
上述合成回归本身不调用 provider；后续候选实测见本节前文。原 Workspace 与既有交付保持不变。

## 并发交接与监督修复（0.1.13 已发布）

短 `--assignment` 由 exact attempt 的 immutable dirty task snapshots 还原 full task/binding identity；prepare/reissue 同时提供完整 worker handoff。
原 zero-write bind、active attempt、candidate isolation、checksum 与 task validators 保持强制，旧 full-identity CLI 继续可用。
首轮候选 Codex 仍省略 runtime capacity 并被旧默认放行为串行，已保留该失败证据；未验证容量改为前置阻断。
第二轮 Hermes 把 probe response 派到错误目录并误判文件隔离，Codex 首次派发又受未释放 probe 槽位影响。
后续改由 Skill helper 生成完整绝对路径与 probe prompts，固定验证临时文件，并要求原生槽位释放后再派发生产任务。
第三轮 Hermes 在四路探测/派发后被 240 对 239 帧的 authored shot 越界阻断；finalizer 隐藏具体 draft 错误导致误诊。
第三轮 Codex 成片 46.4 秒，但缺少 inspect 后、prepare 前的用户报告，独立 recorder 拒绝作为发布证据。
当前补充结构化 finalizer 诊断与严格 Agent task recovery 的下游依赖阻塞判断；失败样本仍保留，不更改安装包或旧 attempt。
第四轮 Codex 再次把报告放在 prepare 后；新 CLI handoff 在操作返回处给出实际摘要与报告次序，未知保持未知，不新增审批或持久状态。
Skill 明确单 probe 只证明 I/O 而非最大容量，并给出完整进程结果等待、wait-any 未完成集合与 Hermes native background/notify 规则。
发布 recorder 新增绑定到提交的实际任务重叠统计，并要求四并发持续时间为正；不会把 session 存活或配置上限当作实际工作并发。
这些改动降低模型的交接与等待负担，不能阻止任意宿主模型提前结束；真实 Luna/medium 双宿主验收和公开 npm 复测仍是交付门槛。

第五轮[双宿主 receipt](evidence/v0.1.13-first-use.json) 绑定相同 252/41 个发行文件：Luna/medium、各一条业务提示、零控制器追加提示、5 个创作 child、4 个 probe、补位 1。
Codex/Hermes 四任务绑定至提交的重叠分别为 67883 ms / 97396.06 ms；唯一 continuation、报告顺序、无 child polling、最终 7/7 与四文件 EOF 均通过。
[过程与视觉抽检](evidence/v0.1.13-candidate-review.json) 保留模型自行纠错、35.8/35.0667 秒时长偏差、Hermes 首尾拆分报告错误，以及封面装饰线穿过文字的视觉瑕疵；不宣称完整需求或统计稳定率。

[正式发布](evidence/v0.1.13-publication.json) 来自 `c1b67cb` 的 `v0.1.13`；CI 895 项及 package gates 通过。
首轮 npm 接收 runtime 后 registry 超过五分钟才可见，工作流保留失败；确认其 integrity 后同标签幂等流程完成 creator 发布，两包 latest/integrity 已复核。
旧 Workspace 已完整备份，当前 Workspace 已从公共 `npm create axmorf-studio@latest` 重建，private 配置逐字节保留。
[公共 npm 复测](evidence/v0.1.13-public-verification.json) 使用相同普通业务提示、Luna/medium 和零控制器追加提示。
Codex 成片 25.4 秒，真实四任务重叠 112830 ms，独立 recorder 通过；Hermes 成片 37.2333 秒，真实四任务重叠 163135.95 ms。
Hermes Root 再次调用 17 次 child-list 查询，独立 recorder 以 `Child list polling is not native completion` 拒绝通过；没有成功 receipt，也未重跑来替换失败。
另有 4 次 Hermes Root 对自己 workers 的催办，不属于控制器追加提示；监督失败的明确依据是 child-list polling。
Hermes 安装包/指南未变、原生并发、final 7/7、四文件 checksum、H.264/AAC 双声道与 EOF 均经独立诊断通过，这些不能豁免监督失败。
发布后视觉抽检记录正文文字偏暗/重叠、字幕孤字换行与时长偏差；未做全帧或完整听审。
候选第五轮通过不能替代本次公开版本的失败事实；当前不宣称双宿主完整流程已稳定通过。

## 可读性误报与默认模板对比度优化（0.1.12 发布候选）

[工程检查](evidence/v0.1.12-engineering-checks.json) 完成 874/874、type/lint/docs/build、真实 compositions、package build/typecheck/check 和零漏洞审计。
[原始问题](evidence/v0.1.12-readability-incident.json) 区分真实不合规、保守静态误报与渲染对比度问题；本次不以增加文字约束处理图形容器。

Scene validator v4 使用有界词法证明识别 JSX-only block/map 与纯图形 SVG，允许可证明数字参数的 2D translate/rotate，
包括真实 Remotion interpolate/spring 与显式 SceneRendererProps 输入；保留小字、文本缩小、未知字符串与覆盖逃逸拒绝。
字号与 transform 按实际词法绑定、style/JSX 最终覆盖顺序判断；新增 proof helper 进入 Scene policy fingerprint。
[独立复现回归](evidence/v0.1.12-readability-review.json) 确认 self-closing children 小字、后置 props spread 和 map receiver mutation 已拒绝，安全旧模板仍通过。
SVG viewBox 缩小文字与独立 CSS 3D rotate 是基线和当前都存在的覆盖缺口；不宣称通用视觉质量认证。

Scene 指南改为解释实际可读文字、可证明运动和渲染检查，纯布局/图形无需补虚拟字号。
当时固定首尾模板为深色品牌/文字添加局部不透明浅底，root 仍透明；六引用横屏仅调整排布，不缩小文字或删引用。
后续真实样本确认浅底及品牌局部裁剪造成视觉回归，当前未发布修复见本页顶部；以下保留当时抽检的范围与记录。
[模板视觉证据](evidence/v0.1.12-boundary-visual.json) 包含深浅底、横竖屏与首尾动效的 36 张真实 Remotion still；
抽检与固定组件对比度回归不等于任意正文 Scene 的视觉门禁。既有 Project-local immutable 模板和用户 Workspace 均未迁移。

首次使用验收新增独立 public-registry 模式：发布后必须实际执行公共 npm create @latest，核对 registry metadata/integrity、
creator npx 与 runtime 安装内容及 lockfile；不能把候选本地 tgz 测试替代发布后验证。

[候选双宿主 receipt](evidence/v0.1.12-first-use.json) 绑定相同 252/40 个发行文件：Codex 25.1 秒、真实 Hermes TUI 28.4 秒；
各一条业务提示、零控制器追加提示、5 个创作 child + 1 个 probe、峰值 4、补位 1、唯一 continuation。
独立 final 各 7/7，四文件 checksum、H.264/AAC 双声道与 EOF 解码通过；252 个 runtime 文件与 11 份指南均未变。
[安装包 revision](evidence/v0.1.12-revision-closure.json) 通过公开 CLI 的 no-op 拒绝、真实 publishing-only 修改、
inspect/prepare、自动 promotion、手动幂等 promotion 与最终复验；新增 provider/Agent 均 0，原 Workspace 完整哈希未变。

[Codex 全过程](evidence/v0.1.12-candidate-codex-process.json) 审阅 54 次自身原生调用及 58 个完成执行结果，
5 个创作 worker 首次通过，无校验返工；已读长等待指南后仍有少量短空等待，属于非阻断执行偏差。
[Hermes 全过程](evidence/v0.1.12-candidate-hermes-process.json) 审阅 89 次原生调用，5 个创作 worker 首次通过；
Root 有一次非 Git Workspace 上的 Git 假设错误，随后 doctor 成功。3 批原生通知均先于最终答复，原进程仅一次 600 秒等待。
未观察到 Root 越权修改 child 或安装包，不宣称全程零多余调用。
[Codex 视觉](evidence/v0.1.12-candidate-codex-visual.json) 实看 19 帧与两张封面，
[Hermes 视觉](evidence/v0.1.12-candidate-hermes-visual.json) 实看 25 帧与两张封面，所看首尾与正文无阻断性对比度、遮挡或裁切问题。
Codex 有一处完整可读但孤字换行的字幕；淡入态与稳定态分开判定。未做全帧或完整听审，成功路径未触发 terminal 自动恢复。

## Hermes TUI 监督与 revision 闭环修正（0.1.11 已验证候选）

[最终双宿主 receipt](evidence/v0.1.11-first-use.json) 已绑定同一批未修改的实际安装包：Codex 28.3 秒、真实 Hermes TUI 28.13 秒。
两边各一条普通业务提示、零控制器 follow-up、5 个创作 child + 1 个 probe、峰值 4、补位 1、唯一 continuation；
独立 final 各 7/7，exact 四文件 checksum、H.264/AAC 双声道、尺寸/帧数及 EOF 解码通过。
252 个 runtime 文件及 11 个指南逐字节未变，重新打包的 252/40 个发行文件也一致。
Hermes 的 22 次工具调用、7 条可见报告和 3 批异步通知已用原生 UI 流与数据库绑定；通知均先于最终答复，最终结果未重复汇报。

[安装包 revision 闭环](evidence/v0.1.11-revision-closure.json) 在完成 Workspace 的完整隔离副本中通过：
public context、等价 no-op 拒绝、真实 publishing-only validate/create、inspect、prepare、唯一 continuation、自动 promotion、
修改后 context/final、manual promote 幂等和再次 final。provider/Agent 新增成本均为 0，复用 6 项旁白缓存和全部创作 artifact；
原 Workspace 完整哈希未变，安装包未修改。此验证直接使用 npm public bin，不使用 source adapter 或注入 policy。

[完整复核](evidence/v0.1.11-closure-review.json) 记录 `npm run check` 846/846、type/lint/docs/build、真实 compositions、
package build/typecheck/check 全部通过。仍存在开头一次非阻塞 Git 探测，以及原 Scene owner 对动态 transform/SVG 字号的正常修正；
不宣称 Agent 全程零失败调用。两份成片已抽帧查看，部分文字与默认片尾在深色底上对比度偏弱；技术检查不等于完整视觉/听感验收。
本轮成功路径没有触发 terminal failure 自动恢复，其覆盖仍来自现有回归，而非本次真实首次制作。

修复内容：发行 Scene 指南、可执行示例、task contract 和错误反馈统一使用 `SceneRendererProps`，禁止 `useVideoConfig`；
Cover contract 明确预计算并写入静态 SVG，validator 门槛不变。Root 指南明确创建前说明片头片尾预算、inspect 后向用户报告再 prepare；
event-only 宿主依原生通知 yield/resume，所有已派发批次通知与 fixed 成功到齐后才汇报。
公开 revision context/validate/create、manual/automatic promotion 保留已验证 runtime policy manifest；
candidate GlobalVisual 类型检查与最终诊断分别显式使用 shared Workspace 的 compiler/toolchain root，同时保持 candidate source/delivery 隔离。

[旧会话复核](evidence/hermes-supervision-20260909-incident.json) 确认 0.1.10 成片成功，但同步 `hermes -z` 验收未覆盖真实 TUI 异步通知条件。
另外，`message.interim` 可见提示不完整写入 SQLite `messages`，此前仅据数据库断言“缺少用户报告”的结论证据不足，已纠正。
0.1.11 起 [首次使用门槛](guides/FIRST_USE_RELEASE_GATE.md) 要求真实 TUI 与原生 UI/DB 绑定，文档同时明确首次制作与 revision 是两类证据。

未通过的候选保持原样并保留记录：[首轮](evidence/v0.1.11-initial-candidate.json) 暴露 revision 的 `src/contracts` 扫描错误；
[第二轮](evidence/v0.1.11-second-candidate.json) 暴露 [candidate compiler root 漏传](evidence/v0.1.11-revision-compile-incident.json)；
[第三轮](evidence/v0.1.11-third-candidate.json) 在四文件生成后暴露 [末端诊断 toolchain root 漏传](evidence/v0.1.11-revision-bin-incident.json)。
最后两项均先真实 RED→GREEN，并在新包验收前完成独立 source 全链集成。未改 Hermes core、失败 attempt 或任何既有 Workspace 安装包。

## 低 token 监督与视频任务恢复（0.1.10 已发布）

仓库 Agent 规则、Skill policy v23 和 creator 模板改为原进程阻塞等待/原生事件通知监督；普通等待超时只续等，
错误时 Root 定位并指导原 executor，不读写其他 task workspace，不接管 fixed continuation。只报告一次 fixed 结果。
每个用户制作请求最多自动恢复一次已证明的 Agent-authored output fault；旧 continuation/workers 全退出后，
recover-inspect ready 才 same-Revision/零 provider reissue 到 fresh attempt/bindings/workers，复用有效产物和草稿。
底层程序、外部或未知故障只诊断报告，恢复再次失败停止。CLI gate、one-shot claim、旧 attempt 不可变与校验规则保留。
本轮是 Agent 指南/策略修改，不是新增 CLI 自动修复器。文档/兼容性测试 23 项、既有 continuation/reissue/interrupt
回归 24 项、creator package 检查、Skill 校验、链接和 scoped ESLint 已通过；8 个只读场景推演覆盖等待、返工、恢复与中断。
此前对本机旧 Workspace 的 5 个指南手动覆盖已从备份恢复；原 0.1.9 package/lockfile 和交付文件未变。
新指南仅通过正式新版本 creator 发行；当前 creator 不提供既有 Workspace 指南迁移，后续使用正式包新建 Workspace。
[首轮成片通过](evidence/v0.1.10-supervision-first-pass.json)，但人工复核发现 Codex 反复请求一秒等待，未选为最终发布证据。
指南进一步要求宿主 deadline 内最长阻塞等待，通常 30–60 秒或更长，禁止短等待循环与无变化叙述。
新包在全新 profile/Workspace 重新验收：[双宿主 receipt](evidence/v0.1.10-first-use.json) 均通过，
各 5 个创作 child + 1 个 probe、峰值 4、补位 1、Root 无 task commit、final 7/7、四文件 checksum/EOF 解码通过。
Codex 25.97 秒、Hermes 28.33 秒；252 个 runtime 文件与 11 个指南未变，零控制器 follow-up。
[原生记录复核](evidence/v0.1.10-supervision-review.json)：Codex continuation 后 3 次原进程 60 秒等待，Hermes 1 次原进程 600 秒等待，
无额外生产查询；不把这些次数换算为 token 节省比例。真实故障自动恢复尚未实测，边界仅有既有回归与场景检查证据。
完整本地 811/811、package build/typecheck、零漏洞审计与 macOS ARM64 CI 通过；CI 两包与候选的全部发行文件一致。

`v0.1.10` 从 exact commit `39edbd5` 发布；最终提交的 macOS ARM64 和 Linux 811 项全量门禁通过。
runtime 首次被 npm 接收后约八分钟才可见，超过工作流五分钟等待期限；确认 registry integrity 匹配后，同标签第二次
工作流验证并跳过已有 runtime，继续发布 creator。两个 public latest 均为 0.1.10，integrity 与 CI tarball 一致。
[公共包复测](evidence/v0.1.10-public-registry.json) 各 5 个创作 child + 1 个 probe、峰值 4、补位 1；
Codex 26.67 秒、Hermes 27.37 秒，原 continuation 成功，独立 final 7/7、四文件 checksum/EOF 解码通过。
两边安装文件与指南未变；无控制器追加指导、未观察到开发仓库或历史制作上下文读取。Hermes 成功后额外执行了三次只读 CLI 查询，
包含一次缺少 level 的调用与 help 查询，随后正确 final 检查通过；不把运行描述为零多余调用或 token 消耗确定为零。
已从公共 `npm create axmorf-studio@latest` 新建用户 Workspace `axmorf-v0.1.10`，252 个 runtime 文件与 11 个指南一致，
doctor 六项通过；旧 Workspace 保留且五处手动指南覆盖已恢复。见 [发行机器记录](evidence/v0.1.10-release.json)。

## 历史工程增量（0.1.9 已发布并完成原生 subagents 首次使用验收）

默认执行策略为 `subagents`、最大并发 4；显式 inline 偏好继续生效。发行 Skill 明确 Root 负责全局 doctor/preflight，
worker 只执行 exact bind 与 owning task 合同；每个不同 TaskRevision 必须 fresh native child/session，不得把完成的
child 通过 follow-up/resume 复用于其他任务。原生 wait-any、同步批量与异步批量通知遵守实际容量，不能回退 inline。

进程清理保留原有安全判定；当 macOS 退出组复核无法运行时，错误追加 `/bin/ps` 的固定原因与允许的 errno，
不再吞掉诊断，也不通过忽略 EPERM、放宽 sandbox 或自动重试制造成功。此前 Hermes 清理失败已复现为测试控制器
额外 `sandbox-exec` 阻止进程检查，归因与证据见 [清理复现](evidence/v0.1.9-hermes-cleanup-diagnosis.json)。
新验收使用普通宿主权限与全新 profile/Workspace，并预检 `/bin/ps`，不声称 OS 文件隔离。

[双宿主首次使用 receipt](evidence/v0.1.9-first-use.json) 绑定同一组 runtime/creator 内容：

- Codex：5 个创作 child + 1 个 probe，峰值 4、补位 1；原 continuation 成功，成片 26.83 秒。
- Hermes：5 个创作 child + 1 个 probe，峰值 4、补位 1；原 continuation 成功，成片 27.67 秒。
- 两边各 1 条普通业务提示、0 条控制器 follow-up；Root 无 task commit。两个 Root 各 doctor 1 次，worker 均为 0。
  各自 252 个 runtime 文件和 11 个指南未变；final 各 7/7，exact 四文件、H.264/AAC、尺寸/帧数/checksum/EOF 解码通过。
- 完整原生上下文与工具记录未观察到开发源码、旧会话或个人全局 Skill 读取。Codex 测试 profile 禁用个人 Skill，
  保留宿主内置/插件发现；Hermes 完整 system prompt 从原生去重表取回并复验 hash。不能把配置隔离说成 OS 文件访问隔离。

本地全量 811/811、package build/typecheck 与零漏洞审计通过；验收器严格核对 Hermes 原生 `tool_call` 转发的参数
与结果工具名后识别 `process_manage`，不豁免证据来源、唯一 attempt 或任务所有权门槛。

历史未通过运行全部保留：[首轮 TTS 阻塞](evidence/v0.1.9-candidate-blocked.json)、
[旧隔离下的运行](evidence/v0.1.9-subagents-resumed.json)、[修正环境后的运行](evidence/v0.1.9-host-corrected.json)。
后者 Hermes 成片通过，但 Codex 跨任务复用 child 且读取个人 HyperFrames Skill，不能作为本次发布通过证据。
随后新候选 Hermes 的 27.2 秒成片仅有 4 个任务，没有覆盖补位；因此另用明确三个内容段落的普通业务需求补测，
没有改包、追加技术提示或修改旧 attempt。TTS 间歇失败的上游原因仍未确定，本轮成功不代表外部 provider 永不失败。

`v0.1.9` 已从 exact commit `d12bcbd` 经 macOS ARM64 CI 与 Linux 发布工作流验证后发布；两个 npm latest 均已回读为 0.1.9。
首次发布提交被 npm 接受后延迟约九分钟才可见，超过五分钟等待期限；确认 runtime 可见且 integrity 匹配后，第二次同标签工作流验证并跳过已发布 runtime，再成功发布 creator。

公开包的 252 个 runtime 文件、40 个 creator 文件与候选逐字节一致，registry integrity 与 CI 实际 tarball 一致；gzip 归档 hash 与本地重打 tarball 不混用。
官方 registry 独立复测也已通过：两个全新 Workspace 的 Codex/Hermes 各 5 个创作 child、峰值 4、补位 1，分别交付 27.93 秒与 27.90 秒视频。
原 continuation 均成功，独立 final 各 7/7、exact 四文件 checksum 与 EOF 解码通过，安装包与指南未改。
详见 [发布后机器证据](evidence/v0.1.9-public-registry.json) 与 [完整发布记录](evidence/2026-09-08-v0.1.9-native-subagents-release.md)。

## 历史工程增量（0.1.8 已发布并完成 inline 首次使用验收）

首次用户模拟发现的输入示例、结构化错误反馈、总时长预算、安装进度与发布验收缺口已收敛为同一个补丁版本。
候选包通过隔离 Codex/Hermes 验收后，由 exact-tag CI 完成双包发布；macOS 与 Ubuntu 全量 794 项测试通过。
发布后从官方 latest 再建两个全新 Workspace，真实 Codex/Hermes 分别交付 26.9 秒与 26.87 秒视频，
原 continuation 均成功，独立 final 各 7/7、四文件 checksum/EOF、252 个 runtime 文件与 10 个指南的一致性复验通过。
两个阶段均只有普通业务提示，无后续工程指导或控制器代修。Hermes 正式包首个 create 的字段组合错误由新错误反馈引导自行修正；
成功不表示零校验错误或精确达到 30 秒。完整证据与范围见 [v0.1.8](evidence/2026-09-07-v0.1.8-first-use-release.md)。

## 历史工程增量（0.1.7 已发布并完成双 Agent 验收）

本轮已把 npm Workspace 使用中暴露的问题修正到项目源码、发行 Skill 和说明文档：

- creator 自动准备浏览器，doctor 执行真实 16×16 PNG 渲染；只读 create context 提供完整示例与 schema；
- 默认首尾模板通过真实创建与 artifact 回归；可读性诊断补齐具体文件、行列和 Agent 可修正的错误信息；
- continuation 与子进程有明确期限、所有权和错误输出；macOS 退出进程组与合法 `?E` 状态不再造成清理误报；
- public final 验证 current Revision、artifacts 和 exact 四文件，显式中断/恢复与旧 development proof 保持独立边界。

`0.1.7` 已通过 778 项测试、完整本地检查、macOS ARM64 gate、双包 npm 发布及 registry integrity 验证。
当前 Mac 从官方 latest 在 `/Users/ai/AgentWorkspace/axmorf` 新建 Workspace，真实 Codex 0.153.4 与
Hermes 0.21.0 分别交付 31.67 秒和 31.3 秒视频，固定终态均成功。两项目并发 final 各 7 项全通过；
checksum、媒体规格、EOF 解码和发行包原始 bytes 复验通过。使用侧未修改安装包、精确依赖或 validator。

该版本验收见 [v0.1.7 release](evidence/2026-09-06-v0.1.7-workspace-reliability-release.md)。
此前失败与修复证据见 [v0.1.6](evidence/2026-09-06-v0.1.6-workspace-reliability-release.md)、
[v0.1.5](evidence/2026-09-06-v0.1.5-workspace-reliability-release.md)、
[v0.1.4](evidence/2026-09-06-v0.1.4-workspace-reliability-release.md)；
具体边界见 [Workspace reliability](guides/WORKSPACE_RELIABILITY.md)。

## 当前结论

当前分支已在 Foundation 主链上实现 npm Workspace 本地 vertical slice：

- 根 package 是 `private` npm workspaces owner；`@axmorf/studio` 提供 compiled ESM public
  exports、单一 CLI、package-owned RuntimeResources、Remotion entry 和预构建 Web；
- `create-axmorf-studio` 以 same-parent staging 原子创建普通独立应用，写入精确 dependencies、marker、
  配置、宿主无关 `AGENTS.md`/Skill，并默认完成 install、lockfile、bootstrap 和 doctor；
- runtime package 现在构建 policy-covered Workspace seed：Mixkit “Movie Trailer Epic Impact” 片头两秒节选、
  Mixkit “Deep Urban” 片尾八秒节选、一个 AXMORF SVG、
  asset manifest 与默认 template audio projection。bootstrap 只创建缺失的保留路径、拒绝不同 bytes/symlink，
  随后重建 Catalog；creator 默认启用首尾 templates，Project create 把实际使用的音频冻结为 Project-local assets；
- `v0.1.3` 按用户明确发布授权把上述两个实际音频节选纳入 Git 与 npm Workspace seed；package
  manifest 记录原文件 checksum、媒体信息和 Mixkit license identity，`THIRD_PARTY_NOTICES.md` 明确它们不受
  repository Apache-2.0 license 覆盖；
- contracts 与 Remotion runtime 的 canonical source 已迁入 runtime package；Workspace 只拥有可写 Project、
  media、config、work/artifact/attempt/out/delivery，以及 catalog/registry 的薄静态 facade；
- Web 只监听 `127.0.0.1`，复用 Foundation 配置/诊断/进度 UI，新增 verified current Delivery player/covers；
  Remotion Studio 继续作为独立实时预览，Web/Studio 都不拥有创作或生产 authority；
- runtime 通过已验证的 package policy manifest 与 package resources 工作，Remotion/FFmpeg/FFprobe/Studio 均解析
  Workspace-local npm CLI JavaScript entry，不依赖 shell、PATH 或 `.bin` 路径。

当前平台策略是 Agent-first capability gate，不是固定 OS matrix：Agent 按 README 创建 Workspace、读取本地
`AGENTS.md`/Skill、准备 package 声明的 Node.js/npm 与宿主前置条件，再以 `npm run doctor` 判定当前环境 readiness。
macOS 15 ARM64 的 package/scaffold native gate 与 Ubuntu 24.04 x86_64 的 packed exact-Delivery E2E 都是
reference environment evidence，不是 runtime allowlist；其他宿主可以尝试通过同一 gate，但未经原生证据不描述为
已认证。Agent 不得修改 package internals、精确依赖、sandbox 或 validators 来强行适配。

仓库和两个 child packages 已采用 Apache-2.0；child packages 已移除 `private`、声明 public publish access，并
补齐 package README/LICENSE/third-party notices。当前公开版本是 `@axmorf/studio@0.1.10` 与
`create-axmorf-studio@0.1.10`，发布记录见上方证据。此前 `v0.1.3` 从 exact tag 通过 Trusted Publisher 纯 OIDC 发布，registry integrity 与
release candidates 一致，provenance、registry signatures 与 attestations 已由外部 fresh Workspace 复验。
GitHub 仓库已转移为 `AXMORF/axmorf-studio`，npm 发布分支是 default branch，旧 `main` 保留。production 与完整
repository `npm audit` 已通过 `fast-uri@3.1.6`、
`nanoid@3.3.18` 精确 overrides 以及 Vite/esbuild/ESLint 兼容更新归零。macOS 15 ARM64 package/scaffold evidence 与
Ubuntu 24.04 x86_64 exact-Delivery evidence 已完成，固定 OS matrix 已从首次发布 gate 移除；Organization transfer、
release blocker commits、provenance workflow、tag、双包 publish 与 GitHub Release 均已完成。转移后的 macOS full gate 又
捕获 delayed `fs.watch` notification 与 `/var` test alias 两个 portability 边界；最小修复已由 macOS gate
`#33330699611` 完整 Green。该 receipt 的解包比较继续暴露 creator 本地 pack 混入 6 个 Git-ignored template
placeholders；这些 `.gitkeep` 现作为 package source 精确 tracked，并由 `check:package` 锁定。最终 release commit 仍以
自身 macOS receipt 为 authority。exact commit `7b5fea3329d2ef5eb10f82ef67a3606ca5476bfb` 的 macOS gate、npm publish
gate 与 GitHub Release 均已完成；首次发布外部门禁归零。两个 package 的 npm Trusted Publisher 已由用户配置到
`AXMORF/axmorf-studio` / `npm-publish.yml`，publish workflow 已移除 `NODE_AUTH_TOKEN`；`v0.1.2` 已完成真实纯 OIDC
双包 publish、公开 integrity 回读和 receipt upload，不依赖人工 token。

`v0.1.1` 已把 README Agent 入口分成两个阶段：root 与两个 package README 只提供一句 prompt，
要求 Agent 根据项目最新 README 在指定路径完成 Workspace 搭建与可用性验收，并停止在视频生产之前。
creator template README 才在 ready Workspace 中提供下一次视频 prompt，并要求 Agent 读取当前安装版本的 README、
`AGENTS.md`、Skill 与按阶段 references。此前发布的 `0.1.0` tarball 保持 immutable。

仓库当前 production authority 已收敛为 ProductionRevision、content-addressed Task DAG、task workspace、
ArtifactAttestation、reusable Artifact Store、fixed convergence 与 synchronous exact four-file delivery。
当前 authoring/production 主链公开 scripts 为：

```text
project:create
project:asset:import
project:originality:freeze
project:revise:context
project:revise:validate
project:revise
project:revision:promote
project:execution:resolve
project:produce:inspect
project:produce:prepare
project:task:bind
project:task:describe
project:task:finalize
project:task:check
project:task:commit
project:task:fail
project:task:file-read
project:task:file-write
project:attempt:recover-inspect
project:attempt:reissue
project:produce:continue
```

旧 production/delivery/build command surface 与对应 active contracts/implementation/tests 已移除，不提供转发
shim。历史 `.producer-runs` 数据保持原位，但 current prepare/convergence/build/settings 不读取；删除器内部只
保留 strict ownership parser。

当前 checkout 没有 source Project 或 current Delivery，ProjectRegistry 为 0 entry；这验证了 zero-Project
bootstrap/Registry/Catalog/settings 合同。readiness、cache reuse 与 dirty task estimate 始终都不是完成证据。

当前 repository video Skill policy schema v19 / policy v23 定义了 pre-inspect external-asset Agent capability slot 与
isolated Project revision flow：外部能力只按
当前 Root Agent 的实际 callable MCP tools 激活，缺失时完全省略；激活后也必须先查本地 Catalog，再通过
`project:asset:import` 把选择准入为 Project-owned 输入。该 slot 不创建 DAG node，也不进入 child/runtime。

## 已实现 contracts 与 domain

- `ProjectCreateInput`、structured `AuthoringValidationIssue`、`ProjectRevisionInput/Context/CandidateRecord`、
  `SceneOriginalityBaseline`、`ProductionInspection`、`TaskDecisionExplanation`、`ProductionRevision`、
  `ProducerTaskSpec/TaskRevision`、`TaskExecutionContract`、`TaskWorkerBinding`、`ArtifactAttestation`、
  `ProducerPlan`、`ExecutionAttempt`、
  `DeliveryBuild/DeliveryPublish`；
- Revision/DAG/invalidation/plan pure domain；DAG cycle/duplicate/unknown dependency/stable ordering gates；
- renamed Project authoring contracts `authoring-requirements` 与 `scene-readability`，不导出旧 runtime authority；
- `production-requirements-current-v4` / `scene-composition-boundary-v2` clean-break：Composition 拥有
  raw readability policy 与 inset，SceneTask v7 只接收 Scene-only requirements 和派生的
  safe-area-local SceneViewport，ScenePackage v6 绑定 `scene-visual-runtime-v3`；
- attempt/time/path/process/explanation identity exclusion、safe diagnostic input IDs、typed artifact state、direct
  snapshot diff 与 DAG dependency propagation tests。

## 已实现 create、inspect 与 prepare

- `project:create` 从 strict repository-relative input 原子创建 configured authoring；相同 creation identity
  只读 current，existing/partial/conflicting/symlink/path escape/special file fail closed；
- create 与 revision validate/create 在 mutation 前共享 structured authoring validation；caption issue 使用
  `authoring-validation-failed` / `caption-display-budget-exceeded` / `caption-display-unit-v1`，每个 authored
  `ttsChunk` 上限 72 display half-units；
- create 同事务冻结其他 Project 的完整 Scene TS/TSX source-graph baseline；existing create 复用自身 baseline，
  legacy Project 通过显式零 provider、持锁 `project:originality:freeze` 迁移，缺失时 production fail closed；
- create 保留 authored Story/`ttsChunks`，复制 boundary template 与 sound/catalog projection，但零 provider、
  零媒体生成，且不写 narration work、artifact、workspace、attempt 或 delivery；
- `project:revise:context` 只读复验 exact current Revision 与 four-file Delivery；validate/create 使用 strict raw input，
  在 `.producer-revisions/<storyId>/<candidateId>` 隔离 source/public/narration/work/attempt/out/delivery，promotion 前不改
  live Project/Delivery；
- `project:produce:inspect` 通过 check-only ports 返回 sourceState、baseline、unknown-safe estimated cost、
  structured task explanations 与 nextAction；前后 snapshot drift fail closed，零 provider/零 repository mutation；
- `project:produce:prepare` 是唯一有成本入口，负责 provider/cache/seal/master/timing、timing-bound authoring、
  fixed artifacts、Revision/DAG、dirty Agent workspaces 与 ExecutionAttempt，并区分 estimated/actual cost；
- explanation/baseline/attempt 只属于 diagnostic plane，不改变 Revision、TaskRevision、ArtifactAttestation、
  dispatch、materialization 或 DeliveryBuild identity/authority。

## 已实现 workspace 与 Artifact Store

- `.producer-work/<storyId>/<taskRevision>` strict resolution、immutable `task.json`/context/task-contract seeds 和
  exact cleanup；TaskExecutionContract 是 attempt-neutral content input，不包含 transport/binding/commands；
- Agent task 把 canonical task-contract fingerprint 纳入 TaskRevision；这一 clean break 使既有 Agent task artifacts
  一次失效，但不改变 ProductionRevision 或已验证 current delivery；
- workspace/output path containment、regular/no-symlink、unknown/special file rejection；
- exact TaskRevision/attemptId 派生 binding ID；`task bind` 在任何 task content read/write 前执行 zero-write
  identity/attempt/checksum/contract gate，只有 `task-worker-bound` 返回 capability；
- shared-workspace 只允许 binding 返回的 relative workspace/declared files；controller-io 没有 filesystem access，
  file-read/file-write 对 logical path、symlink/special file、strict base64 body/byte cap 与 atomic replace fail closed；
- fixed check、commit-time recheck、attestation generation、same-parent staging、atomic promotion、identity conflict
  与 rollback；
- `.producer-attempts` append-only diagnostics；task/delivery terminal 使用 deterministic event key 原子
  compare-and-create，冲突不可被 projection 顺序覆盖，写入失败不污染 artifacts；
- commit/fail terminal events 与 continuation/converge 都绑定 exact attemptId，不按 latest attempt 串线；
  continuation 具有 one-shot atomic claim。

## 已实现 planning 与 task owners

- read-only current-plan builder 从 current Project contracts、template instances、asset manifest/selected bytes、narration identity 和
  runtime policies 计算 Revision/Task DAG；
- Scene、GlobalVisual、Cover workspace validators 与 commit flow；
- template-copy Scene 固定任务，不进入 Agent dispatch；共享 canonical builder/output contract 同时物化 copied
  source/assets 与完整 derived Scene bundle，并保证 create-only/fixed-prepared/materialized replan 的
  TaskRevision 稳定；
- originality baseline 只绑定 `scene-owner` TaskRevision/context，template-copy 豁免；Scene validator 拒绝 frozen
  historical graph，converge 在 materialization 前拒绝同 revision exact/normalized duplicates；
- GlobalVisual fixed layer policy 从 canonical SemanticTiming 派生：base 覆盖完整 Composition，decoration 只覆盖
  首个至末个 narrated Scene 的连续窗口并使用 window-local frame zero；生成式 Composition 分别挂载两个 no-Props
  exports，validator 拒绝 Scene output、Beat 文案和越界 continuity window；
- configured template 的 Project-local `Renderer.tsx` 实现当前 `SceneRendererComponent` viewport props，并把
  `viewportWidth`/`viewportHeight` 适配为冻结模板内部的 `width`/`height`；模板源码不拥有 SceneViewport 或
  full-frame policy，既有 Project copy 也不会被共享模板修复静默改写；
- `DefaultOutroPreview` 的 AXMORF mark/wordmark 使用同一个 responsive lockup box 居中，图标初始展开位置与
  最终组合中心在 portrait/landscape 都有确定性回归；
- Root-facing prepare 输出 stable reuse/dirty/blocked summary、逐任务 direct/dependency/artifact 解释和 dirty Agent
  TaskRevisions；
- Scene executor 继续受 Workspace-local `remotion-best-practices`、Scene-only requirements、本地
  SceneViewport、resource/license 与 Remotion runtime gates 约束；它不感知 full-frame 安全区 inset。
- execution resolver 已按用户提示词明确字段、独立 settings、内置 `subagents`/4 默认逐级解析；全新 scaffolded Workspace
  默认要求宿主提供 bounded runtime-native children 并为本次 production 验证
  `shared-workspace` 或 `controller-io` transport 时启用，最多四个。transport 不写 execution preferences，也不进入
  Revision/Task/artifact/delivery identity。
- prepare 的每个 dirtyAgentTask 返回 `bindingId`、shared/controller bind commands、describe/finalize/check/commit、
  task/fixed/spawn failure commands。describe/finalize/check/commit/authored task failure 要求 full binding；Root-only
  spawn failure 与 immutable/controller fixed failure 只持有更窄的 terminal authority，不能访问 task content。
- `AGENTS.md` 是唯一 repository Agent authority；`CLAUDE.md`/`GEMINI.md` 只导入该文件，OpenAI Skill metadata
  只提供可选 UI 展示。生产脚本不调用任何厂商 Agent SDK。
- continuation 启动后 Root 不参与 barrier；event-driven fixed continuation 读取 immutable event log，在 task
  failure 或 attempt 创建起一小时 terminal deadline 到期时直接退出，在全部成功后只调用一次 converge，fixed failure 不自动重试。Root 按 Skill 诊断，有界恢复只覆盖视频任务错误。
- terminal failed attempt immutable；`project:attempt:recover-inspect` 严格只读、零 provider，并要求 failed terminal、
  no active attempt、same current Revision、no fixed dirty/blocked。`project:attempt:reissue` 在 lock 内重检，零
  provider、不要求 current delivery，复用 valid artifacts/drafts 并创建 fresh attempt/bindings；stale/active/
  fixed-flow recovery 拒绝。

## 已实现 convergence 与 delivery

- converge 只读 replan，零 provider/workspace/new attempt；stale revision/incomplete artifact 在任何 live mutation
  前拒绝；
- task-owned staging、controlled replace、rollback 和 materialized bytes revalidation；
- ScenePackage、Coverage、RendererRegistry、GlobalVisualPackage 与生成式 Composition fixed refresh；
- build-owned staging、validated media reuse、synchronous Remotion/FFmpeg、H.264/AAC/channels、dimensions、fps、
  frame count、PNG、checksums 与 EOF decode；
- `publish.json` 最后写、exact four files、controlled current replacement 与 same identity no-op。
- candidate exact-four Delivery 完成后自动尝试 promotion；锁内复验 live base 与 expected candidate Revision/Delivery
  tuple，受控替换 source/public/narration/delivery 并刷新 Registry/Catalog。失败完整 rollback，保留 candidate 供
  `project:revision:promote` 独立幂等重试，不借 attempt reissue 修复 promotion。

## Settings、删除与 zero Project

- settings schema v5 展示 sourceState、current Revision、estimated/actual cost、逐任务 structured explanation、
  latest attempt diagnostic 和 four-file delivery；不输出 raw fingerprints/private authoring/provider data；
- 独立 `private/execution-preferences.json` 以 strict contract/`0600` 原子保存 Root inline 或 subagents 最大并发
  偏好，文件缺失时使用内置 `subagents`、最大并发 4；它不改变 ProducerConfig fingerprint，当前用户提示词 override 不自动持久化；
- source Project enumeration 不读取 historical data，也不把 output-only roots 伪装成 Project；
- deletion scope 增加 `.producer-work`、`.producer-artifacts`、`.producer-attempts`、`.producer-revisions`，继续保护 private、voice、
  shared/core 与 other Projects；
- bootstrap、Registry、Catalog 和 settings 支持 zero Project。

## 验证边界

2026-08-30 的 package 验收在仓库外使用真实 `.tgz` 完成：creator 默认流程创建 Workspace，删除并通过
`npm ci` 重装后 doctor 五项检查通过；public `/contracts` 与 `/remotion` imports、三个 Remotion compositions、
Web static/API/CSP、浏览器交互、zero-provider `project:create` 和只读 inspect 均通过。packed runtime 只含
allowlisted `package.json`/`dist/**`，CLI 保持 executable；host-neutral Skill 扫描未发现特定 Agent host、会话或
child tool 假设。

生成的 Workspace scripts 现在机械包含 inspect 前必需的 `project:execution:resolve`，并由 scaffold contract
regression 锁定。

脚手架实现提交 `2bac738d4b24745b6bd10be386257dff7c60c4d1` 已通过
[macOS npm Workspace gate #33291456702](https://github.com/agenticnoob/axmorf-studio/actions/runs/33291456702)：
`Darwin arm64`、Node `v24.16.0`、npm `11.13.0` 上完成 repository/public package gates、两个真实 tarball
pack、全新外部 Workspace 安装、doctor 五项检查、三个 Remotion compositions 与双侧 audit；下载后的两个 tarball
SHA-256 与 CI receipt 一致。artifact `9726110695` 的 digest 为
`sha256:2d0a74df869a1ec43ee294640f0bb8e0c7d8dbf7eea426d6ad80b01ab2c16b46`。

Ubuntu 24.04 x86_64 随后从新 pack 的 runtime/creator tarballs 创建 clean Workspace，完成 doctor、官方 registry
零漏洞 audit、strict Project create、execution resolve、inspect/report、provider narration、四个 bounded Agent
tasks、one-shot continuation、convergence、Remotion render 与 exact four-file Delivery。terminal 为
`project-production-complete`；H.264/AAC 1080×1920/30fps video、两张固定尺寸 PNG、checksums 与 bundled FFmpeg
EOF decode 全部通过。完整 receipt 见
[Ubuntu npm Workspace production acceptance](evidence/2026-08-30-ubuntu-npm-workspace-production-acceptance.md)。

新增 revision/originality/task-binding/reissue/GlobalVisual contracts 后，同一 Ubuntu 24.04 x86_64 宿主又从当前
snapshot 的两份真实 tarball 创建并以 `npm ci` 重装外部 Workspace；doctor、官方 registry 零漏洞 audit、public
imports、精确 Remotion 版本、packed Web HTTP 与 compositions 均通过。`ubuntu-current-features` 使用 verified
`shared-workspace`、四个 attempt-bound task bindings 和 one-shot continuation 抵达新的
`project-production-complete` exact-four Delivery。candidate promotion 与 failed-attempt reissue 在 repository
tests 中验证，本次 packed Project 没有伪造对应 runtime receipt。完整事实见
[Ubuntu npm current-feature re-acceptance](evidence/2026-08-30-ubuntu-npm-current-feature-reacceptance.md)。

2026-08-31 release closeout 从 current source 再次构建两份真实 tarball 并完成双包 publish dry-run。packed runtime
在同一外部 `ubuntu-current-features` Project 上以 `inline` 执行三个因 runtime identity 失效的 Agent tasks，复用
五个 artifacts 与两个 provider cache hits，零 provider request，one-shot continuation 抵达新的
`project-production-complete` exact-four Delivery。packed Web 的 progress/current Delivery API、Range video、双 Cover、
桌面播放与窄屏加载均通过真实浏览器验证。另一个从零消费者 Workspace 使用 creator 默认流程安装，随后以 lockfile
执行 `npm ci`，public exports、doctor、三个 compositions 与 official-registry audit 全部通过。完整 receipt 见
[npm release closeout](evidence/2026-08-31-npm-release-closeout.md)。

exact `v0.1.0` tag 已公开发布 `@axmorf/studio@0.1.0` 与 `create-axmorf-studio@0.1.0`。最终 publish gate
`#33362584883` Green；外部 official-registry creator 安装、doctor、compositions、public imports、零漏洞 audit、
250 个 registry signatures 与 47 个 attestations 均通过。首次新包写入后 packument 曾短暂 E404，后续 workflow 已增加
bounded registry visibility retry，并将 checksum receipt 改为 portable basename。

exact `v0.1.1` tag 随后公开发布当前 `@axmorf/studio@0.1.1` 与 `create-axmorf-studio@0.1.1`。该版本把
AXMORF-owned 首尾音频与品牌素材纳入 policy-covered runtime Workspace seed，creator 默认启用首尾 templates，
Project create 把实际使用的音频复制为 Project-local resources。macOS exact-commit gate `#33627797623` 与纯 OIDC
publish gate `#33628246765` 均 Green；official-registry fresh creator 安装、doctor、零漏洞 audit、250 个 registry
signatures 与 49 个 attestations 全部通过。完整事实见
[v0.1.1 shared Workspace media release](evidence/2026-09-02-v0.1.1-shared-workspace-media-release.md)。

exact `v0.1.2` tag 修复 System 首尾预览的 audio projection 默认值：`DefaultIntroPreview` 与
`DefaultOutroPreview` 现在从 package-owned manifest 解析并挂载共享 WAV，不再生成只有静音 AAC 的 MP4。macOS exact
release gate `#33663623305` 与纯 OIDC publish gate `#33664081626` 均 Green；显式锁定 official registry 的 fresh
Ubuntu creator Workspace 已复验 Studio 两条未静音 audio element、WAV HTTP 206、两个 H.264/AAC render 的实际音量、
零漏洞 audit、250 个 registry signatures 与 49 个 attestations。完整事实见
[v0.1.2 System preview audio release](evidence/2026-09-03-v0.1.2-system-preview-audio-release.md)。

exact `v0.1.3` tag 把当前项目配置的 Mixkit 片头 impact 两秒节选与片尾 “Deep Urban” 八秒节选作为
policy-covered Workspace seed 发布，并让 root factory 接收 Workspace-local audio projection。Studio 在 root mount 时
预取两条音频，preview 使用 `preload="auto"` 与 `pauseWhenBuffering`。纯 OIDC publish gate `#33971031243` Green；
official-registry empty-cache fresh Workspace 已复验精确音频 checksum、doctor、compositions、两段非静音 H.264/AAC
render 和真实浏览器首响延迟。完整事实见
[v0.1.3 Mixkit bookend audio release](evidence/2026-09-05-v0.1.3-mixkit-bookend-audio-release.md)。

用户明确授权后，受控 Project delete 又在上述真实 production Workspace 的一次性副本执行。缺少
`--confirm-delete` 时命令 exit 1 且 Delivery checksum 不变；exact confirmed command 清理 source/public/narration/
work/artifact/attempt/delivery ownership roots，Project Registry 归零，同时保留 package/lockfile、private config、
Agent instructions、共享 Catalog 资源和 Workspace entry。删除后的 doctor、三个系统 compositions、Web root 与空
progress API 均通过；原验收 Workspace 与 exact-four Delivery 未变。

closeout 同时修复了 packed Web 暴露的三个 release blocker：progress projection 现在携带 package runtime policy
manifest；三秒轮询会合并仍在执行的请求，不再反复 abort 较慢的只读 inspect；Delivery Range stream 在正常结束、
错误与客户端中止时都显式关闭 `FileHandle`。对应 server/UI/`/proc/self/fd` regression 已加入完整 gate。

本轮同时修复了 packed boundary 暴露的四个问题：scaffold execution resolver 缺失、bundled FFmpeg 不提供 raw
`s16le` muxer、scaffolded `remotion.config.mjs` 未进入 Workspace configuration snapshot，以及 EOF decode 默认选择
缺失的 `wrapped_avframe` encoder。音频现在经 PCM WAV 解码后由 Node 重建 canonical WAV；video/Cover decode
显式选择 bundled `rawvideo`/`pcm_s16le` encoders；Workspace 必须恰有一个受支持的 `.mjs` 或 `.ts` Remotion config。

未认证宿主仍按 capability gate best-effort 接入，不预先阻塞，也不描述为已验证支持。consumer production 与完整
repository audit 均为 0 finding。Remotion 继续精确锁定 4.0.489；安全处置没有运行不受控 `audit fix`，而是固定
传递版本并单独升级兼容的开发工具。ESLint 保持 9.39.5，因为 Remotion 当前内置的 TypeScript ESLint 8.21 peer
range 不支持 ESLint 10。Git push、GitHub Organization transfer、exact tag、双包 npm publish 与 GitHub Release 已执行。
post-transfer macOS gate 的两个 portability 修复已完成本地 package/fresh-consumer/packed-production/Viewer/delete
复验；creator ignored-placeholder 污染已在 package boundary 修正，最终 exact release commit 的 macOS gate
`#33331148535` Green，Linux/macOS 双包 tarball 逐字节相同。

focused create/contracts/explanation/inspect/prepare/converge/settings/E2E tests 已验证原子 create、inspect
零写入/零 provider、dirty-only dispatch、精确 direct/dependency/artifact explanation、诊断隔离、安全边界、
历史隔离、current no-op 与 delivery failure reuse。

本轮 closeout 已运行完整 `npm run check`：666/666 tests，以及 typecheck、lint、docs links、Catalog/Registry、
配置构建、Remotion bundle/compositions 与 host Project gate 全部 Green；`npm run packages:typecheck` 和 release-focused
17 tests 与 macOS portability-focused 22 tests 也通过。文档 closeout 后另行重跑 docs links 与 diff checks。GitHub
Organization transfer、default branch 切换与 publish workflow 已执行；post-transfer portability 已有 Green receipt，
creator placeholder package boundary 进入最终 exact-commit gate。push 后同时发现并修复 publish workflow 的 job-level
`runner.temp` context 解析错误；`v0.1.0` npm publish、tag 与 GitHub Release 已完成，最终 publish/integrity gate
`#33362584883` Green。受控 Project delete 只作用于一次性验收副本。

## 当前非目标

远程 scheduler/database/artifact store、平台发布、账号、上传、child identity persistence、subjective quality
gate、automatic capability promotion、Docker 和新的 TTS Gateway 均未实现。
