# 素材

按主体选媒介：插画、照片质感和光影用生图；精确图形、图解和状态变化用原创 SVG（可以直接写在 TSX 里，
不需要登记）；软件题材用界面组件。只有某个画面确实要用时才准备素材。

## 生成图片

先在构思里写清关键画面：主体尺度、取景、光源方向、材质、遮挡和文字安静区。需要景深或遮挡时，
分别生成全幅环境板和透明背景的主体，再在代码里分层运动；不要把需要动的元素和说明文字烧进一张图。

只用宿主当前实际能调用的生图工具，检查返回的图片后再登记。没有生图工具时改用原创 SVG，不要声称工具运行过。

## 作画序列（动作表）

插画只能推镜头时，画面很快显得像幻灯片。要让角色真的动起来，让生图工具画一张 2×2 的连续动作表：
同一机位、同一构图、同样大小，四格依次是一个动作的四张原画（起跳、转头、握拳、围巾被风吹），背景是纯色绿幕。

1. 提示词写明「2×2 网格，四格从左到右、从上到下是同一动作的第 1–4 帧；背景是均匀的 #00FF00 绿色，没有阴影和地面；
   格子之间没有分隔线」。纸片、花瓣一类粒子用 3×2 的精灵图，同样的绿幕规则。
2. 用宿主的 ffmpeg 抠成透明 PNG（取左上角的绿色作为键值）：
   `ffmpeg -i sheet.png -vf "colorkey=0x<绿色>:0.32:0.06,despill=type=green:mix=0.6:expand=0.1,format=rgba" sheet-keyed.png`，
   放大看边缘没有绿边后再用 `film:asset` 登记（`--origin generated`，`--creator` 写生图工具并注明已抠像）。
3. 代码里用 `ProducerSpriteSheet` 显示某一格，用 `resolveProducerDrawing` 决定当前是哪一格：按拍
   （`{ onFrames: music.beatFrames }`）或每 2–4 帧（`{ holdFrames: 3 }`）换一张，叠在单独的背景板上。

一部 60 秒左右靠画面撑的片，插画大约要准备 12 张以上，其中至少 3 组动作表；开工前先列素材清单，审片时对照。

## 登记

每个文件都要用 `film:asset` 登记来源和许可，之后才能在片中使用：

```bash
npm run film:asset -- --film <filmId> --file /absolute/path/server-room.png --name server-room.png \
  --origin generated --creator "<实际使用的生图工具>" --license "original-work"
```

- `--origin`：`generated`（生图）、`original`（自己制作的 SVG 等）、`licensed`（第三方许可素材，必须加 `--source-url`，
  需要署名时加 `--attribution`）。
- `--name` 用小写文件名；同名再次登记会替换。
- 支持 png、jpg、webp、svg、wav、mp3、m4a、mp4、webm。SVG 不能包含脚本、事件属性或外部引用。

命令输出可直接使用的引用写法，例如：

```tsx
import { Img, staticFile } from "remotion";

<Img src={staticFile("films/<filmId>/assets/server-room.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
```

第三方素材的署名会写入交付的 `publish.json`。
