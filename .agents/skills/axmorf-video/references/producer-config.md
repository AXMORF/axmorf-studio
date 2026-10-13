# Producer config boundary

用于新 Project input。

- 默认值放 ignored `private/producer.config.json`，本片内容放 create input。
- 明确 `render.width/height/fps/locale` 按字段覆盖，未指定省略。横竖屏换成尺寸，如16:9用1920×1080。
  不改长期设置；provider 前核对返回的 frozen render。
- 省略 `sceneTemplates` 继承 sceneDefaults；仅用户明确选择才填模板ID或null。
  absence of a request is not authorization to disable bookends；create 复制新实例，不手工复制。
- 用 config helper/project:create；不读取或披露 token、私有路径或声纹。publishingCollections 按已有名称/描述选ID。
- CLI 派生 render/readability/provider/voice/rate/targetLoudnessLufs 与旁白 private-safe fingerprint；配置只失效相关 artifacts。
  无旁白在读取 provider 配置前生成作者帧 timing。
- 执行偏好仅 mode/concurrency；verified worker transport 只属本轮宿主证据，不存配置/identity。
- 创建止于 configured-authoring；先报告只读 inspect，再 prepare；未复验不宣称 timing-bound/Revision。
- 诊断仅 metadata/health/ready/browser；不测试语音、warm provider 或降低 Chromium sandbox。
- Music: create 前合成原创 WAV/timeline，用 synthesized 冻结；composition loop 替换 Scene/模板配乐、保留音效。
  [编曲](score-arrangement.md)按题材选择。兼容 auto/selected/file 覆盖 content-window、保留模板配乐；
  省略继承设置，null 禁用配乐。prepare 前报告音乐或缺资源；发现不等于播放，不改旁白时间。
