import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export const createTemporaryDirectory = async (
  context: TestContext,
  prefix: string,
) => {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};
