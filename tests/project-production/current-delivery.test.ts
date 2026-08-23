import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildArtifactAttestation,
  buildProducerConfig,
  buildProducerTaskSpec,
  type ProductionRevisionId,
  type Sha256Digest,
} from "../../src/contracts";
import {
  createSourceCurrentAttestation,
  writeSourceCurrent,
} from "../../scripts/project-production/adapters/source-current-store";
import { buildCurrentDelivery } from "../../scripts/project-production/application/build-delivery";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const sha = (value: string) => `sha256:${value.repeat(64)}` as Sha256Digest;
const revisionId = `revision-${"1".repeat(64)}` as ProductionRevisionId;
const config = buildProducerConfig(validProjectCreateProducerConfig);

test("later Delivery validates source-current without provider, task workspace, or ExecutionAttempt", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-current-delivery-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  await mkdir(join(locations.projectSourceRoot, "story-example"), {
    recursive: true,
  });
  await mkdir(join(locations.projectMediaRoot, "story-example"), {
    recursive: true,
  });
  await writeFile(
    join(locations.projectSourceRoot, "story-example/story.json"),
    "source",
  );
  await writeFile(
    join(locations.projectMediaRoot, "story-example/audio.wav"),
    "media",
  );
  const task = buildProducerTaskSpec({
    taskKind: "composition-convergence",
    storyId: "story-example",
    semanticId: null,
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "source", fingerprint: sha("2") }],
    declaredReadSet: [],
    declaredOutputSet: ["project/convergence.json"],
    validatorPolicyVersion: "composition-convergence-validator-v1",
  });
  const artifact = buildArtifactAttestation({
    storyId: task.storyId,
    taskKind: task.taskKind,
    semanticId: null,
    taskRevision: task.taskRevision,
    validatorPolicyVersion: task.validatorPolicyVersion,
    dependencyArtifacts: [],
    outputManifest: [
      {
        logicalPath: "project/convergence.json",
        checksum: sha("3"),
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });
  const current = await createSourceCurrentAttestation({
    locations,
    storyId: "story-example",
    revisionId,
    artifacts: [artifact],
  });
  await writeSourceCurrent({ locations, attestation: current });
  const runtime = createRuntimeExecutionResources({
    rendererRuntimeFingerprint: sha("4"),
    browserExecutable: join(rootDir, "runtime/browser"),
    binariesDirectory: join(rootDir, "runtime/bin"),
    ffmpegExecutable: join(rootDir, "runtime/bin/ffmpeg"),
    ffprobeExecutable: join(rootDir, "runtime/bin/ffprobe"),
  });
  let builds = 0;
  const dependencies = {
    buildCurrentPlan: async () =>
      ({
        revision: { revisionId },
        plan: { tasks: [{ action: "reuse" }] },
        tasks: [task],
      }) as never,
    inspectArtifact: async () => artifact,
    build: async (input: unknown) => {
      builds += 1;
      return { status: "project-production-complete", input } as never;
    },
  };
  await buildCurrentDelivery(
    { locations, runtime, config, projectId: "story-example" },
    dependencies,
  );
  assert.equal(builds, 1);
  for (const path of [
    locations.taskWorkspaceRoot,
    locations.attemptStoreRoot,
  ]) {
    await assert.rejects(lstat(path), /ENOENT/u);
  }

  await writeFile(
    join(locations.projectSourceRoot, "story-example/story.json"),
    "drift",
  );
  await assert.rejects(
    buildCurrentDelivery(
      { locations, runtime, config, projectId: "story-example" },
      dependencies,
    ),
    /Source current record is stale|materialized bytes drifted/u,
  );
  assert.equal(builds, 1);
});
