# 0.3.0-rc.7 发布审计修复（2026-11-10）

## 经过

`v0.3.0-rc.6` tag（f5414da）推送后，CI run 42778899130 在 `npm audit --audit-level=low` 失败，npm 未发布任何版本。
该 tag 原样保留、不删不移，`0.3.0-rc.6` 视为作废版本号；修复后以 `0.3.0-rc.7` 重新发布。

## 原因

- 公告：[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，minimatch `>=7.0.0 <11.0.1`，moderate。
- 依赖链（仅开发依赖，lint 用）：`@remotion/eslint-config-flat` → `typescript-eslint@8.48.0`（既有 override）
  → `@typescript-eslint/typescript-estree@8.48.0` → `minimatch@9.0.9`。
- 上游没有干净版本：minimatch 9.x、10.x 无修复版；typescript-eslint 当前最新 8.72.2（含 canary 8.72.3-alpha.3）
  依赖 minimatch `^10.2.2`，同在受影响范围内。`npm audit fix` 不产生任何改动。
- 运行时依赖 `npm audit --omit=dev` 为 0，已发布包内容不受影响。

## 修复

`package.json` 的 `overrides` 只对 `@typescript-eslint/typescript-estree` 下的 minimatch 锁定 `11.0.5`（11.x 当前最新修复版），
不全局覆盖 minimatch。lock 随之引入其依赖 `brace-expansion@5.0.12`、`balanced-match@4.0.4`、
`@isaacs/nonrecursive-glob-match@1.1.0`（均为 dev，许可 MIT/BlueOak-1.0.0）。CI Node 24.16.0 满足其 engines。

验证：改动前后对同一仓库各跑 `eslint .`，均检查 470 个文件、文件列表一致、0 错误 0 警告；完整 `npm run check` 通过；
`npm audit --audit-level=low` 为 0。Remotion 仍为 4.0.489。

## 移除条件

typescript-eslint 发布依赖 minimatch `>=11.0.1` 的版本后，升级既有的 `typescript-eslint` override 并删除这条
`@typescript-eslint/typescript-estree` → `minimatch` 覆盖，同时更新 `tests/package-boundary/manifests.test.ts`。
