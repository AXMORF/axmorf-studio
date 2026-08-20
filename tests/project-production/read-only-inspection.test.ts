import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { captureProductionInspectionSnapshot } from "../../scripts/project-production/adapters/production-inspection";

test("production snapshot reader does not mutate any production plane", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-inspection-read-only-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const paths = [
    "src/projects/story-example/story.json",
    "public/projects/story-example/media.bin",
    ".narration-work/story-example/progress.json",
    ".producer-artifacts/story-example/scene-owner/value.bin",
    ".producer-work/story-example/task/value.bin",
    ".producer-attempts/story-example/attempt/value.json",
    "deliveries/story-example/publish.json",
  ];
  for (const path of paths) {
    await mkdir(join(rootDir, path, ".."), { recursive: true });
    await writeFile(join(rootDir, path), path);
  }
  const before = await Promise.all(
    paths.map(
      async (path) =>
        [path, (await stat(join(rootDir, path))).mtimeMs] as const,
    ),
  );
  const first = await captureProductionInspectionSnapshot({
    rootDir,
    projectId: "story-example",
  });
  const second = await captureProductionInspectionSnapshot({
    rootDir,
    projectId: "story-example",
  });
  const after = await Promise.all(
    paths.map(
      async (path) =>
        [path, (await stat(join(rootDir, path))).mtimeMs] as const,
    ),
  );

  assert.deepEqual(second, first);
  assert.deepEqual(after, before);
  await assert.rejects(
    stat(join(rootDir, ".producer-operation.lock")),
    /ENOENT/u,
  );
});
