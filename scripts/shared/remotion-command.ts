import { join } from "node:path";

export const resolveRemotionCommand = (rootDir: string) =>
  join(rootDir, "node_modules/.bin/remotion");
