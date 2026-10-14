# 素材

按主体选媒介：插画、照片质感和光影用生图；精确图形、图解和状态变化用原创 SVG（可以直接写在 TSX 里，
不需要登记）；软件题材用界面组件。只有某个画面确实要用时才准备素材。

## 生成图片

先在构思里写清关键画面：主体尺度、取景、光源方向、材质、遮挡和文字安静区。需要景深或遮挡时，
分别生成全幅环境板和透明背景的主体，再在代码里分层运动；不要把需要动的元素和说明文字烧进一张图。

只用宿主当前实际能调用的生图工具，检查返回的图片后再登记。没有生图工具时改用原创 SVG，不要声称工具运行过。

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
