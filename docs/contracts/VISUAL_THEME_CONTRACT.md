# Visual theme

`visualStyle.theme` 是全片背景、主文字、次文字和强调色的唯一数值来源。`artDirection.palette` 描述配色意图，
不能覆盖这些角色。品牌 Logo paths、字体、排版、动画和时间结构仍属于 immutable template source，不是配色输入。

创建输入接受 `"dark"`、`"light"` 或四个不透明六位 sRGB hex：

```json
{
  "background": "#0d1b2a",
  "primaryText": "#fffdf9",
  "secondaryText": "#bdc7d3",
  "accent": "#dfb887"
}
```

省略时，新建 Project 使用 dark。输入 preset 在 authoring schema 中解析为四角色颜色；持久化
`visual-style.json` 只保存已校验颜色，不保存第二份 preset authority。custom 与 preset 使用同一校验。
所有颜色都必须是六位不透明 hex；三个前景角色对实际背景的对比度均须至少 4.5:1，计算包含最高 8% 装饰合成下任意黑白端点及 8-bit 取整的最差范围。
计算采用 [W3C sRGB relative luminance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。
该检查在 create/revision mutation 前执行；它不检查淡入态、布局、裁剪或任意 Agent Scene 的实际可读性。

生成式 Composition 直接在完整 frame 绘制 theme.background。themed GlobalVisual task 的 base export 必须直接
返回 null，且不会被 Composition 挂载；decoration 只进入 narrated Scene 窗口，并在正文后方由固定隔离合成组限制到最高 8% opacity。
即使子节点使用不透明背景、SVG 或高 z-index，也不能提高组透明度或覆盖正文；首尾仍是准确的 theme.background。正文 Scene context
收到完整 VisualStyleSpec，Renderer 与固定首尾都从同一主题取色。Scene root 保持透明，字幕仍由 Composition 独占。
引用卡片无额外背景衬板；关注按钮以 primaryText/accent 作底、background 作字色，复用相同已校验颜色对。
themed GlobalVisual 的 AST 检查另拒绝 style/script 等注入节点、HTML 注入、JSX 属性 spread、ref/event、
浏览器全局和副作用 hooks/timers；style 对象 spread 与纯 frame 驱动 JSX/SVG 仍可用。这是受限创作合同，
不是通用 JavaScript 安全沙箱。视觉证明仍需检查实际合成结果。

theme 进入 VisualStyle fingerprint，继而进入 ProductionRevision、相关 TaskRevision 和 delivery 失效链。
copied Renderer 从 runtime 的 visualStyle.theme 取色；换主题无需改写 frozen template bytes。新模板的 adapter、
source graph 和 instance checksum 随源码修复自然变化，runtime package policy 也覆盖发行源码。

旧 VisualStyleSpec 没有 theme 时保持缺失，fingerprint 不补默认值，旧 GlobalVisual 路径保留。已有 themed Project
修订整个 visualStyle section 时必须带上原主题或有效新主题。旧 Project 含不支持 theme 的 immutable boundary
templates 时，revision 拒绝添加主题；需创建新 Project 使用新模板，不自动迁移旧副本或更改 current Delivery。

发行前分别验证配色与动画：单元测试覆盖颜色来源/对比度以及原 Logo 几何/父级裁剪；真实渲染回归覆盖深浅主题、
横竖屏、无引用/单引用/六引用/长标题链接、稳定帧、最大缩放与过渡。关键帧须实际查看；视频 EOF 解码和数值通过
不能代替视觉审查。无 provider proof 的命令和边界见 [scene-theme proof](../../proofs/scene-theme/README.md)。
