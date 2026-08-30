import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "@axmorf/studio/contracts";
import {
  createTaskWorkspace,
  removeTaskWorkspace,
} from "../../scripts/project-production/adapters/task-workspace";

const task = buildProducerTaskSpec({
  taskKind: "global-visual-owner",
  storyId: "story-example",
  semanticId: null,
  revisionId: `revision-${"1".repeat(64)}`,
  dependencyArtifacts: [],
  inputFingerprints: [
    { id: "brief", fingerprint: `sha256:${"2".repeat(64)}` },
    {
      id: "read:inputs/brief.json",
      fingerprint: `sha256:${createHash("sha256").update("{}").digest("hex")}`,
    },
  ],
  declaredReadSet: ["inputs/brief.json"],
  declaredOutputSet: ["src/GlobalVisual.tsx"],
  validatorPolicyVersion: "global-v1",
});

test("workspace is content-addressed, idempotent, and cleanup stays exact", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-workspace-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/brief.json": "{}" },
  });
  assert.equal(await createTaskWorkspace({ rootDir, task }), workspace);
  await removeTaskWorkspace({ rootDir, task });
  await assert.rejects(() => lstat(workspace), { code: "ENOENT" });
});
