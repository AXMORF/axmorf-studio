# Formal project tools

这里保存已经完成正式作品的 project-specific 制作与验证工具。它们不是新视频生产入口；新
production 只走 `scripts/production/cli.ts`。

- `gps-relativity/`：GPS Scene、global/final evidence 与 approval 的历史制作和 current 复验；
- `product-comic-vertical/`：产品漫画的项目声明、音频、Shotcraft 与 current 复验。

目录中的 `write`、render 或 historical authoring 路径只用于重现历史过程，不作为公共 API。
正式门禁由 `scripts/project-validation/formal-projects.json` 的静态 profile 选择只读步骤；禁止
运行时目录扫描、从 JSON 读取模块路径或把项目工具反向引入通用领域层。
