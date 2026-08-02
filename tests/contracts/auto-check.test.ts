import assert from "node:assert/strict";
import test from "node:test";

import renderJson from "../../src/projects/gps-relativity/render.json";
import storyCheckJson from "../../src/projects/gps-relativity/reviews/story-check.json";
import {
  NARRATIVE_AUTO_CHECK_EVIDENCE_IDS,
  NARRATIVE_AUTO_CHECK_IDS,
  NarrativeAutoCheckReportSchema,
  computeRenderSpecFingerprint,
  computeStoryCheckFingerprint,
  createNarrativeAutoCheckEvidenceRefs,
  createNarrativeAutoCheckReport,
  type NarrativeAutoCheckReportInput,
} from "../../src/contracts/auto-check";
import {
  NARRATIVE_CORE_VERSION,
  PROJECT_REGISTRY_GENERATOR_ID,
} from "../../src/contracts/narrative-baseline";
import { RenderSpecSchema } from "../../src/contracts/render";
import {
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../src/contracts/primitives";
import { StoryCheckReportSchema } from "../../src/contracts/story-check";

const digest = (character: string) =>
  Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);

const render = RenderSpecSchema.parse(renderJson);
const storyCheck = StoryCheckReportSchema.parse(storyCheckJson);

const evidenceChecksums = {
  "story-check": digest("1"),
  "sealed-manifest": digest("2"),
  "complete-wav":
    "sha256:9a6d9201d44f5926f48c7d017ade48e5d59639bbcb4c5bf4089c620d2ac38d98",
  "semantic-timing": digest("3"),
  "project-registry":
    "sha256:6b2b697a8b1d56e8179b7dcf254ad62ea0e92385b7e39a9e660baaaf479b472c",
  "m3-receipt": digest("4"),
} as const;

const passInput = (): NarrativeAutoCheckReportInput => ({
  schemaVersion: 1,
  reportVersion: "narrative-auto-check-v1",
  storyId: StoryIdSchema.parse("gps-relativity"),
  level: "narrative",
  aggregateStatus: "pass",
  inputIdentity: {
    storyFingerprint: Sha256DigestSchema.parse(
      "sha256:8fd18dc4377c8d82e7d041effcf92271d521c31db252b3c04135852a88774e2c",
    ),
    renderSpecFingerprint: computeRenderSpecFingerprint(render),
    storyCheckFingerprint: computeStoryCheckFingerprint(storyCheck),
    generationInputFingerprint: Sha256DigestSchema.parse(
      "sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96",
    ),
    sealedNarrationFingerprint: Sha256DigestSchema.parse(
      "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
    ),
    semanticTimingFingerprint: Sha256DigestSchema.parse(
      "sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c",
    ),
    projectRegistryGeneratorId: PROJECT_REGISTRY_GENERATOR_ID,
    generatedRegistryChecksum: Sha256DigestSchema.parse(
      "sha256:6b2b697a8b1d56e8179b7dcf254ad62ea0e92385b7e39a9e660baaaf479b472c",
    ),
    generatedEntryChecksum: Sha256DigestSchema.parse(
      "sha256:d39a9c87446efdc2796402b4154484371c080580cd8d9d79cd82f9e5e5bc46ec",
    ),
    projectRegistryEntryFingerprint: Sha256DigestSchema.parse(
      "sha256:25f60e077179d5da6a13dda813a808095eb74c8e4afdfbb4e8f8bbe964ea6f59",
    ),
    narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    narrativeBaselineFingerprint: Sha256DigestSchema.parse(
      "sha256:8e55b2c7d31f4b56ee777e9d806744327f90ba76f973e41146e4809fa09458c9",
    ),
    m3EvidenceFingerprint: Sha256DigestSchema.parse(
      "sha256:d265ee5c39b2f1777eea589e9f6b42ea50173944ecaca75904f25207de65c9d9",
    ),
  },
  evidenceRefs: createNarrativeAutoCheckEvidenceRefs({
    storyId: "gps-relativity",
    sealedNarrationFingerprint:
      "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
    checksums: evidenceChecksums,
  }),
  checks: NARRATIVE_AUTO_CHECK_IDS.map((checkId) => ({
    checkId,
    status: "pass" as const,
    evidenceIds:
      checkId === "source-contracts"
        ? ([] as const)
        : checkId === "story-check"
          ? (["story-check"] as const)
          : checkId === "sealed-narration"
            ? (["sealed-manifest", "complete-wav"] as const)
            : checkId === "semantic-timing"
              ? (["semantic-timing"] as const)
              : checkId === "project-registry"
                ? (["project-registry"] as const)
                : checkId === "m3-evidence"
                  ? (["m3-receipt"] as const)
                  : ([] as const),
    failureReasons: [],
  })),
});

test("pass AutoCheck fixes check order evidence order and all current identities", () => {
  const report = createNarrativeAutoCheckReport(passInput());
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    NARRATIVE_AUTO_CHECK_IDS,
  );
  assert.deepEqual(
    report.evidenceRefs.map((reference) => reference.evidenceId),
    NARRATIVE_AUTO_CHECK_EVIDENCE_IDS,
  );
  assert.deepEqual(
    report.evidenceRefs.map((reference) => reference.repositoryPath),
    [
      "src/projects/gps-relativity/reviews/story-check.json",
      "src/projects/gps-relativity/generated/sealed-narration.generated.json",
      "public/projects/gps-relativity/narration/0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5/complete.wav",
      "src/projects/gps-relativity/generated/semantic-timing.generated.json",
      "src/projects/project-registry.generated.ts",
      "src/projects/gps-relativity/generated/narrative-baseline-evidence.generated.json",
    ],
  );
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
  );
  assert.equal(
    report.inputIdentity.semanticTimingFingerprint,
    "sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c",
  );
  assert.equal(
    report.inputIdentity.narrativeBaselineFingerprint,
    "sha256:8e55b2c7d31f4b56ee777e9d806744327f90ba76f973e41146e4809fa09458c9",
  );
});

test("strict report rejects unknown missing duplicate and out-of-order checks", () => {
  const valid = createNarrativeAutoCheckReport(passInput());
  const invalidChecks = [
    valid.checks.slice(0, -1),
    [...valid.checks.slice(0, -1), valid.checks[0]],
    [valid.checks[1], valid.checks[0], ...valid.checks.slice(2)],
    [
      ...valid.checks.slice(0, -1),
      { ...valid.checks.at(-1), checkId: "unknown-check" },
    ],
  ];
  for (const checks of invalidChecks) {
    assert.throws(() =>
      NarrativeAutoCheckReportSchema.parse({ ...valid, checks }),
    );
  }
  assert.throws(() =>
    NarrativeAutoCheckReportSchema.parse({
      ...valid,
      inputIdentity: { ...valid.inputIdentity, unknown: true },
    }),
  );
});

test("aggregate status pass and failure reason invariants fail closed", () => {
  const pass = passInput();
  assert.throws(() =>
    createNarrativeAutoCheckReport({
      ...pass,
      checks: pass.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              status: "fail",
              failureReasons: [],
            }
          : check,
      ),
    }),
  );
  assert.throws(() =>
    createNarrativeAutoCheckReport({
      ...pass,
      checks: pass.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              failureReasons: [
                { code: "unexpected", message: "Unexpected failure." },
              ],
            }
          : check,
      ),
    }),
  );
  assert.throws(() =>
    createNarrativeAutoCheckReport({
      ...pass,
      inputIdentity: { ...pass.inputIdentity, m3EvidenceFingerprint: null },
    }),
  );

  const failed = createNarrativeAutoCheckReport({
    ...pass,
    aggregateStatus: "fail",
    inputIdentity: { ...pass.inputIdentity, m3EvidenceFingerprint: null },
    checks: pass.checks.map((check, index) =>
      index === 6
        ? {
            ...check,
            status: "fail" as const,
            failureReasons: [
              { code: "media-invalid" as const, message: "M3 media is invalid." },
            ],
          }
        : check,
    ),
  });
  assert.equal(failed.aggregateStatus, "fail");
});

test("RenderSpec and StoryCheck fingerprints cover their complete strict reports", () => {
  assert.notEqual(
    computeRenderSpecFingerprint(render),
    computeRenderSpecFingerprint({ ...render, leadInFrames: 16 }),
  );
  assert.notEqual(
    computeRenderSpecFingerprint(render),
    computeRenderSpecFingerprint({
      ...render,
      captionSafeAreaPx: { ...render.captionSafeAreaPx, bottom: 97 },
    }),
  );
  assert.notEqual(
    computeStoryCheckFingerprint(storyCheck),
    computeStoryCheckFingerprint({
      ...storyCheck,
      checks: storyCheck.checks.map((check, index) =>
        index === 0 ? { ...check, note: `${check.note} 已复核。` } : check,
      ),
    }),
  );
  const revised = {
    ...storyCheck,
    decision: "revise" as const,
    checks: storyCheck.checks.map((check, index) =>
      index === 0 ? { ...check, status: "fail" as const } : check,
    ),
  };
  assert.notEqual(
    computeStoryCheckFingerprint(storyCheck),
    computeStoryCheckFingerprint(revised),
  );
});

test("report fingerprint excludes only itself", () => {
  const original = createNarrativeAutoCheckReport(passInput());
  const current = passInput();
  const changedEvidence = {
    ...current,
    evidenceRefs: current.evidenceRefs.map((reference, index) =>
      index === 0 ? { ...reference, checksum: digest("9") } : reference,
    ),
  };
  const changed = createNarrativeAutoCheckReport(changedEvidence);
  assert.notEqual(original.reportFingerprint, changed.reportFingerprint);
  assert.throws(() =>
    NarrativeAutoCheckReportSchema.parse({
      ...original,
      inputIdentity: {
        ...original.inputIdentity,
        generatedEntryChecksum: digest("8"),
      },
    }),
  );
});

test("reports reject private paths provider data stacks and custom out refs", () => {
  const pass = passInput();
  const unsafeMessages = [
    "Failed at /home/user/project.",
    "Failed at /data/private/project.",
    "Bearer secret-token",
    "provider endpoint failed",
    ".narration-work/candidate",
    "stack: private trace",
    "cause: private error",
  ];
  for (const message of unsafeMessages) {
    assert.throws(() =>
      createNarrativeAutoCheckReport({
        ...pass,
        aggregateStatus: "fail",
        checks: pass.checks.map((check, index) =>
          index === 0
            ? {
                ...check,
                status: "fail" as const,
                failureReasons: [
                  { code: "unexpected" as const, message },
                ],
              }
            : check,
        ),
      }),
    );
  }
  assert.throws(() =>
    NarrativeAutoCheckReportSchema.parse({
      ...createNarrativeAutoCheckReport(pass),
      evidenceRefs: pass.evidenceRefs.map((reference, index) =>
        index === 0
          ? { ...reference, repositoryPath: "out/custom/result.json" }
          : reference,
      ),
    }),
  );
});
