# 本地制作配置

> 文档类型：操作指南
>
> 最后复核：2026-08-22

仓库使用一份 Git-ignored 的 `private/producer.config.json` 作为制作默认值与私密 TTS 连接配置。
它不是 render runtime 输入；`project:create` 把新作品的选择写入 Project contracts，后续
ProductionRevision 只绑定 private-safe provider/voice/policy identity。因此修改全局配置不会静默改变
已配置 Project，也不会把 secret 放入 artifact。

本指南描述 current repository 配置。Desktop App 目标中，现有页面演进为 App Settings：用户只配置一个
Workspace Root，公开 defaults 由 App/Project settings 管理，credential 使用 macOS Keychain/Application
Support，不写入 Agent 可见 Workspace；App 再通过 `rsp context` 投影脱敏任务配置。该迁移尚未实现，不能提前
改变本指南的 current 路径和命令。目标 authority 见 [Desktop App 产品架构](../DESKTOP_APP_PRODUCT.md)。

`.env.example` 可以直接复制为 `.env`：

```bash
cp .env.example .env
```

示例默认使用 `private/producer.config.json`；相对路径以仓库根目录解析，也可以填写绝对路径把
配置放到其他位置。配置页、Narration、project-production preflight 和迁移命令都会自动读取仓库根目录
`.env`。同名 Shell 环境变量优先于 `.env`；两者都未设置时仍使用上述默认路径。

## 打开配置页

```bash
npm run dev
```

- `http://127.0.0.1:3100`：制作配置；
- `http://127.0.0.1:3101`：Remotion Studio 预览。

两者由同一个本地开发命令启动，不是两个需要部署的产品。配置 API 只监听 loopback、拒绝非同源
写入、使用 `no-store`，不把配置写入 localStorage。TTS token/API key 只在受控表单内完整返回以便修改；
不得通过截图、日志或 Git 泄露页面内容。

左侧“制作进度”列出 current source Projects；选择后展示 current Revision、task reused/dirty/blocked、
latest ExecutionAttempt diagnostic 和 four-file delivery，每 3 秒只读刷新。页面不执行 production、不读取
日志/PID，也不扫描历史执行数据。只有 `publish.json` 与 exact 四个 regular files 的 identity、size、
checksum 和 media facts 完整一致才显示 current。

Project 详情提供删除入口，必须输入完整 Project ID 二次确认。页面调用与 `project:delete` 完全相同
的删除器：删除该 Project 的代码、媒体、narration work、task workspaces、artifacts、attempts、legacy
history、out 与 current delivery，
随后重建 Catalog/Registry；其他 Project、private config 与 `public/voice_profile/` 不受影响。
非同源请求、非空 delivery staging、writer lock、不安全路径或不存在的 Project 会在删除前被拒绝。
prepare/convergence、Project create/import 或交付构建正在改变仓库时，删除也会通过共享 operation lock 拒绝执行；删除在
持锁后会重读目标集合，并在删除源码前先发布排除目标的 Registry，避免预检与实际清理之间混入新的
task 或产物，也避免 Remotion Studio 因短暂的旧 import 终止配置 API；后续删除报错时会按磁盘真实
状态恢复 Registry/Catalog。若浏览器连接仍在请求中断，页面只提示“删除结果需确认”，不会把无法
确认的网络状态误报为删除未完成。

“Agent 执行”设置独立保存到 Git-ignored 的 `private/execution-preferences.json`，使用 strict contract、
原子替换和 `0600` 权限。该文件不是 ProducerConfig，也不改变 ProducerConfig、Revision、TaskRevision、
ArtifactAttestation 或 DeliveryBuild identity；文件不存在时内置使用 `inline`，一个 shell-capable Agent 即可
串行处理 dirty workspaces。只有宿主确实提供 runtime-native children 时才选择 `subagents` 并设置最多四个
并发。用户提示词中的本次 override 优先于已保存设置，但不会自动写回；无法满足明确容量要求时在 prepare
前阻塞，不回退或伪造 child execution。

右侧“只读环境诊断”检查配置、默认声线来源与 Remotion browser preflight。VoxCPM 继续检查
health/ready/info；SpeechSDK 与 Edge 只做 strict config/profile 校验，并明确显示“凭证/网络将在真实生成
时校验”。它不生成测试语音、不 warm-up 服务、不产生云端费用、不弱化 Chromium sandbox。表单会
为新增 provider/声线选择未占用 ID；切换或删除默认项时立即选择仍有效的 default，最后一个 provider、
最后一条声线、重复 ID、空 secret 或跨 provider 默认声线都会 fail closed。

可信局域网内需要其他设备直接访问时运行：

```bash
npm run dev:lan
```

该命令让配置页监听 IPv4 所有网卡，并强制 Remotion Studio 使用 IPv4；使用命令输出的本机
Network IP 分别访问 `http://<LAN-IP>:3100` 和 `http://<LAN-IP>:3101`。配置写入仍要求 Origin 与
实际 Host 完全一致，页面中的 Studio 链接会沿用当前主机名。由于配置 API 会完整返回 TTS secret，
LAN 模式只适用于用户已确认可信的局域网，禁止端口转发到公网。

首次从旧版 VoxCPM 私有配置迁移：

```bash
npm run config:migrate
```

命令读取旧 `voxcpm/voxcpm.private.json`，原子写入权限 `0600` 的新配置，不删除旧文件、不打印
token 或私有声线路径。位于仓库内的声线输入会转换成仓库相对路径；仓库外声线必须先由操作员移入
ignored 的仓库目录，否则迁移 fail closed。目标文件已存在时命令会拒绝覆盖；迁移后应在页面中
补充准确的合集名称/描述。

已有合法 `producer-config-v1`、`producer-config-v2` 与 `producer-config-v3` 会先校验各自原 fingerprint，
再只在内存中升级为 v4；v1 同时补入原既定默认 Scene 选择，v3 云声线补为显式 `catalog` 来源。
GET 和环境诊断不会改写私有文件；操作员在配置页确认并保存后才原子写入 `producer-config-v4`。
fingerprint 不匹配、未知字段或结构
无效的旧配置仍然 fail closed。

## 配置语义

- `sceneDefaults.introSceneTemplateId` / `outroSceneTemplateId`：配置页中的首尾业务位置选择。两者都
  接受任意已登记 Scene template 或 `null`，不做位置适配判断；同一 template 可同时选择两次。
  该选择只在新 Project 首次 `project:create` 时使用。create 会生成并冻结 Project-local Renderer adapter；
  adapter 接收 `viewportWidth`/`viewportHeight`，再把本地尺寸映射给模板组件的 `width`/`height`。共享模板、
  generator 或 preview 的后续修复不会自动迁移既有 Project copy。
- `renderDefaults`：新 RenderSpec 的 width/height/fps/locale；页面用一个“画面尺寸”下拉同时设置
  width/height，提供 9:16、16:9、4:5 与 1:1 四个常用规格；没有目标时长。
- `readability.edgeInsetPx`：以 1080 短边为基准的 Scene 边缘留白。字幕底边 = 缩放后边缘留白 × 2；
  Scene 底边 = 字幕底边 + 字幕盒高度 + gap，再向上取整到 10px。RenderSpec 不再保存字幕安全区。
  该值由 Composition 拥有的 readability policy 解析成 full-frame inset；Scene task 只收到派生的
  safe-area-local SceneViewport width/height/min font size，不需要、也不允许重复计算裁剪区域。
- `publishingCollections`：有稳定 ID、名称和适用描述的数组。Agent 必须选一个最合适的已有合集；
  PublishingIntent v2 封存所选 ID/名称及当时的合集目录 fingerprint。
- `tts`：稳定的通用边界。`speech.rate` 在 provider 返回后、PCM 实测前处理并进入 provider-attempt
  fingerprint；`speech.targetLoudnessLufs` 进入两遍 loudnorm mastering policy 和母带 fingerprint。
- `tts.providers[].kind = "voxcpm"`：当前 VoxCPM 适配器。可控克隆 POST `/clone`；高品质克隆
  POST `/clone_with_prompt`。`mode` 只在适配器内部选择请求结构，不作为 form 字段发送。
- `tts.providers[].kind = "speech-sdk"`：`connection.apiKey` 是用户自己的 BYOK key；`baseUrl` 可空，
  非空时只传给所选 direct factory；MiniMax 另可配置 factory 支持的 `groupId`。仓库不使用
  Speechbase/托管网关、字符串模型路由、跨 provider fallback 或常驻 TTS 进程。voice profile 的仓库
  `id`、云端 `voiceId` 与 `source`（厂商预置、远端克隆或远端设计）分开保存，Project 继续只绑定稳定
  仓库 ID。实际开放 Cartesia、Deepgram、ElevenLabs、Fish Audio、Gradium、Hume、Inworld、MiniMax、
  Mistral、Murf、OpenAI、Resemble、SmallestAI、Speechify 与 xAI；没有 Key 的厂商只有源码和 mock
  验证，不声称线上实测。`remote-clone`/`remote-designed` 只声明已在厂商侧存在的 voice ID 来源；
  narration generation 不创建、覆盖或删除远端声线，避免隐式计费、授权与生命周期副作用。
- `tts.providers[].kind = "edge-tts"`：无需 Key，固定使用 Microsoft Edge Read Aloud consumer endpoint
  与远端 voice ID/locale。配置页只允许从当前 adapter 元数据核验过的 14 个中文声线中下拉选择，
  locale 随声线自动绑定；目录外 ID 和不匹配 locale 会被合同拒绝。它是 MIT
  `node-edge-tts@1.2.10` 封装的非官方客户端协议，不是 Microsoft 对外承诺 SLA 的公共 TTS API；
  依赖互联网，协议与声线目录都可能由上游改变。
- SpeechSDK 当前固定官方开源包
  [`@speech-sdk/core@0.27.0`](https://www.npmjs.com/package/@speech-sdk/core/v/0.27.0)，许可证为
  Apache-2.0；direct factory 与 auto-chunking 行为以
  [Jellypod-Inc/speech-sdk](https://github.com/Jellypod-Inc/speech-sdk) 对应发布源码为准。该版本会在
  超过 model `maxInputChars` 时自动拆分；
  因此 adapter 按 registry 中每个 vendor/model 的保守上限和方括号 audio tag 先 fail closed，固定 `maxRetries=0`，
  不传 timestamps、volume/output/speed/chunking 选项。Fal 因生成后还会请求 CDN 音频、Google 因缺少
  音频时可能改写输入再请求、Gateway 因托管路由语义而不开放。Edge 对 escaped UTF-8 文本执行 4096
  bytes 上限并一次发送。每个 authored ttsChunk 恰好调用一次合成请求；
  SDK 返回音频仍由仓库 `normalizeProviderAudio`、canonical PCM/checksum/seal/mastering 与
  `pcm-cumulative-ceil-v1` 掌握 authority。
- 声线的 `referenceAudioPath`、`promptAudioPath` 和 `promptTextPath` 只保存仓库根目录相对路径，
  例如 `voxcpm/voice_profile/my-voice.wav`；绝对路径、反斜杠、URL 与 `..` 逃逸均被拒绝。Narration
  和 preflight 在进入 VoxCPM 适配器前统一解析为宿主绝对路径，配置页保存的仍是相对值。
- `audioDefaults.globalBgm`：可为空，或保存一个仓库相对 `sourcePath` 与 0–1 线性 `volume`。这是
  配置页中的本地 BGM 预设。`project:create` 会复制并 checksum-bound 到 Project-local 资产，
  写入 `sound.json`；render runtime 将它作为循环 contribution 播放于 narrated 内容窗口，并保留独立音量。
  选择该本地文件即由 operator 声明其有权用于当前 Project；冻结的 manifest 记录这份 operator-provided
  授权证据，runtime 不接受 URL、symlink 或未封存字节。

`RSP_PRODUCER_CONFIG` 支持仓库根目录相对路径和绝对路径。生产脚本、preflight、迁移命令与配置页
使用同一解析规则。

## 创建新 Project

先 author 一个 strict `ProjectCreateInput`，其中包含 storyId、VideoBrief、narrated StoryBeat 与 exact ordered
`ttsChunks`、VisualStyle authored fields、GlobalVisual brief、Scene creative briefs、resource/render/publishing/
production choices 和 optional boundary template selections。input 必须位于 repository 内的 regular
no-symlink JSON；不能包含 derived fingerprint、absolute/private path、provider secret 或 runtime output。

```bash
npm run project:create -- --project <storyId> --input <repository-relative-json>
```

creator 从一次 ProducerConfig 读取派生 `narration.json`、`render.json`、`publishing-intent.json`、sound、
requirements、Project ResourceCatalog 与 configured template instance。合集必须且只能选择当前数组中的一个
ID；完整数组 fingerprint 被保存。选定普通 Scene template 的源码/资源会复制到 Project-local roots，并把
对应 silent StoryBeat 写入时间线首尾；`null` 表示不插入。Project 一旦创建，后续修改全局 defaults/shared
template 不会静默改变它。

transaction 先在受控 staging 生成并严格解析 exact set，再原子提升 source/public/catalog roots；任一步失败
恢复创建前 filesystem。existing、partial、different identity、cross-project、unknown source、symlink、path
escape 或 special file 都在覆盖前 fail closed。相同 creation identity 再次运行只读返回 current，不改 bytes/
mtime。create 不调用 provider、不生成媒体，也不写 `.narration-work`、artifact、workspace、attempt 或 delivery。

create 返回 `configured-authoring` 和 `prepare-narration`；timing-bound SceneProductionBrief 以 story-owned
pending authoring 保持 authored values，不填 placeholder fingerprint。只有 verified PCM/timing 后，fixed prepare
才绑定真实 timing。Project-local media 必须在 Project root 成功创建后通过 `project:asset:import` 导入；不跨
Project 复用旧 manifest 或媒体。

`project:produce:inspect` 只读估算同一配置解析结果的 narration cache/cost；Root 报告后，
`project:produce:prepare` 才可读取 private-safe narration generation fingerprint 并触发真实 preparation。generation
在 provider request 前重算并比较；mastering 只读取已绑定的 LUFS policy。provider、connection、voice、
生成参数、speech rate 或 LUFS 变化创建新的相关 TaskRevision，但不使无关 Scene/GlobalVisual/Cover
artifact 失效。Revision/task inputs 只含 ID、数值 policy 和 fingerprint，不含 token/API key、URL、
绝对路径、声线内容或 transcript。
