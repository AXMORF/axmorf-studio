# 素材

按主体选媒介：插画、照片质感和光影用生图；精确图形、图解和状态变化用原创 SVG（可以直接写在 TSX 里，
不需要登记）；软件题材用界面组件。只有某个画面确实要用时才准备素材。

## 生成图片

先在构思里写清关键画面：主体尺度、取景、光源方向、材质、遮挡和文字安静区。需要景深或遮挡时，
分别生成全幅环境板和透明背景的主体，再在代码里分层运动；不要把需要动的元素和说明文字烧进一张图。

只用宿主当前实际能调用的生图工具，检查返回的图片后再登记，不要声称未运行的工具生成过素材。
纸面风格的人物、手、账单实物、电脑、桌上物件等**关键主体必须用生图剪纸**，按下节完成，不用代码画人物或实物凑数。
工具不可用或缺少关键主体时停下来，报告缺哪些主体；provider/授权失败不自动重试或换工具。
精确图解、数字、线条、印章印迹、红笔痕迹继续用 SVG；非关键点缀的原创 SVG 不能替代缺失的主画面。

## 单主体生图剪纸：从绿幕到登记

适用于纸面配方的关键人物和实物。开工前在 storyboard 开头写一段**统一风格提示词**（同一种画风、笔触、配色、俯拍角度、光向），
再逐个写主体提示词、用途、动作和文件名；所有素材沿用该风格。完整提示词例子见 [纸面配方](styles/paper-collage.md#papercollageexample-的主体提示词示例)。

1. 调用宿主实际可用的生图工具生成单个主体，例如「剪下来的插画纸片，一只俯视的右手」。单主体居中、四周留边、不裁切，
   背景为均匀纯色 `#00FF00`，没有背景纹理、地面、投影和道具，不把文字或金额烧进图。主体避免键色；有绿色的主体选另一种纯色键并调整去溢色方式。
   白边、纸纹、投影留给代码统一处理。所有调用在素材准备阶段完成，渲染阶段不联网。
2. 检查原图并取左上角**实际**背景键色；下面仅以确认为 `#00FF00` 为例。用宿主现有 FFmpeg 抠成透明 PNG，不安装新运行时：

   ```bash
   ffmpeg -hwaccel none -i subject-green.png \
     -vf "colorkey=0x00FF00:0.32:0.06,despill=type=green:mix=0.6:expand=0.1,format=rgba" \
     -frames:v 1 subject-keyed.png
   ```

   实际键色不同就替换 `0x00FF00`；`colorkey` 相似度/柔边值是起点，按边缘调，不牺牲主体颜色。
3. 打开 PNG 放大检查边缘，在明暗底上分别核对：背景透明、无绿边、没有误抠手指/物件、没有生成的多余部件。
   需要两种手势就生成两张独立主体或按下节做动作表，不能用单张静画冒充手势变化。
4. 用 `film:asset --origin generated` 登记**抠像后的**文件；`--creator` 写实际工具并注明抠像。完整命令：

   ```bash
   npm run film:asset -- --film <filmId> --file /absolute/path/subject-keyed.png --name subject-keyed.png \
     --origin generated --creator "<实际生图工具>；FFmpeg 绿幕抠像" --license "original-work"
   ```

5. 按命令输出用 `staticFile("films/<filmId>/assets/subject-keyed.png")` 加载，在 DOM/SVG 物件组标注 `data-axmorf-object` 与 kind=illustration。
   在代码统一加**沿透明轮廓的白边、接触投影、纸纹**：SVG `feMorphology` 对 SourceAlpha 做 dilate，再用白色 `feFlood` + `feComposite` 合成白边；
   `feDropShadow` 做同向接触暗影和偏移软影；固定 seed 的 `feTurbulence` 与主体 multiply 后按 SourceAlpha 裁回纸片内。
   不用矩形 image 边框代替轮廓白边，不给纸片外的透明区铺纹理。尺寸随主体缩放，光向与全片一致；文字/数字另放稳定 SVG 层。
   单张透明 PNG 用 Remotion `Img` 或 SVG `image` 即可；由 frame 控制纸片位移/旋转/翻折和影子高度，不依赖专用绿幕运行时。
6. 真正的动作表按下节的 `ProducerSpriteSheet` + `resolveProducerDrawing` 播放，再叠白边/投影；两者均由 `@axmorf/studio/remotion` 导出。
   纸面配方链接回本节，不依赖旧 Project/RSP 命令。拍点只用于物件反应，不改旁白/字幕时序。

## 作画序列（动作表）

插画只能推镜头时，画面很快显得像幻灯片。要让角色真的动起来，让生图工具画一张 2×2 的连续动作表：
同一机位、同一构图、同样大小，四格依次是一个动作的四张原画（起跳、转头、握拳、围巾被风吹），背景是纯色绿幕。

1. 提示词写明「2×2 网格，四格从左到右、从上到下是同一动作的第 1–4 帧；背景是均匀的 #00FF00 绿色，没有阴影和地面；
   格子之间没有分隔线」。纸片、花瓣一类粒子用 3×2 的精灵图，同样的绿幕规则。
2. 用宿主的 ffmpeg 抠成透明 PNG（取左上角的绿色作为键值）：
   `ffmpeg -hwaccel none -i sheet.png -vf "colorkey=0x<绿色>:0.32:0.06,despill=type=green:mix=0.6:expand=0.1,format=rgba" sheet-keyed.png`，
   放大看边缘没有绿边后再用 `film:asset` 登记（`--origin generated`，`--creator` 写生图工具并注明已抠像）。
3. 两个辅助均从 `@axmorf/studio/remotion` 导入。代码里用 `ProducerSpriteSheet` 显示某一格（src、columns=2、rows=2、cell、sheetWidth/sheetHeight 为整张图实测像素），用 `resolveProducerDrawing(frame, 4, timing)` 决定当前是哪一格：按拍
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
