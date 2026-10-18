# 本地制作配置

> 文档类型：操作指南
>
> 最后复核：2026-10-19

Workspace 用一份 Git-ignored 的 `private/producer.config.json` 保存制作默认值与私密 TTS 连接配置。它不是渲染输入：
`film:new` 把渲染默认值和片头片尾选择写进新作品的 `film.json`，`film:voice` 读取默认声线与 TTS 连接。修改配置
不会改变已经创建的作品，也不会把 secret 写进作品、缓存 identity 或交付。

`RSP_PRODUCER_CONFIG` 可以指向其他位置（Workspace 相对路径或绝对路径）；`.env.example` 可复制为 `.env` 使用。
同名 Shell 环境变量优先于 `.env`；都未设置时使用 `private/producer.config.json`。

## 打开配置页

```bash
npm run dev
```

- `http://127.0.0.1:3100`：Web 控制中心（作品、通用、片头片尾、TTS 与环境诊断）；
- `http://127.0.0.1:3101`：Remotion Studio 预览。

“作品”页列出 `src/films/` 下的作品、旁白与配乐状态，并预览当前交付的视频和两张封面；删除作品需要输入完整的作品
ID，效果与 `film:delete` 相同。配置 API 只监听 loopback、拒绝非同源写入、使用 `no-store`，不把配置写入
localStorage。TTS token/API key 只在受控表单内完整返回以便修改；不得通过截图、日志或 Git 泄露页面内容。

右侧“只读环境诊断”检查配置、默认声线与 Remotion 浏览器渲染。VoxCPM 检查 health/ready/info；SpeechSDK 与 Edge
只做配置校验，并说明凭证和网络在真实生成时才会验证。诊断不生成测试语音、不 warm-up 服务、不产生费用、不降低
Chromium sandbox。

可信局域网内需要其他设备访问时运行 `npm run dev:lan`：配置页监听所有 IPv4 网卡，写入仍要求 Origin 与 Host
一致。由于配置 API 会完整返回 TTS secret，LAN 模式只用于用户确认可信的局域网，禁止端口转发到公网。

## 配置语义

- `renderDefaults`：新作品的 width/height/fps/locale。用户为单个作品指定的尺寸与 fps 由
  `film:new --width/--height/--fps` 写进该片，不改这里。
- `sceneDefaults.introSceneTemplateId` / `outroSceneTemplateId`：新作品的片头片尾。目前可选
  `axmorf-brand-reveal-v1`（片头）与 `axmorf-source-follow-v1`（片尾），`null` 表示不加。`film:new` 把选择写入
  `film.json.bookends`；已有作品可直接改自己的 `bookends`。
- `tts.defaultProviderId` / `defaultVoiceProfileId`：`film:voice` 使用的 provider 与声线。
- `tts.speech.rate`：provider 返回后、PCM 实测前的语速处理。
- `tts.speech.targetLoudnessLufs`：旁白两遍 loudnorm 的目标响度。
- `readability`、`publishingCollections`、`audioDefaults`：旧 Project 链使用的字段，为兼容既有配置继续保留，
  direct film 不读取。

## TTS provider

- `kind: "edge-tts"`：无需 Key，使用 Microsoft Edge Read Aloud 的 `api.msedgeservices.com` endpoint，只允许
  adapter 已核验的中文声线，locale 随声线绑定。它是 MIT `node-edge-tts@1.2.11` 封装的非官方客户端协议，没有
  SLA；协议与声线目录可能由上游改变。adapter 向客户端传递宿主的 HTTPS/HTTP 代理环境变量并遵守 `no_proxy`；
  代理不进入任何 fingerprint，也不记录代理 URL 或凭证。同一 adapter 串行发送真实请求，前一次结束后至少间隔
  10 秒，首句和缓存命中不等待；失败立即停止排队请求，不自动重试。10 秒是缓解初值，不保证避免所有 429。
  stderr 的 `edge-tts-request` JSON 只含时间、句子 ID、代理/直连标签、耗时和固定状态，见
  [诊断记录](../evidence/2026-10-15-edge-tts-pacing.md)。
- `kind: "speech-sdk"`：用户自己的 BYOK key（`connection.apiKey`），`baseUrl` 可空。固定官方开源包
  [`@speech-sdk/core@0.27.0`](https://www.npmjs.com/package/@speech-sdk/core/v/0.27.0)（Apache-2.0），开放
  Cartesia、Deepgram、ElevenLabs、Fish Audio、Gradium、Hume、Inworld、MiniMax、Mistral、Murf、OpenAI、Resemble、
  SmallestAI、Speechify 与 xAI；没有 Key 的厂商只有源码和 mock 验证。adapter 按每个模型的保守输入上限先拒绝过长
  文本，固定 `maxRetries=0`，每句恰好一次请求；不创建、覆盖或删除远端声线。
- `kind: "voxcpm"`：本地 VoxCPM 服务。可控克隆 POST `/clone`，高品质克隆 POST `/clone_with_prompt`。声线的
  `referenceAudioPath`、`promptAudioPath`、`promptTextPath` 只保存 Workspace 相对路径；绝对路径、反斜杠、URL 与
  `..` 逃逸均被拒绝。

provider 返回的音频统一转为 48 kHz 单声道 PCM 后实测时长；时序 authority 是实测 samples，不是 provider 的声称值。

## 旧配置

合法的 `producer-config-v1`、`v2`、`v3` 会先校验原 fingerprint，再在内存中升级为 v4；读取和诊断不改写文件，
在配置页保存后才原子写入 v4。fingerprint 不匹配、未知字段或结构无效的配置 fail closed。
