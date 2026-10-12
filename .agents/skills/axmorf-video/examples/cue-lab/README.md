# 可运行示例：预备、落点、稳定

独立 8 秒教学小样：代码合成配乐与音效，一个连续空间，纸片附着、笔迹、标签连接和阅读收束。横屏 1280×720、竖屏 720×1280，30 fps、97 BPM；这些尺寸是小样选择，不是正式 Project 默认值。

![横屏小样的稳定结果帧](preview-landscape.jpg)

另见 [竖屏结果帧](preview-portrait.jpg)。图片是本示例实际渲染的第 220 帧，仅展示构图，不能代替动作和音频检查。

## 运行

从已安装依赖的 AXMORF 源仓库或 Workspace 根目录执行。不需要新建 Project、TTS、外部素材、全局安装或新 package.json；沿用当前安装的 Remotion 版本。浏览器与字体按当前环境准备，示例使用已安装的 Noto Sans CJK SC，缺失时先确认实际替代字体的字形和布局。

```bash
node .agents/skills/axmorf-video/examples/cue-lab/synth-demo.mjs --output out/creative-playbook/audio
npx --no-install tsc --project .agents/skills/axmorf-video/examples/cue-lab/tsconfig.json
npx --no-install remotion render .agents/skills/axmorf-video/examples/cue-lab/index.tsx CueLabLandscape out/creative-playbook/landscape.mp4 --public-dir=out/creative-playbook/audio --concurrency=2 --log=error
npx --no-install remotion render .agents/skills/axmorf-video/examples/cue-lab/index.tsx CueLabPortrait out/creative-playbook/portrait.mp4 --public-dir=out/creative-playbook/audio --concurrency=2 --log=error
```

输出目录已有音频时合成器拒绝覆盖。再试用新目录，并相应修改 render 的 `--public-dir` 与 MP4 路径。这里只生成教学媒体；正式制作仍走 [视频 Skill](../../SKILL.md)。

## 文件与机制

| 文件 | 演示内容 |
| --- | --- |
| [cue-sheet.json](cue-sheet.json) | 唯一事件来源：beat index、预备帧数、稳定帧数、音效语义及源偏移 |
| [timing.mjs](timing.mjs) | 按绝对 beat index 取整；接触帧与稳定帧分开；样本偏移换算 |
| [index.tsx](index.tsx) | 纯 frame 驱动、固定 seed 粗边、折面、阴影、稳定阅读层、按横竖屏重排 |
| [synth-demo.mjs](synth-demo.mjs) | 拨弦、低音、轻鼓与编曲变化；四种音效；分轨和混合轨输出 |

97 BPM 在 30 fps 下每拍约 18.557 帧，事件落点是第 37、74、130、186 帧。相同 schedule 同时被视觉和音频使用；不能将每拍先取整成 19 帧再累计。

纸片与标签提前运动，在目标帧到达连接位置，之后轻微余振；文字阅读不依赖这些运动层。笔迹从目标帧开始生长，其声音与画线窗口对应。swell 的对齐点是包络中心，音频提前 4800 个采样开始；其他声音的起音或动作起点按 cue 表定义。

合成器输出 `music.wav`、`sfx.wav`、`lesson.wav` 与 `audio-events.json`。后者记录 cue 计划、采样数、文件哈希和 sample peak；它不证明试听、感知同步或 AAC true peak。最终 render 用一次 `lesson.wav`，不再单独播放 SFX。

## 用于正式创作

学的是事件关系与设计机制：按当前内容、主题、viewport 和 narration/musicTiming 重写 brief，再原创实现。小样 cue schema 不是项目输入 schema，历史完整 TSX 不能直接复制成生产 Scene 或自动提升共享 capability。

正式配乐使用 [film direction](../../references/film-direction.md) 的代码合成与冻结入口；Scene 不挂 Audio。小样混合轨不能导入作 BGM 后再用 SoundDesignTrack 重复这些声音。若希望使用自行合成的音效，Root 必须先按当前资源合同完成准入，worker 只使用已批准音源。

## 实际检查

渲染后查看完整构图、动作中段、接触前后 F−1/F/F+1、阅读停留与结束帧。核对字号、粗边、层级、横竖布局和单个动作的接触位置；静帧不能证明运动流畅。

对最终 MP4 解码后测响度与 true peak，能试听时再听混音与节奏。没有播放器时明确未试听，不因事件时间一致就宣称音乐感染力或完美卡点。
