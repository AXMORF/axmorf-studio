import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
  buildProductionRevision,
  ProductionRevisionIdSchema,
  type Sha256Digest,
  type TaskRevision,
} from "../../src/contracts";
import {
  buildNarrationChunkTask,
  ensureFixedTaskArtifact,
  sealedNarrationMatchesMeasuredProgress,
} from "../../scripts/project-production/application/prepare-fixed-tasks";
import { createProducerPlan } from "../../scripts/project-production/domain/plan";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const revisionId = `revision-${"1".repeat(64)}` as const;

const task = ({
  kind,
  semanticId = null,
  inputs,
  dependencies = [],
  policy = `${kind}-validator-v1`,
}: {
  readonly kind:
    | "narration-chunk"
    | "narration-seal"
    | "semantic-timing"
    | "scene-owner"
    | "cover-owner"
    | "composition-convergence"
    | "delivery-build";
  readonly semanticId?: string | null;
  readonly inputs: readonly Readonly<{
    id: string;
    fingerprint: Sha256Digest;
  }>[];
  readonly dependencies?: readonly Readonly<{
    taskRevision: TaskRevision;
    artifactFingerprint: Sha256Digest;
  }>[];
  readonly policy?: string;
}) =>
  buildProducerTaskSpec({
    taskKind: kind,
    storyId: "story-example",
    semanticId,
    revisionId,
    dependencyArtifacts: [...dependencies].sort((left, right) =>
      left.taskRevision.localeCompare(right.taskRevision),
    ),
    inputFingerprints: [...inputs].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    declaredReadSet: [],
    declaredOutputSet: ["project/output.json"],
    validatorPolicyVersion: policy,
  });

const dependency = (
  current: ReturnType<typeof task>,
  artifactFingerprint: Sha256Digest,
) => ({
  taskRevision: current.taskRevision,
  artifactFingerprint,
});

test("one TTS chunk change preserves sibling chunks and invalidates seal/timing downstream", () => {
  const chunkA = task({
    kind: "narration-chunk",
    inputs: [{ id: "tts", fingerprint: sha("1") }],
  });
  const chunkB = task({
    kind: "narration-chunk",
    inputs: [{ id: "tts", fingerprint: sha("2") }],
  });
  const changedChunkA = task({
    kind: "narration-chunk",
    inputs: [{ id: "tts", fingerprint: sha("3") }],
  });
  assert.notEqual(chunkA.taskRevision, changedChunkA.taskRevision);
  assert.equal(
    chunkB.taskRevision,
    task({
      kind: "narration-chunk",
      inputs: [{ id: "tts", fingerprint: sha("2") }],
    }).taskRevision,
  );
  const seal = task({
    kind: "narration-seal",
    inputs: [{ id: "assembly", fingerprint: sha("4") }],
    dependencies: [dependency(chunkA, sha("5")), dependency(chunkB, sha("6"))],
  });
  const changedSeal = task({
    kind: "narration-seal",
    inputs: [{ id: "assembly", fingerprint: sha("4") }],
    dependencies: [
      dependency(changedChunkA, sha("7")),
      dependency(chunkB, sha("6")),
    ],
  });
  assert.notEqual(seal.taskRevision, changedSeal.taskRevision);
  const timing = task({
    kind: "semantic-timing",
    inputs: [{ id: "render", fingerprint: sha("8") }],
    dependencies: [dependency(seal, sha("9"))],
  });
  const changedTiming = task({
    kind: "semantic-timing",
    inputs: [{ id: "render", fingerprint: sha("8") }],
    dependencies: [dependency(changedSeal, sha("a"))],
  });
  assert.notEqual(timing.taskRevision, changedTiming.taskRevision);
});

test("sealed or mastered narration byte identity changes ProductionRevision", () => {
  const input = {
    storyId: "story-example",
    storyFingerprint: sha("1"),
    narrationFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    publishingIntentFingerprint: sha("5"),
    projectSoundFingerprint: sha("6"),
    authoringRequirementsFingerprint: sha("7"),
    globalVisualBriefFingerprint: sha("8"),
    storyResourcePoolFingerprint: sha("9"),
    projectAssetManifestFingerprint: sha("a"),
    narrationGenerationFingerprint: sha("b"),
    scenes: [],
    selectedResources: [],
    policyFingerprints: [],
  };
  const current = buildProductionRevision(input);
  const changed = buildProductionRevision({
    ...input,
    narrationGenerationFingerprint: sha("c"),
  });
  assert.notEqual(current.revisionId, changed.revisionId);
});

test("a Scene brief and Cover input invalidate only their owner before explicit downstream edges", () => {
  const sceneA = task({
    kind: "scene-owner",
    semanticId: "scene-a",
    inputs: [{ id: "brief", fingerprint: sha("1") }],
  });
  const sceneB = task({
    kind: "scene-owner",
    semanticId: "scene-b",
    inputs: [{ id: "brief", fingerprint: sha("2") }],
  });
  const cover = task({
    kind: "cover-owner",
    inputs: [{ id: "cover-spec", fingerprint: sha("3") }],
  });
  assert.notEqual(
    sceneA.taskRevision,
    task({
      kind: "scene-owner",
      semanticId: "scene-a",
      inputs: [{ id: "brief", fingerprint: sha("4") }],
    }).taskRevision,
  );
  assert.equal(
    sceneB.taskRevision,
    task({
      kind: "scene-owner",
      semanticId: "scene-b",
      inputs: [{ id: "brief", fingerprint: sha("2") }],
    }).taskRevision,
  );
  assert.notEqual(
    cover.taskRevision,
    task({
      kind: "cover-owner",
      inputs: [{ id: "cover-spec", fingerprint: sha("5") }],
    }).taskRevision,
  );
});

test("runtime and validator changes invalidate only tasks that bind those policies", () => {
  const scene = task({
    kind: "scene-owner",
    semanticId: "scene-a",
    inputs: [{ id: "runtime", fingerprint: sha("1") }],
  });
  const cover = task({
    kind: "cover-owner",
    inputs: [{ id: "cover-spec", fingerprint: sha("2") }],
  });
  assert.notEqual(
    scene.taskRevision,
    task({
      kind: "scene-owner",
      semanticId: "scene-a",
      inputs: [{ id: "runtime", fingerprint: sha("3") }],
    }).taskRevision,
  );
  assert.equal(
    cover.taskRevision,
    task({
      kind: "cover-owner",
      inputs: [{ id: "cover-spec", fingerprint: sha("2") }],
    }).taskRevision,
  );
  assert.notEqual(
    scene.taskRevision,
    task({
      kind: "scene-owner",
      semanticId: "scene-a",
      inputs: [{ id: "runtime", fingerprint: sha("1") }],
      policy: "scene-owner-validator-v2",
    }).taskRevision,
  );
});

test("same fixed TaskRevision with different output bytes fails closed", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-fixed-conflict-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixed = buildNarrationChunkTask({
    storyId: "story-example",
    revisionId: ProductionRevisionIdSchema.parse(
      `revision-${"0".repeat(64)}`,
    ),
    narrationFingerprint: sha("1"),
    providerAttemptFingerprint: sha("2"),
    chunk: {
      chunkId: "chunk-one",
      meaningId: "scene-one",
      ttsText: "fixed text",
    },
  });
  const firstWav = createWavFixture({
    rawPcm: createRawPcmFixture([1, 2, 3]),
  });
  await ensureFixedTaskArtifact({
    rootDir,
    task: fixed.task,
    files: {
      "inputs/context.json": fixed.contextBytes,
      "public/chunk.wav": firstWav,
    },
  });
  const secondWav = createWavFixture({
    rawPcm: createRawPcmFixture([4, 5, 6]),
  });
  await assert.rejects(
    ensureFixedTaskArtifact({
      rootDir,
      task: fixed.task,
      files: {
        "inputs/context.json": fixed.contextBytes,
        "public/chunk.wav": secondWav,
      },
    }),
    /conflicting output bytes/u,
  );
});

test("delivery artifact never enters its own reusable artifact set fingerprint", () => {
  const revision = buildProductionRevision({
    storyId: "story-example",
    storyFingerprint: sha("1"),
    narrationFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    publishingIntentFingerprint: sha("5"),
    projectSoundFingerprint: sha("6"),
    authoringRequirementsFingerprint: sha("7"),
    globalVisualBriefFingerprint: sha("8"),
    storyResourcePoolFingerprint: sha("9"),
    projectAssetManifestFingerprint: sha("a"),
    narrationGenerationFingerprint: sha("b"),
    scenes: [],
    selectedResources: [],
    policyFingerprints: [],
  });
  const composition = task({
    kind: "composition-convergence",
    inputs: [{ id: "runtime", fingerprint: sha("c") }],
  });
  const delivery = task({
    kind: "delivery-build",
    inputs: [{ id: "publishing", fingerprint: sha("d") }],
  });
  const attestation = (current: typeof composition) =>
    buildArtifactAttestation({
      storyId: current.storyId,
      taskKind: current.taskKind,
      semanticId: current.semanticId,
      taskRevision: current.taskRevision,
      validatorPolicyVersion: current.validatorPolicyVersion,
      dependencyArtifacts: current.dependencyArtifacts,
      outputManifest: [
        {
          logicalPath: "project/output.json",
          checksum: sha(current.taskKind === "delivery-build" ? "e" : "f"),
          sizeBytes: 1,
          kind: "file",
        },
      ],
    });
  const nodes = [composition, delivery]
    .map((current) => ({ task: current, dependencyTaskRevisions: [] }))
    .sort((left, right) =>
      left.task.taskRevision.localeCompare(right.task.taskRevision),
    );
  const compositionAttestation = attestation(composition);
  const deliveryAttestation = attestation(delivery);
  const before = createProducerPlan({
    revision,
    nodes,
    inspections: new Map([
      [composition.taskRevision, { attestation: compositionAttestation, valid: true }],
      [delivery.taskRevision, { attestation: null, valid: false, reason: "artifact-missing" }],
    ]),
  });
  const after = createProducerPlan({
    revision,
    nodes,
    inspections: new Map([
      [composition.taskRevision, { attestation: compositionAttestation, valid: true }],
      [delivery.taskRevision, { attestation: deliveryAttestation, valid: true }],
    ]),
  });
  assert.equal(after.artifactSetFingerprint, before.artifactSetFingerprint);
});

test("active seal is not current against another provider-attempt cache", () => {
  const sealedNarration = {
    segments: [
      { kind: "chunk", chunkId: "chunk-one", checksum: sha("1") },
    ],
  } as unknown as Parameters<
    typeof sealedNarrationMatchesMeasuredProgress
  >[0]["sealedNarration"];
  const matching = {
    chunks: [
      {
        stage: "measured",
        chunkId: "chunk-one",
        normalizedChecksum: sha("1"),
      },
    ],
  } as unknown as Parameters<
    typeof sealedNarrationMatchesMeasuredProgress
  >[0]["progress"];
  const anotherProvider = {
    chunks: [
      {
        stage: "measured",
        chunkId: "chunk-one",
        normalizedChecksum: sha("2"),
      },
    ],
  } as unknown as Parameters<
    typeof sealedNarrationMatchesMeasuredProgress
  >[0]["progress"];
  assert.equal(
    sealedNarrationMatchesMeasuredProgress({
      sealedNarration,
      progress: matching,
    }),
    true,
  );
  assert.equal(
    sealedNarrationMatchesMeasuredProgress({
      sealedNarration,
      progress: anotherProvider,
    }),
    false,
  );
});
