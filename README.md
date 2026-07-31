# Remotion Story Producer

一个以旁白与字幕为稳定叙事主线、以 `StoryBeat` 驱动独立 `Scene` 视觉任务的
Remotion 视频生产工程。

## 当前状态

仓库当前只完成基础框架：

- Remotion、React、TypeScript、ESLint 与 Tailwind 基础工程；
- 已迁入 camera、effects、Lottie/媒体、motion、sound、styles、transitions 与
  Remotion primitives；
- `CapabilityGallery`：只用于验证项目可以启动、构建和列出 Composition；
- 规范目录和目标设计文档。

NarrativeCore、ScenePackage、资源注册表、完整生产链和新 skills 都尚未实现。
完成边界和后续里程碑见
[最终产品目标](docs/FINAL_PRODUCT_GOAL.md) 与
[当前实现状态](docs/ITERATION_STATUS.md)。

## 本地运行

要求 Node.js 20+ 与 npm。本项目不使用 Docker。

```bash
npm install
npm run dev
```

常用验证：

```bash
npm run typecheck
npm run lint
npm run build
npm run compositions
```

一次运行全部检查：

```bash
npm run check
```

渲染系统 Composition：

```bash
npx remotion render src/index.ts CapabilityGallery out/capability-gallery.mp4
```

## 文档

从 [docs/README.md](docs/README.md) 开始。仓库内 Agent 执行规则见
[AGENTS.md](AGENTS.md)。

## 目录

```text
.agents/skills/                 Agent 创作与维护入口
docs/                           产品、架构、合同与状态
public/assets/library/          经准入的共享本地资产
public/projects/<story>/        单个作品的本地资产
scripts/                        确定性检查与生成工具
src/contracts/                  后续数据合同；当前仅保留能力依赖的资产类型
src/remotion/capabilities/      已批准共享能力
src/remotion/catalog/           预留：统一只读资源目录
src/remotion/runtime/           预留：NarrativeCore、视觉轨与装配运行时
src/remotion/compositions/      系统 Composition
src/projects/<story>/           预留：新作品与 composition-local Scene 源码
```
