# Producer config boundary

只用于新 Project input。

- 复用默认值放 ignored `private/producer.config.json`；标题/StoryBeat/ttsChunks/视觉/发布文案放 create input。
- 明确 `render.width/height/fps/locale` 按字段覆盖，未指定省略。横竖屏换成尺寸，如16:9用1920×1080。
  不改长期设置；provider 前核对返回的 frozen render。
- 省略 `sceneTemplates` 继承 sceneDefaults；仅用户明确选择才填模板ID或null。
  absence of a request is not authorization to disable bookends。默认只影响新项目，由 project:create 复制，不手工复制或加放置兼容规则。
- 用 config helper 和 project:create；不读取/打印/复制/总结/提交 token、私有路径或受保护声纹。
  publishingCollections 按已有名称/描述选ID，不能虚构。
- CLI 派生 render/readability/provider/voice/rate/targetLoudnessLufs，不自行复刻。
  旁白分支绑定 private-safe narration-generation fingerprint；配置变化只让相关 artifacts 失效。
  authored-frames 在 provider 配置读取前走无旁白 timing 分支。
- 执行偏好仅 mode/concurrency；verified shared-workspace/controller-io 是临时宿主能力，不存配置或 content identity。
- 创建止于 configured-authoring；先报告只读 inspect 再 prepare。selected timing source 未复验前不伪造 timing-bound authoring/Revision。
- 环境诊断只查 metadata/health/ready/browser；不合成测试语音、warm provider 或降低 Chromium sandbox。
