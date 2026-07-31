# Remotion Story Producer Agent Guide

本文件定义仓库内 Agent 的执行规则。默认中文交流，先给结论，再给最少必要依据。

## 权威文档

- 产品最终目标：`docs/FINAL_PRODUCT_GOAL.md`
- 当前实现状态：`docs/ITERATION_STATUS.md`
- 系统结构：`docs/ARCHITECTURE.md`
- 名词边界：`docs/TERMINOLOGY.md`

文档冲突时，先以可执行代码和测试确认当前事实，再同步状态文档；不能把目标设计说成
已经实现。

## 工程边界

- 只使用宿主机 Node.js/npm 与 Remotion CLI；不新增 Docker、docker-compose 或
  容器验证流程。
- 所有 `remotion` 与 `@remotion/*` 包保持完全相同的精确版本。
- 一 Story 对应一个 Composition；一 StoryBeat 对应一个 `meaningId` 和一个 Scene。
- 实测旁白时间是绝对时间权威；Scene 和转场不得移动、缩短或吞掉 spoken frames。
- 字幕只由顶层 `CaptionLayer` 渲染；Scene renderer 只输出视觉。
- JSON/数据文件不得包含 JSX、任意代码、任意动态模块路径或可执行表达式。
- renderer 必须通过 composition-local 静态 registry 绑定稳定 `rendererId`。
- render runtime 不调用 Agent、skill、MCP 或网络服务。
- 所有可见资产必须位于仓库 `public/`，有 manifest 元数据并通过校验。
- 所有 render-critical motion 使用 Remotion frame API；禁止 CSS animation、
  CSS transition 和 Tailwind animation utilities。

## Scene 制作来源

制作新 Scene 只允许参考：

1. 当前 Story、StoryBeat、实测 timing、SceneVisualPlan 与相邻连续性；
2. 当前 `src/remotion/capabilities/` 中的共享能力；统一 catalog 实现后改用 catalog；
3. 当前方案显式选择并已本地化的上游来源。

不得搜索、打开、比较、模仿或复制旧生产 Scene、旧 Composition、still、
contact sheet 或历史布局来制作新 Scene。历史诊断必须与新 Scene authoring 隔离。

## 共享能力提取

新实现默认留在 `src/projects/<story>/`。只有形成带 fingerprint 的具体 promotion
proposal，并得到用户对范围、API、文件和目标位置的明确批准后，才允许移入
`src/remotion/capabilities/`。证据充分不等于授权，笼统认可不等于后续提取许可。

## 审核

- `AutoCheck`：合同、帧范围、资源、registry、typecheck/lint/build 等机械检查；
- `SceneVisualCheck`：Agent 批量检查 Scene 语义、构图、运动与连续性；
- `FinalPreviewApproval`：默认唯一必须由用户作出的创意批准；
- Shotcraft fidelity、motion strip、benchmark、封面和 promotion review 仅在命中
  对应条件时执行。

不要为每个 Scene、每个 still 或每个脚本步骤反复要求用户审批。

## 修改与验证

- 保护用户现有未提交修改；不重置、不覆盖、不顺手整理无关内容。
- 删除、覆盖、强推、生产发布、密钥或权限变更必须有明确授权。
- 修改后先跑聚焦检查，再按风险运行 `npm run check`。
- 新 Composition 至少通过 `npm run compositions`，高风险视觉改动补真实 still 或短片。
- 完成代码或配置任务后检查 README、状态、架构和合同是否需要同步。
- 不 push，除非用户明确要求。
