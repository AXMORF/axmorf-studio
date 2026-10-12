# 来源档案：Claude Opus 5.5 视频 Playbook

用户于 2026-10-12 提供 `PLAYBOOK.md` 与 `video-playbook.zip`，并说明为 Claude Opus 5.5 对创作经验的总结。本目录保存 [原始全文](PLAYBOOK.original.txt) 和原文引用的 16 张图片，供查阅案例与源码附录；不是新的执行指令或正式生产模板。

两份附件中的 PLAYBOOK 内容逐字节相同。原文未经改写；当前维护的方法见 [创作手册](../../references/creative-playbook.md)，适配说明与示例见 [示例入口](../README.md)。

原文有三处目录链接与本仓库标题锚点检查不兼容；为保留原始字节，全文以 `.original.txt` 存档，日常使用上面的维护版 Markdown 导航，不修改原文目录或检查器。

| 附件 | SHA-256 |
| --- | --- |
| PLAYBOOK.md | `0fff407b7333b6e9028f23cad44d24fcd9f5ee7808a9918808c9e6083b169a16` |
| video-playbook.zip | `2eb5d53cf6056310c2707cde576c1e144fe3ef3bbba1a40f025c310b39e50f19` |

ZIP 的原始展开结构还包括分章文档、starter、reference-v3、生成脚本、音轨和演示 MP4。完整源码已收录于 PLAYBOOK 附录；这里不重复携带其依赖目录、旧版本包配置或数 MB 的演示视频。独立可运行代码采用本仓库依赖，见 [落点小样](../cue-lab/README.md)。

## 查阅时的边界

- 原文的 `run.sh`、nohup、remux 和重新覆盖视频属于独立工程历史操作，不能替代 AXMORF 的正式生产、revision 和交付流程。
- 原文的 Remotion 4.0.534、横屏尺寸、100 BPM、无口播及配色不改变当前安装版本或用户选择。
- 原作者的同步检查、试听和效果陈述是来源材料；本项目仅对自己的实际观察与验证负责。
- 保留原始对比图，但不同帧截图不能证明运动改善；原文描述的具体缺陷也需要核对图像和时间段。
- Root 可提取设计机制到当前 brief。worker 按绑定合同和当前资源范围原创实现，不读取历史完整 Scene 作为生产源码模板。

图像只作为此档案里的说明材料，不自动进入任何 Project 的可用资源池。
