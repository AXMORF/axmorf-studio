import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import {
  assertProjectRevisionOwnedPath,
  createLiveProjectProductionScope,
  createProjectRevisionProductionScope,
  productionScopeLogicalPath,
  resolveProductionScope,
  resolveProjectRevisionOwnedPath,
} from "../../scripts/project-production/application/production-scope";
import { validProjectCreateInput } from "../fixtures/project-create";

const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: validProjectCreateInput.storyId,
  baseRevisionId: `revision-${"a".repeat(64)}`,
  baseDeliveryBuildId: `delivery-${"b".repeat(64)}`,
  patch: { brief: validProjectCreateInput.brief },
} as const;

test("Project revision scope isolates mutable production paths and shares fixed authorities", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "axmorf-revision-scope-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const root = await realpath(temporaryRoot);
  const scope = createProjectRevisionProductionScope({
    rootDir: root,
    storyId: revisionInput.storyId,
    candidateId: computeProjectRevisionCandidateId(revisionInput),
  });

  for (const isolatedPath of [
    scope.projectSourceRoot,
    scope.projectPublicRoot,
    scope.narrationWorkRoot,
    scope.producerWorkRoot,
    scope.producerAttemptsRoot,
    scope.outputRoot,
    scope.deliveryRoot,
  ]) {
    assert.equal(isolatedPath.startsWith(`${scope.isolatedRoot}/`), true);
  }
  assert.equal(scope.shared.runtimeRoot, root);
  assert.equal(scope.shared.privateConfigRoot, join(root, "private"));
  assert.equal(
    scope.shared.producerArtifactRoot,
    join(root, ".producer-artifacts"),
  );
  assert.equal(
    scope.shared.operationLockPath,
    join(root, ".project-operation.lock"),
  );
  assert.equal(
    resolveProjectRevisionOwnedPath({
      scope,
      relativePath: "definition/base/source/story.json",
    }),
    resolve(scope.candidateRoot, "definition/base/source/story.json"),
  );
  assert.throws(() =>
    resolveProjectRevisionOwnedPath({ scope, relativePath: "../outside" }),
  );
  assert.throws(() =>
    resolveProjectRevisionOwnedPath({ scope, relativePath: "/outside" }),
  );
  assert.throws(() =>
    assertProjectRevisionOwnedPath({ scope, path: join(root, "private") }),
  );
});

test("live and candidate routing preserve logical identity while isolating mutable roots", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "axmorf-production-routing-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const root = await realpath(temporaryRoot);
  const candidateId = computeProjectRevisionCandidateId(revisionInput);
  const live = createLiveProjectProductionScope({
    rootDir: root,
    storyId: revisionInput.storyId,
  });
  const candidate = resolveProductionScope({
    rootDir: root,
    storyId: revisionInput.storyId,
    candidateId,
  });

  assert.equal(live.isolatedRoot, root);
  assert.equal(live.shared.runtimeRoot, candidate.shared.runtimeRoot);
  assert.equal(
    live.shared.producerArtifactRoot,
    candidate.shared.producerArtifactRoot,
  );
  assert.notEqual(live.projectSourceRoot, candidate.projectSourceRoot);
  assert.notEqual(live.producerWorkRoot, candidate.producerWorkRoot);
  assert.equal(
    productionScopeLogicalPath(
      candidate,
      join(candidate.producerWorkRoot, revisionInput.storyId, "task-fixture"),
    ),
    `.producer-revisions/${revisionInput.storyId}/${candidateId}/scope/.producer-work/${revisionInput.storyId}/task-fixture`,
  );
});
