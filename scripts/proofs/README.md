# Regression proofs

本目录按被证明的能力组织 synthetic regression proof。proof 不是 Story、正式 Scene 或
ProjectRegistry 条目，也不承担产品状态。

- `scene-runtime/`：ScenePackage、RendererRegistry、visual/local-sound runtime 与 evidence
  的隔离回归证明；只保留当前语义 identity，所有 fixture、fingerprint 与 evidence receipt 均由
  generator 重建，不提供历史路径或 Composition 兼容入口。
