# 本地制作配置

> 文档类型：操作指南
>
> 最后复核：2026-08-18

仓库使用一份 Git-ignored 的 `private/producer.config.json` 作为制作默认值与私密 TTS 连接配置。
它不是 render runtime 输入；新作品在 authoring/freeze 时把实际选择写入 Project 合同或产物指纹，
因此之后修改全局配置不会静默改变已经封存的作品。

`.env.example` 可以直接复制为 `.env`：

```bash
cp .env.example .env
```

示例默认使用 `private/producer.config.json`；相对路径以仓库根目录解析，也可以填写绝对路径把
配置放到其他位置。配置页、Narration、Production/preflight 和迁移命令都会自动读取仓库根目录
`.env`。同名 Shell 环境变量优先于 `.env`；两者都未设置时仍使用上述默认路径。

## 打开配置页

```bash
npm run dev
```

- `http://127.0.0.1:3100`：制作配置；
- `http://127.0.0.1:3101`：Remotion Studio 预览。

两者由同一个本地开发命令启动，不是两个需要部署的产品。配置 API 只监听 loopback、拒绝非同源
写入、使用 `no-store`，不把配置写入 localStorage。按产品要求，token 会完整返回并显示以便修改；
不得通过截图、日志或 Git 泄露页面内容。

左侧“制作进度”先列出当前所有 Project；选择一个 Project 后，只展示它按 `createdAt` 选出的最新
current Production Run，不提供历史 Run 列表。详情按 `production:start`、`production:narrative`、
`production:scene:freeze`、Owner 创作与固定收敛、`production:render-ready:check` 与 `delivery:build` 六个
关键步骤显示状态，每 3 秒刷新。状态只由 strict Run manifest、append-only events、投影 state 以及
与当前 render-ready fingerprint 绑定的 delivery intent/receipt 得出，不运行脚本、不读取日志、
不检查进程/PID。`delivery:build` 的“已启动”只表示存在合法 OS spawn acknowledgement，绝不表示
MP4 已完成。

Project 详情提供删除入口，必须输入完整 Project ID 二次确认。页面调用与 `project:delete` 完全相同
的删除器：删除该 Project 的代码、媒体、narration work、全部绑定 Runs、out 与 current delivery，
随后重建 Catalog/Registry；其他 Project、private config 与 `public/voice_profile/` 不受影响。
非同源请求、非空 delivery staging、writer lock、不安全路径或不存在的 Project 会在删除前被拒绝。
生产启动、Project 配置或交付构建正在改变仓库时，删除也会通过共享 operation lock 拒绝执行；删除在
持锁后会重读目标集合，并在删除源码前先发布排除目标的 Registry，避免预检与实际清理之间混入新的
Run 或产物，也避免 Remotion Studio 因短暂的旧 import 终止配置 API；后续删除报错时会按磁盘真实
状态恢复 Registry/Catalog。若浏览器连接仍在请求中断，页面只提示“删除结果需确认”，不会把无法
确认的网络状态误报为删除未完成。

右侧“只读环境诊断”检查配置、默认声线来源、VoxCPM health/ready 与 Remotion browser preflight。
它不生成测试语音、不 warm-up 服务、不弱化 Chromium sandbox，只显示脱敏状态和修复建议。表单会
为新增合集/声线选择未占用 ID；切换 provider 或删除默认声线时立即选择仍有效的默认声线，重复 ID
或无效 default 会直接阻止保存。

可信局域网内需要其他设备直接访问时运行：

```bash
npm run dev:lan
```

该命令让配置页监听 IPv4 所有网卡，并强制 Remotion Studio 使用 IPv4；使用命令输出的本机
Network IP 分别访问 `http://<LAN-IP>:3100` 和 `http://<LAN-IP>:3101`。配置写入仍要求 Origin 与
实际 Host 完全一致，页面中的 Studio 链接会沿用当前主机名。由于配置 API 会完整返回 token，
LAN 模式只适用于用户已确认可信的局域网，禁止端口转发到公网。

首次从旧版 VoxCPM 私有配置迁移：

```bash
npm run config:migrate
```

命令读取旧 `voxcpm/voxcpm.private.json`，原子写入权限 `0600` 的新配置，不删除旧文件、不打印
token 或私有声线路径。位于仓库内的声线输入会转换成仓库相对路径；仓库外声线必须先由操作员移入
ignored 的仓库目录，否则迁移 fail closed。目标文件已存在时命令会拒绝覆盖；迁移后应在页面中
补充准确的合集名称/描述。

已有 `producer-config-v1` 会在读取时校验原 fingerprint，并只在内存中升级为 v2：原字段保持不变，
新增默认 Scene 选择。GET 和环境诊断不会改写私有文件；操作员在配置页确认并保存后才原子写入 v2。
fingerprint 不匹配或结构无效的 v1 仍然 fail closed。

## 配置语义

- `sceneDefaults.introSceneTemplateId` / `outroSceneTemplateId`：配置页中的首尾业务位置选择。两者都
  接受任意已登记 Scene template 或 `null`，不做位置适配判断；同一 template 可同时选择两次。
  该选择只在新 Project 首次 `project:configure` 时使用。
- `renderDefaults`：新 RenderSpec 的 width/height/fps/locale；页面用一个“画面尺寸”下拉同时设置
  width/height，提供 9:16、16:9、4:5 与 1:1 四个常用规格；没有目标时长。
- `readability.edgeInsetPx`：以 1080 短边为基准的 Scene 边缘留白。字幕底边 = 缩放后边缘留白 × 2；
  Scene 底边 = 字幕底边 + 字幕盒高度 + gap，再向上取整到 10px。RenderSpec 不再保存字幕安全区。
- `publishingCollections`：有稳定 ID、名称和适用描述的数组。Agent 必须选一个最合适的已有合集；
  PublishingIntent v2 封存所选 ID/名称及当时的合集目录 fingerprint。
- `tts`：稳定的通用边界。`speech.rate` 在 provider 返回后、PCM 实测前处理并进入 provider-attempt
  fingerprint；`speech.targetLoudnessLufs` 进入两遍 loudnorm mastering policy 和母带 fingerprint。
- `tts.providers[].kind = "voxcpm"`：当前 VoxCPM 适配器。可控克隆 POST `/clone`；高品质克隆
  POST `/clone_with_prompt`。`mode` 只在适配器内部选择请求结构，不作为 form 字段发送。
- 声线的 `referenceAudioPath`、`promptAudioPath` 和 `promptTextPath` 只保存仓库根目录相对路径，
  例如 `voxcpm/voice_profile/my-voice.wav`；绝对路径、反斜杠、URL 与 `..` 逃逸均被拒绝。Narration
  和 preflight 在进入 VoxCPM 适配器前统一解析为宿主绝对路径，配置页保存的仍是相对值。
- `audioDefaults.globalBgm`：可为空，或保存一个仓库相对 `sourcePath` 与 0–1 线性 `volume`。这是
  配置页中的本地 BGM 预设。`project:configure` 会复制并 checksum-bound 到 Project-local 资产，
  写入 `sound.json`；render runtime 将它作为循环 contribution 播放于 narrated 内容窗口，并保留独立音量。
  选择该本地文件即由 operator 声明其有权用于当前 Project；冻结的 manifest 记录这份 operator-provided
  授权证据，runtime 不接受 URL、symlink 或未封存字节。

`RSP_PRODUCER_CONFIG` 支持仓库根目录相对路径和绝对路径。生产脚本、preflight、迁移命令与配置页
使用同一解析规则。

## 冻结到新 Project

在新 Project 已有 `brief.json`、`story.json` 与 project-local `producer-input.json` 后运行：

新 `story.json` 在配置前只包含 authored content StoryBeat。`project:configure` 按 ProducerConfig 的
`sceneDefaults` 把所选普通 Scene template 的源码和资源复制到
`src/projects/<storyId>/scenes/` 与 `public/projects/<storyId>/scenes/`，再把对应 silent StoryBeat 写入
时间线首尾；`null` 表示不插入。脚本同时冻结 template/instance/source graph fingerprint。

```bash
npm run project:configure -- --project <storyId> --input src/projects/<storyId>/producer-input.json
```

`producer-input.json` 只保存单个作品的 render 非默认字段、PublishingIntent authored fields 与
production requirement selections；标题、StoryBeat、旁白文案、发布描述仍是
Project 内容，绝不放入 ProducerConfig。命令从一次 ProducerConfig 读取生成 `narration.json`、
`render.json`、`publishing-intent.json` 和
`production/requirements.json`，以及 `production/scene-template-instantiation.json` 和每个复制
Scene 的 `scene-template-instance.json`。合集必须且只能选择当前数组中的一个 ID；完整数组
fingerprint 被封存。Project 一旦存在 instantiation，后续修改全局 Scene 选择或共享模板不会重新复制
或改变该 Project；Project-local 文件漂移会 fail closed。其他冻结目标已有不同内容时命令拒绝覆盖。

`production:start` 用同一次已解析 TTS 配置完成 preflight 并冻结 Run 级
`NarrationExecutionSnapshot`。generation 会在 provider request 前重算并比较；mastering 只读取
快照中的 LUFS policy。配置页在 Run 开始后发生 provider、connection、voice、生成参数、speech
rate 或 LUFS 变化时，该 Run 会拒绝继续并要求 fresh Run。快照与安全 projection 只含 ID、数值
policy 和 fingerprint，不含 token、URL、绝对路径、声线内容或 transcript。
