import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROJECT_BUILD_FAILURE_HINT,
  PROJECT_BUILD_POLICY_VERSION,
  createFingerprint,
  createProjectBuildId,
} from "../../src/contracts";
import {
  createProjectBuildProgressReporter,
  readProjectBuildProgress,
  resolveProjectBuildProgressPaths,
} from "../../scripts/project-build/adapters/progress";

test("Project build progress is atomic, ordered, fingerprinted, and clearable", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-build-progress-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  let tick = 0;
  const now = () => `2026-08-18T00:00:0${tick++}.000Z`;
  const reporter = await createProjectBuildProgressReporter({
    rootDir,
    projectId: "story-example",
    attemptId: "00000000-0000-4000-8000-000000000001",
    now,
  });
  const sourceSnapshotFingerprint = createFingerprint({
    namespace: "progress-test-source",
    version: 1,
    value: "story-example",
  });
  const buildId = createProjectBuildId({
    storyId: "story-example",
    sourceSnapshotFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: PROJECT_BUILD_POLICY_VERSION,
  });

  const initial = await readProjectBuildProgress({
    rootDir,
    projectId: "story-example",
  });
  assert.equal(initial?.currentStep, "prepare");
  assert.equal(initial?.steps[0]?.status, "running");

  await reporter.bindIdentity({ buildId, sourceSnapshotFingerprint });
  await reporter.succeed("prepare");
  await reporter.start("video");
  await reporter.succeed("video", { reused: true });
  await reporter.start("cover-4x3");
  await reporter.fail();

  const failed = await readProjectBuildProgress({
    rootDir,
    projectId: "story-example",
  });
  assert.equal(failed?.state, "failed");
  assert.equal(failed?.failureHint, PROJECT_BUILD_FAILURE_HINT);
  assert.equal(failed?.currentStep, "cover-4x3");
  assert.equal(failed?.buildId, buildId);
  assert.equal(failed?.steps[1]?.reused, true);
  assert.equal(failed?.steps[2]?.status, "failed");

  const path = resolveProjectBuildProgressPaths({
    rootDir,
    projectId: "story-example",
  }).progress;
  const tampered = JSON.parse(await readFile(path, "utf8"));
  tampered.updatedAt = "2026-08-18T09:00:00.000Z";
  await writeFile(path, JSON.stringify(tampered));
  await assert.rejects(
    readProjectBuildProgress({ rootDir, projectId: "story-example" }),
    /fingerprint is stale/iu,
  );

  await reporter.clear();
  assert.equal(
    await readProjectBuildProgress({ rootDir, projectId: "story-example" }),
    null,
  );
});
