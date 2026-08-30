import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createNarrativeBaselineEvidenceReceipt,
  resolveNarrativeBaselineGeneratedRegistryChecksum,
} from "../../scripts/baseline/evidence";
import type { ValidatedProjectRegistrationEntry } from "../../scripts/registry/domain";
import {
  NARRATIVE_BASELINE_EVIDENCE_SCHEMA_VERSION,
  NarrativeBaselineEvidenceReceiptInputSchema,
  ProjectRegistrationDescriptorSchema,
} from "@axmorf/studio/contracts";
import { Sha256DigestSchema } from "@axmorf/studio/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("stale evidence requires writer authorization while malformed evidence remains invalid", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-baseline-evidence-refresh-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "story-example";
  const receiptPath = join(
    rootDir,
    "src/projects/story-example/generated/narrative-baseline-evidence.generated.json",
  );
  await mkdir(join(rootDir, "src/projects/story-example/generated"), {
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
  const entry: ValidatedProjectRegistrationEntry = {
    descriptor: ProjectRegistrationDescriptorSchema.parse({
      storyId,
      id: "StoryExample",
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 2,
      defaultProps: { projectId: storyId },
      compositionModulePath: "./story-example/Composition",
    }),
    projectRegistryEntryFingerprint: Sha256DigestSchema.parse(sha("a")),
    narrativeBaselineFingerprint: Sha256DigestSchema.parse(sha("b")),
    generatedEntryChecksum: Sha256DigestSchema.parse(sha("c")),
  };

  await assert.rejects(
    resolveNarrativeBaselineGeneratedRegistryChecksum({
      rootDir,
      storyId,
      entry,
    }),
    /stale against its registry entry/iu,
  );
  assert.equal(
    await resolveNarrativeBaselineGeneratedRegistryChecksum({
      rootDir,
      storyId,
      entry,
      allowStaleEvidence: true,
    }),
    sha("c"),
  );

  await writeFile(receiptPath, "{}\n");
  await assert.rejects(
    resolveNarrativeBaselineGeneratedRegistryChecksum({
      rootDir,
      storyId,
      entry,
      allowStaleEvidence: true,
    }),
  );
});
