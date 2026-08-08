# Roadmap

> 文档类型：实施顺序与阶段门槛
>
> 最后复核：2026-08-09

## 已完成基线

1. 叙事、sealed narration、SemanticTiming、CaptionCue 与 NarrativeCore。
2. ScenePackage、ResourceCatalog、RendererRegistry、Coverage 与 Scene-local sound。
3. GlobalSound、GlobalVisual、FinalAssembly 和 Project deletion/zero-project bootstrap。
4. single-writer production orchestration、N Scene + one GlobalVisual 并行 result join。
5. current-only render plan/render-ready handoff。
6. independent Cover、non-MP4 delivery package、exactly-once launch intent 与 detached spawn
   acknowledgement receipt。

## 当前门槛

任何继续开发必须保持：

- production 的唯一终态是 `render-ready / awaiting-automatic-delivery`；
- Skill 的自动终点是 `delivery-render-started`；
- intent-before-spawn、receipt-after-spawn、intent-without-receipt-never-retry；
- spawn acknowledgement 不升级为 render completion；
- current delivery check 不读取计划 MP4；
- Cover 独立、production single-writer、Run events append-only；
- zero Project bootstrap 与隔离 deletion matrix 继续通过。

## 可独立立项的后续工作

- NarrativeCheck 或其他主观审核模型；
- 用户明确批准后的 capability promotion；
- 平台发布、账号或网络集成；
- 用户明确要求的 detached render 观察工具。

这些都不是当前自动交付合同的一部分，不能通过顺手扩张实现。
