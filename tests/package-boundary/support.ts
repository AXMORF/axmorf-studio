import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export const createTemporaryDirectory = async (
  context: TestContext,
  prefix: string,
) => {
  // macOS exposes /var through /private/var, while these fixtures exercise
  // production paths that intentionally reject symbolic-link ancestry.
  const temporaryRoot = await realpath(tmpdir());
  const rootDir = await mkdtemp(join(temporaryRoot, prefix));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};
