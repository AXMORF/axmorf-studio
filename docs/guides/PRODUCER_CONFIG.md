# 本地制作配置

> 文档类型：操作指南
>
> 最后复核：2026-08-11

仓库使用一份 Git-ignored 的 `private/producer.config.json` 作为制作默认值与私密 TTS 连接配置。
它不是 render runtime 输入；新作品在 authoring/freeze 时把实际选择写入 Project 合同或产物指纹，
因此之后修改全局配置不会静默改变已经封存的作品。

## 打开配置页

```bash
npm run dev
```

- `http://127.0.0.1:3100`：制作配置；
- `http://127.0.0.1:3101`：Remotion Studio 预览。

两者由同一个本地开发命令启动，不是两个需要部署的产品。配置 API 只监听 loopback、拒绝非同源
写入、使用 `no-store`，不把配置写入 localStorage。按产品要求，token 会完整返回并显示以便修改；
不得通过截图、日志或 Git 泄露页面内容。

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
token 或私有声线路径。目标文件已存在时命令会拒绝覆盖；迁移后应在页面中补充准确的合集名称/描述。

## 配置语义

- `renderDefaults`：新 RenderSpec 的 width/height/fps/locale；没有目标时长。
- `readability.edgeInsetPx`：以 1080 短边为基准的 Scene 边缘留白。字幕底边 = 缩放后边缘留白 × 2；
  Scene 底边 = 字幕底边 + 字幕盒高度 + gap，再向上取整到 10px。RenderSpec 不再保存字幕安全区。
- `publishingCollections`：有稳定 ID、名称和适用描述的数组。Agent 必须选一个最合适的已有合集；
  PublishingIntent v2 封存所选 ID/名称及当时的合集目录 fingerprint。
- `tts`：稳定的通用边界。`speech.rate` 在 provider 返回后、PCM 实测前处理并进入 provider-attempt
  fingerprint；`speech.targetLoudnessLufs` 进入两遍 loudnorm mastering policy 和母带 fingerprint。
- `tts.providers[].kind = "voxcpm"`：当前 VoxCPM 适配器。可控克隆 POST `/clone`；高品质克隆
  POST `/clone_with_prompt`。`mode` 只在适配器内部选择请求结构，不作为 form 字段发送。

`RSP_PRODUCER_CONFIG` 可指向另一份绝对路径。生产脚本、preflight 与配置页使用同一解析规则。
