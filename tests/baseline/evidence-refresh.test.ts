import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  createNarrativeBaselineEvidenceReceipt,
  resolveNarrativeBaselineGeneratedRegistryChecksum,
} from "../../scripts/baseline/evidence";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import type { ValidatedProjectRegistrationEntry } from "../../scripts/registry/domain";
import {
  NARRATIVE_BASELINE_EVIDENCE_SCHEMA_VERSION,
  NarrativeBaselineEvidenceReceiptInputSchema,
  ProjectRegistrationDescriptorSchema,
} from "../../src/contracts/narrative-baseline";
import { Sha256DigestSchema } from "../../src/contracts/primitives";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const registrationEntry = (
  storyId: string,
): ValidatedProjectRegistrationEntry => ({
  descriptor: ProjectRegistrationDescriptorSchema.parse({
    storyId,
    id: "StoryExample",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 2,
    defaultProps: { projectId: storyId },
    compositionModulePath: `./${storyId}/Composition`,
  }),
  projectRegistryEntryFingerprint: Sha256DigestSchema.parse(sha("a")),
  narrativeBaselineFingerprint: Sha256DigestSchema.parse(sha("b")),
  generatedEntryChecksum: Sha256DigestSchema.parse(sha("c")),
});

test("stale evidence requires writer authorization while malformed evidence remains invalid", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-baseline-evidence-refresh-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "story-example";
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources: join(rootDir, "runtime-pack"),
    cacheRoot: join(rootDir, "cache"),
  });
  const receiptPath = join(
    locations.projectSourceRoot,
    "story-example/generated/narrative-baseline-evidence.generated.json",
  );
  await mkdir(join(locations.projectSourceRoot, storyId, "generated"), {
    recursive: true,
  });
  const staleReceipt = createNarrativeBaselineEvidenceReceipt(
    NarrativeBaselineEvidenceReceiptInputSchema.parse({
      schemaVersion: NARRATIVE_BASELINE_EVIDENCE_SCHEMA_VERSION,
      storyId,
      compositionId: "StoryExample",
      sealedNarrationFingerprint: sha("1"),
      semanticTimingFingerprint: sha("2"),
      generatedRegistryChecksum: sha("3"),
      projectRegistryEntryFingerprint: sha("4"),
      narrativeBaselineFingerprint: sha("5"),
      artifacts: {
        transparentStill: {
          localPath:
            "out/story-example/narrative-baseline-transparent-frame-0.png",
          checksum: sha("6"),
          frame: 0,
          alphaMin: 0,
          alphaMax: 0,
        },
        captionStill: {
          localPath: "out/story-example/narrative-baseline-caption-frame-1.png",
          checksum: sha("7"),
          frame: 1,
          alphaMin: 0,
          alphaMax: 1,
          topLeftAlphaMax: 0,
        },
        render: {
          localPath: "out/story-example/narrative-baseline.mp4",
          checksum: sha("8"),
          fps: 30,
          durationInFrames: 2,
          videoStreamCount: 1,
          audioStreamCount: 1,
        },
      },
    }),
  );
  await writeFile(receiptPath, `${JSON.stringify(staleReceipt, null, 2)}\n`);
  const entry = registrationEntry(storyId);

  await assert.rejects(
    resolveNarrativeBaselineGeneratedRegistryChecksum({
      locations,
      storyId,
      entry,
    }),
    /stale against its registry entry/iu,
  );
  assert.equal(
    await resolveNarrativeBaselineGeneratedRegistryChecksum({
      locations,
      storyId,
      entry,
      allowStaleEvidence: true,
    }),
    sha("c"),
  );

  await writeFile(receiptPath, "{}\n");
  await assert.rejects(
    resolveNarrativeBaselineGeneratedRegistryChecksum({
      locations,
      storyId,
      entry,
      allowStaleEvidence: true,
    }),
  );
});

test("Workspace baseline receipt lookup never probes a repository-shaped sibling", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-baseline-no-probe-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "story-example";
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources: join(rootDir, "runtime-pack"),
    cacheRoot: join(rootDir, "cache"),
  });
  const repositoryShapedReceipt = join(
    rootDir,
    "src/projects",
    storyId,
    "generated/narrative-baseline-evidence.generated.json",
  );
  await mkdir(dirname(repositoryShapedReceipt), { recursive: true });
  await writeFile(repositoryShapedReceipt, "{}\n");

  assert.equal(
    await resolveNarrativeBaselineGeneratedRegistryChecksum({
      locations,
      storyId,
      entry: registrationEntry(storyId),
    }),
    sha("c"),
  );
});
