# Producer config boundary

New Project input only.

- 复用默认值保存在 ignored `private/producer.config.json`；title、StoryBeat、`ttsChunks`、视觉方向、发布描述属于 create input。
- Explicit user `render.width/height/fps/locale` overrides defaults per field. Omit unspecified fields.
  Convert orientation to dimensions, e.g. 1920×1080 for 16:9 landscape. Keep saved settings unchanged;
  verify the returned frozen `render` matches the request before provider preparation.
- Omit `sceneTemplates` to inherit `sceneDefaults`. Only explicit user choices permit template IDs or
  `null`; absence of a request is not authorization to disable bookends. Defaults affect new Projects; `project:create` copies templates.
  Never hand-copy templates or add placement compatibility rules.
- 使用 config helper 与 `project:create`；禁止读取、复制、打印、概述、暂存或提交 token、私有路径、受保护声音素材。
  按名称/描述选择已有 `publishingCollections` ID，不得虚构。
- CLI derives resolved render, readability, provider/voice identity, speech rate and `targetLoudnessLufs`.
  Do not reproduce derivations. ProductionRevision binds a private-safe narration-generation fingerprint;
  config drift changes content identities while unrelated valid artifacts remain reusable.
- execution preferences 只存 mode/concurrency；已验证的 `shared-workspace`/`controller-io` transport 是临时宿主证据，不进入配置或内容身份。
- Music: 从 `backgroundMusic.candidates` 按主题/情绪选循环曲，create 传 `{mode:"selected",resourceId,volume?}`；
  省略继承 auto/file/null（auto 按 brief 选），`backgroundMusic:null` 禁用配乐。prepare 前报告 create 选曲或缺资源。
  全片持续循环并抑制 Scene 配乐，旁白/音效独立。发现资源不代表已配乐。
- Narrated create 为 configured-authoring；visual create 写真实 authored timing/null manifests，零 provider。先报告 inspect 再 prepare；不伪造 PCM。
- 环境诊断只查 metadata、health/ready、browser；禁止测试语音、provider warm-up 或降低 Chromium sandbox。
