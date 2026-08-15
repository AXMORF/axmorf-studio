# Roadmap

> 文档类型：实施顺序与阶段门槛
>
> 最后复核：2026-08-15

## 已完成基线

1. 叙事、sealed narration、SemanticTiming、CaptionCue 与 NarrativeCore。
2. ScenePackage、ResourceCatalog、RendererRegistry、Coverage 与 Scene-local sound。
3. GlobalSound、GlobalVisual、FinalAssembly、zero-project bootstrap、隔离 deletion matrix 与显式
   `project:delete` 完整数据清理。
4. single-writer production orchestration、N Scene + one GlobalVisual 并行 result join。
5. current-only render plan/render-ready handoff。
6. independent Cover、non-MP4 delivery package、exactly-once launch intent 与 detached spawn
   acknowledgement receipt。
7. assignment-bound owner receipt inbox、detached single-writer watcher、`create_thread` 独立任务
   派发与 root dispatch-after-exit。
8. unified private ProducerConfig、同一开发入口下的本地配置控制台、可配置 Scene 留白/合集/TTS
   语速与目标响度，以及对应 contracts/fingerprints/Skill 路由。
9. production/delivery 单向脚本分层、窄 shared technical adapters、CLI/use-case 与 owner inbox/output
   manifest 职责拆分，以及 executable architecture regression。
10. 配置控制台的 Project 列表、每 Project 最新 current Run 关键进度、严格二次确认删除，以及跨
    configure/start/delivery/delete 的 repository operation lock 与删除投影恢复。
11. `scene-package-timeline-v1` 正式 Composition：片头、正文、片尾统一为 StoryBeat、普通
    SceneAssignment/ScenePackage 与 visual/sound projection；SemanticTiming 统一使用全片帧数。
12. 全局配置选择普通 reusable Scene template；`project:configure` 复制其源码与资源到新 Project，
    冻结 Project-local instance identity，production 脚本机械校验并直接 submit，不派发 Agent owner。

## 当前门槛

任何继续开发必须保持：

- production 的唯一终态是 `render-ready / awaiting-automatic-delivery`；
- Skill 的自动终点是 `delivery-render-started`；
- intent-before-spawn、receipt-after-spawn、intent-without-receipt-never-retry；
- spawn acknowledgement 不升级为 render completion；
- current delivery check 不读取计划 MP4；
- Cover 独立、production single-writer、Run events append-only；
- watcher intent-only 永久 ambiguous；缺失 owner receipt 永久 waiting，无 timeout/retry/heartbeat；
- root 只创建独立用户任务，派发后不 wait/read/poll；
- zero Project bootstrap 与隔离 deletion matrix 继续通过。
- silent intro/outro 只从所选 preset 取得固定时长，不伪造 TTS、CaptionCue 或 sealed segment；
  narrated chunk 仍保持一次 provider request、一次 CaptionCue 与 sealed PCM authority。
- `template-copy` Scene 不得被 Scene owner 重新创作或发布 receipt；Project-local source/cue 漂移必须
  fail closed，共享模板或全局选择后续变化不得影响既有 Project。
- `project:delete` 继续保护 core、其他 Project、private config 与 `public/voice_profile/`，并在
  writer lock、repository operation lock、非空 delivery staging 或不安全路径出现时于首次删除前
  fail closed；源码删除前的 Registry 预发布和异常后的磁盘真实状态恢复必须保持。
- 配置页每个 Project 只展示最新 current Run，不升级为历史任务库、进程监控或 MP4 完成检查。
- 配置页展示 discovery 与删除 discovery 保持分离：前者只接受 source Project/current Run identity，
  后者继续覆盖全部 Project-owned 清理根。

## 可独立立项的后续工作

- NarrativeCheck 或其他主观审核模型；
- 用户明确批准后的 capability promotion；
- 平台发布、账号或网络集成；
- 用户明确要求的 detached render 观察工具。

这些都不是当前自动交付合同的一部分，不能通过顺手扩张实现。
