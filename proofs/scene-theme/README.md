# 固定模板视觉主题回归

这个 synthetic proof 直接导入 current `AxmorfIntroScene` / `AxmorfOutroScene`，使用真实
`CompositionAssembly`、`ThemedGlobalVisualBackground`、`SceneViewport` 和由 production policy
计算的 1740×630 / 900×1470 内容区。
它不创建 Project，不调用 provider，不生成旁白，也不修改任何既有 Delivery。

## 运行与复验

从仓库根目录运行；首次真实浏览器渲染必须使用宿主权限，不降低 Chromium sandbox：

```sh
node --import tsx scripts/proofs/scene-theme/render.ts render
node --import tsx scripts/proofs/scene-theme/render.ts check
```

若宿主已有 Remotion 兼容的 headless-shell，可显式设置
`SCENE_THEME_PROOF_BROWSER_EXECUTABLE=/absolute/path/to/chrome-headless-shell` 再运行 `render`，
正常复用既有浏览器而不复制或改写依赖。未设置时由 Remotion 准备浏览器并显示下载进度。
manifest 的宿主诊断会记录实际浏览器版本与 executable checksum；`check` 使用清单中的同一
浏览器路径核验环境，不启动浏览器页面。这些事实不进入任何 production identity。

需要仓库精确版本的 `remotion` / `@remotion/bundler` / `@remotion/renderer`，以及宿主 FFmpeg、
FFprobe 和可用 Chromium。渲染入口会拒绝 Remotion 版本不一致；`check` 不启动浏览器，但会重新
计算 transitive source graph 与媒体 checksum，检查 PNG 尺寸、视频帧数、H.264 和 EOF decode。
正文压力帧另检查角落像素符合固定 8% 黑/白合成结果，并确认三种语义文字仍有未被装饰改色的像素。
这些像素检查不代替实际视觉评审。

全部输出写入 ignored `out/scene-theme-proof/`。`index.html` 是本地浏览索引；`manifest.json`
记录实际 source files、source fingerprint、依赖版本、宿主、主题、帧号、尺寸与每个媒体 checksum。
源文件在渲染期间变化会拒绝写入新 manifest。重跑会覆盖这个 proof 自己的产物。

## 固定矩阵

- dark / light × 1920×1080 / 1080×1920，共 4 个 Composition。
- 每个包含 60 帧片头、60 帧固定正文、240 帧片尾，30 fps。正文使用主题文字与压力装饰，
  Composition 的底色全程是同一 `theme.background`，decoration 仅在正文窗口出现；
  使用真实 runtime 容器执行限幅和层级隔离。
- 每个输出 36 张原尺寸 PNG，共 144 张，另有一个保留全部 360 帧的 H.264 视频；
  视频分辨率为 0.5 倍以减少渲染成本，没有抽掉帧。
- Intro 局部帧：0、9、10、18、24、34、45、59。正文：0、19、20、39、40、59。
  正文装饰分别用不透明白色、黑色和高 z-index 子层/SVG 黑白混合填充，检查 runtime
  装饰容器的 8% 最坏合成边界、层级隔离和正文可见性。
- Outro 局部帧：0、54、88、103、104、111、119、120、122、132、146、165、180、214、220、239。
  包含引用淡出、120 帧 handoff、最大 Logo 缩放、收缩、wordmark、点击和尾部稳定态。
- 引用覆盖 0 条、1 条长标题与长 URL、6 条混排；6 条用于完整动画，另两种在
  88、104、119 帧验证稳定态与淡出。

## 视觉检查边界

机械验证结果始终标为 `rendered-review-required` / `visualReview: not-recorded`。
颜色对比度和视频解码成功不能证明没有裁剪、布局溢出或白色贴片感。发行前须实际查看全分辨率
关键帧，并播放 4 个视频，检查 Logo 的最大放大与收缩、引用换行、品牌文字和按钮、整片背景连续性。
视觉结论需在发行记录中引用当前 source/evidence fingerprint；工具不代签人工通过。

这些证据仅覆盖固定模板及合成正文，不等同真实 Project 制作、旁白、音频或 Delivery 验收。
品牌字体遵循模板的既有字体栈，实际字体依赖渲染宿主，换宿主必须重新做视觉检查。

Node API 选项依据仓库安装版本与 Remotion 官方
[renderStill](https://www.remotion.dev/docs/renderer/render-still)、
[renderMedia](https://www.remotion.dev/docs/renderer/render-media) 和
[openBrowser](https://www.remotion.dev/docs/renderer/open-browser) 文档。
