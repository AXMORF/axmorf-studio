import { join } from "node:path";

import { resolvePackageBinCommand } from "../../packages/studio/src/process/resolve-package-bin";

/**
 * Repository-only compatibility helper. Product code must use
 * resolveRemotionCliInvocation so Windows does not depend on a .bin shim.
 */
export const resolveRemotionCommand = (rootDir: string) =>
  join(rootDir, "node_modules/.bin/remotion");

export const resolveRemotionCliInvocation = (rootDir: string) =>
  resolvePackageBinCommand({
    workspaceRoot: rootDir,
    packageName: "@remotion/cli",
    binName: "remotion",
  });
