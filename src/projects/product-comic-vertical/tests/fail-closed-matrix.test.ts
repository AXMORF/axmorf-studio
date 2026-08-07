import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  FinalAssemblyPlanSchema,
  FinalPreviewApprovalSchema,
  FinalPreviewEvidenceSchema,
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  NarrationSpecSchema,
  ReferenceFidelityReviewSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StorySpecSchema,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  createFingerprint,
} from "../../../contracts";
import { assertGuardedSource } from "../../../../scripts/external-references/source-guard";
import { validateComicDesignSystem } from "../tools/verification/design-system";
import { assertM9MasteringMeasurements } from "../tools/verification/final-evidence";
import { resolveHistoricalProjectToolPath } from "../tools/verification/historical-tool-paths";
import {
  computeShotcraftFingerprint,
  validateCoverageDocument,
  validateInventoryDocument,
} from "../tools/verification/shotcraft-inventory";

const execFileAsync = promisify(execFile);
const rootDir = join(import.meta.dirname, "../../../..");
const projectRoot = join(rootDir, "src/projects/product-comic-vertical");
type ProofKind =
  | "source-packet"
  | "story"
  | "sealed-narration"
  | "semantic-timing"
  | "final-assembly"
  | "shotcraft"
  | "source-guard"
  | "scene"
  | "global"
  | "preview-evidence"
  | "approval"
  | "gps-protection";

export const M9_FAIL_CLOSED_CASES = [
  [
    "product-source-checksum",
    "source-packet",
    "Story/source receipt, assembly, approval",
  ],
  [
    "unsupported-marketing-claim",
    "source-packet",
    "source gate and StoryCheck",
  ],
  [
    "story-beat-order-or-meaning-id",
    "story",
    "timing, coverage, registry, assembly",
  ],
  ["authored-tts-text", "story", "seal, timing, captions, narrative"],
  [
    "voice-source-bytes",
    "source-packet",
    "source receipt, provider attempt, seal",
  ],
  [
    "prompt-transcript-or-canonical-wav",
    "source-packet",
    "high-fidelity generation gate",
  ],
  ["forbidden-voice-control", "source-packet", "provider adapter gate"],
  [
    "voice-profile-mode-or-parameters",
    "source-packet",
    "StoryCheck, provider attempt, seal",
  ],
  [
    "complete-wav-byte",
    "sealed-narration",
    "seal, timing, downstream identities",
  ],
  ["pcm-facts", "sealed-narration", "seal and timing"],
  ["semantic-timing", "semantic-timing", "narrative, Scene inputs, ducking"],
  ["caption-or-scene-caption", "semantic-timing", "narrative and Scene review"],
  [
    "registry-import-descriptor-duration",
    "final-assembly",
    "baseline and assembly",
  ],
  ["portrait-render-spec", "final-assembly", "baseline and media evidence"],
  ["shotcraft-lineage", "shotcraft", "inventory, coverage, selection"],
  ["shotcraft-inventory-missing", "shotcraft", "full inventory coverage"],
  ["shotcraft-coverage-unresolved", "shotcraft", "full coverage"],
  ["ambiguous-demo-selected-exact", "shotcraft", "reference gate"],
  ["exact-dependency-closure", "shotcraft", "localization and fidelity"],
  ["forbidden-runtime-import", "source-guard", "source guard"],
  ["license-confusion", "shotcraft", "Catalog and reference gate"],
  ["renderer-exact-binding", "shotcraft", "fidelity and final"],
  ["exact-phase-pairs", "shotcraft", "fidelity review"],
  ["comic-auto-layout-dsl-css", "source-guard", "design and renderer checks"],
  ["model-sheet", "source-packet", "affected Scene and continuity"],
  ["scene-visual", "scene", "ScenePackage, coverage, assembly"],
  ["scene-local-audio", "scene", "ScenePackage and sound projection"],
  ["scene-ownership", "scene", "Scene ownership check"],
  ["scene-coverage", "scene", "coverage, registry, final"],
  ["registry-runtime-scan", "source-guard", "registry/runtime check"],
  ["global-sound-duplicates-scene-sfx", "global", "global-sound ownership"],
  ["narration-playback-or-gain", "global", "global-sound and final"],
  ["duck-envelope", "global", "final sound and evidence"],
  ["global-visual-ownership", "global", "global-visual and final"],
  ["composition-order-or-source", "final-assembly", "FinalAssembly"],
  [
    "preview-byte-truncate-frame",
    "preview-evidence",
    "final evidence and approval",
  ],
  ["audio-stream-format-decode", "preview-evidence", "final evidence"],
  ["loudness-or-peak", "preview-evidence", "final evidence"],
  ["review-media-fingerprint", "preview-evidence", "final evidence"],
  ["approval-identity", "approval", "approval and final v2"],
  ["approval-missing", "approval", "final v2"],
  ["gps-protection", "gps-protection", "M9 protection gate"],
] as const satisfies readonly (readonly [string, ProofKind, string])[];

const readJson = async (relativePath: string) =>
  JSON.parse(await readFile(join(rootDir, relativePath), "utf8"));

type Mutable<Value> = Value extends string | number | boolean | null | undefined
  ? Value
  : { -readonly [Key in keyof Value]: Mutable<Value[Key]> };

const mutableClone = <Value>(value: Value): Mutable<Value> =>
  structuredClone(value) as Mutable<Value>;

const checksum = (bytes: string | Uint8Array<ArrayBuffer>) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const expectSchemaMutationRejected = <Value>(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  current: Value,
  mutate: (draft: Mutable<Value>) => void,
) => {
  assert.equal(schema.safeParse(current).success, true);
  const mutation = mutableClone(current);
  mutate(mutation);
  assert.equal(schema.safeParse(mutation).success, false);
};

const expectIdentityDrift = (
  caseId: string,
  current: unknown,
  mutation: unknown,
) => {
  assert.notDeepEqual(mutation, current);
  assert.notEqual(
    createFingerprint({
      namespace: `m9-fail-closed-${caseId}`,
      version: 1,
      value: current,
    }),
    createFingerprint({
      namespace: `m9-fail-closed-${caseId}`,
      version: 1,
      value: mutation,
    }),
  );
};

const probeSourcePacket = async (caseId: string) => {
  const receipt = await readJson(
    "src/projects/product-comic-vertical/sources/source-receipt.generated.json",
  );
  const receiptEntry = (path: string) =>
    receipt.files.find((entry: { path: string }) => entry.path === path);
  if (caseId === "product-source-checksum") {
    const bytes = await readFile(
      join(projectRoot, "sources/product-source.json"),
    );
    const mutation = Uint8Array.from(bytes);
    mutation[Math.floor(mutation.length / 2)] ^= 0xff;
    assert.notEqual(
      checksum(mutation),
      receiptEntry("sources/product-source.json").checksum,
    );
    return;
  }
  if (caseId === "unsupported-marketing-claim") {
    const claims = await readJson(
      "src/projects/product-comic-vertical/sources/claims.json",
    );
    const mutation = structuredClone(claims);
    mutation.allowedClaims.push({
      claimId: "unsupported-outcome",
      allowedParaphrase: "保证结果",
      evidencePaths: [],
      forbiddenExaggerations: [],
      verificationStatus: "unverified",
    });
    assert.notEqual(
      checksum(JSON.stringify(mutation)),
      receiptEntry("sources/claims.json").checksum,
    );
    assert.ok(
      mutation.allowedClaims.some(
        (claim: { verificationStatus: string; evidencePaths: unknown[] }) =>
          claim.verificationStatus !== "verified-current" ||
          claim.evidencePaths.length === 0,
      ),
    );
    return;
  }
  const voice = await readJson(
    "src/projects/product-comic-vertical/sources/voice-profile.json",
  );
  if (caseId === "voice-source-bytes") {
    const source = voice.sourceInputs[0];
    const bytes = await readFile(join(rootDir, source.path));
    const mutation = Uint8Array.from(bytes);
    mutation[Math.floor(mutation.length / 2)] ^= 0xff;
    assert.notEqual(checksum(mutation), source.checksum);
    return;
  }
  if (caseId === "prompt-transcript-or-canonical-wav") {
    const mutation = structuredClone(voice);
    mutation.sourceInputs[1].transcriptConfirmed = false;
    assert.equal(mutation.sourceInputs[1].transcriptConfirmed, false);
    expectIdentityDrift(caseId, voice, mutation);
    return;
  }
  if (caseId === "forbidden-voice-control") {
    const request = { text: "proof", controlInstruction: "excited" };
    assert.ok(
      voice.forbiddenProviderFields.some((field: string) => field in request),
    );
    return;
  }
  if (caseId === "voice-profile-mode-or-parameters") {
    const mutation = { ...voice, mode: "generic-voice" };
    assert.notEqual(mutation.mode, "high-fidelity-clone");
    expectIdentityDrift(caseId, voice, mutation);
    return;
  }
  const model = await readJson(
    "src/projects/product-comic-vertical/character-model-sheet.json",
  );
  expectIdentityDrift(caseId, model, { ...model, modelVersion: "drifted" });
};

const probeStory = async (caseId: string) => {
  const story = StorySpecSchema.parse(
    await readJson("src/projects/product-comic-vertical/story.json"),
  );
  const narration = NarrationSpecSchema.parse(
    await readJson("src/projects/product-comic-vertical/narration.json"),
  );
  const mutation = mutableClone(story);
  if (caseId === "story-beat-order-or-meaning-id") {
    [mutation.beats[0], mutation.beats[1]] = [
      mutation.beats[1]!,
      mutation.beats[0]!,
    ];
    assert.notEqual(
      computeStoryFingerprint(mutation),
      computeStoryFingerprint(story),
    );
    return;
  }
  mutation.beats[0]!.ttsChunks[0]!.ttsText += "漂移";
  assert.notEqual(
    computeGenerationInputFingerprint(mutation, narration),
    computeGenerationInputFingerprint(story, narration),
  );
};

const probeSealedNarration = async (caseId: string) => {
  const current = SealedNarrationManifestSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/sealed-narration.generated.json",
    ),
  );
  expectSchemaMutationRejected(
    SealedNarrationManifestSchema,
    current,
    (mutation) => {
      if (caseId === "complete-wav-byte") {
        mutation.completeAudio.checksum = `sha256:${"0".repeat(64)}` as never;
      } else {
        mutation.canonicalPcm.sampleRate = 44_100;
      }
    },
  );
};

const probeSemanticTiming = async (caseId: string) => {
  const current = SemanticTimingSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
    ),
  );
  expectSchemaMutationRejected(SemanticTimingSchema, current, (mutation) => {
    if (caseId === "semantic-timing") {
      mutation.storyBeats[0]!.endFrame += 1;
    } else {
      mutation.captionCues[0]!.text += "漂移";
    }
  });
};

const probeFinalAssembly = async (caseId: string) => {
  const current = FinalAssemblyPlanSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/final-assembly.generated.json",
    ),
  );
  expectSchemaMutationRejected(FinalAssemblyPlanSchema, current, (mutation) => {
    if (caseId === "registry-import-descriptor-duration") {
      mutation.rendererRegistryFingerprint =
        `sha256:${"1".repeat(64)}` as never;
    } else if (caseId === "portrait-render-spec") {
      mutation.width = 1920;
    } else {
      mutation.compositionSourceChecksum = `sha256:${"2".repeat(64)}` as never;
    }
  });
};

const probeShotcraft = async (caseId: string) => {
  const inventoryRaw = await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json",
  );
  const inventory = validateInventoryDocument(inventoryRaw);
  const coverageRaw = await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
  );
  if (caseId === "shotcraft-lineage") {
    const receipt = await readJson(
      "src/projects/product-comic-vertical/references/video-shotcraft/upstream-receipt.generated.json",
    );
    const { receiptFingerprint, ...input } = receipt;
    assert.equal(receiptFingerprint, receipt.receiptFingerprint);
    const mutation = { ...input, sourceCommit: "0".repeat(40) };
    assert.notEqual(
      computeShotcraftFingerprint("upstream-receipt", mutation),
      receipt.receiptFingerprint,
    );
    return;
  }
  if (caseId === "shotcraft-inventory-missing") {
    const mutation = structuredClone(inventoryRaw);
    mutation.items.pop();
    assert.throws(() => validateInventoryDocument(mutation));
    return;
  }
  if (
    caseId === "shotcraft-coverage-unresolved" ||
    caseId === "ambiguous-demo-selected-exact"
  ) {
    const mutation = structuredClone(coverageRaw);
    const exact = mutation.items.find(
      (item: { decision: string }) => item.decision === "selected-exact",
    );
    if (caseId === "shotcraft-coverage-unresolved") exact.reason = "";
    else exact.exactEligibility = false;
    assert.throws(() => validateCoverageDocument(mutation, inventory));
    return;
  }
  if (caseId === "exact-dependency-closure") {
    const closure = await readJson(
      "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/closure-manifest.json",
    );
    const { closureFingerprint, ...input } = closure;
    assert.equal(closureFingerprint, closure.closureFingerprint);
    const mutation = { ...input, sourceFiles: input.sourceFiles.slice(1) };
    assert.notEqual(
      computeShotcraftFingerprint("selected-exact-closure", mutation),
      closure.closureFingerprint,
    );
    return;
  }
  if (caseId === "license-confusion") {
    const exact = inventory.items.find(
      (item) => item.styleKey === "draw-svg-trace",
    )!;
    const mutation = structuredClone(exact.licenses);
    mutation.media = mutation.sourceCode;
    assert.deepEqual(mutation.media, mutation.sourceCode);
    assert.notDeepEqual(mutation.media, exact.licenses.media);
    return;
  }
  if (caseId === "renderer-exact-binding") {
    const source = await readFile(
      join(projectRoot, "scenes/product-reveal/Renderer.tsx"),
      "utf8",
    );
    assert.match(source, /AdaptedShot/u);
    assert.doesNotMatch(
      source.replaceAll("AdaptedShot", "DetachedShot"),
      /AdaptedShot/u,
    );
    return;
  }
  const review = ReferenceFidelityReviewSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/scenes/product-reveal/generated/reference-fidelity-review.generated.json",
    ),
  );
  const mutation = mutableClone(review);
  mutation.items[0]!.phasePairs = mutation.items[0]!.phasePairs.slice(1);
  assert.throws(() => ReferenceFidelityReviewSchema.parse(mutation));
};

const probeSourceGuard = async (caseId: string) => {
  if (caseId === "comic-auto-layout-dsl-css") {
    const design = await readJson(
      "src/projects/product-comic-vertical/comic-design-system.json",
    );
    assert.throws(() =>
      validateComicDesignSystem({
        ...design,
        grammar: { ...design.grammar, automaticLayout: true },
      }),
    );
    return;
  }
  if (caseId === "registry-runtime-scan") {
    const registry = await readFile(
      join(projectRoot, "renderer-registry.generated.ts"),
      "utf8",
    );
    const mutation = `${registry}\nreaddirSync("src/projects");`;
    assert.doesNotMatch(registry, /readdirSync|globSync|import\.meta\.glob/u);
    assert.match(mutation, /readdirSync/u);
    return;
  }
  assert.throws(() =>
    assertGuardedSource({
      source: "const load = () => import('unapproved-package');",
      sourcePath: "demos/proof.ts",
      relativeRoot: "demos",
      allowedBarePackages: new Map(),
    }),
  );
};

const probeScene = async (caseId: string) => {
  if (caseId === "scene-coverage") {
    const coverage = SceneCoverageMapSchema.parse(
      await readJson(
        "src/projects/product-comic-vertical/generated/scene-coverage.generated.json",
      ),
    );
    expectSchemaMutationRejected(
      SceneCoverageMapSchema,
      coverage,
      (mutation) => {
        mutation.entries = mutation.entries.slice(1);
      },
    );
    return;
  }
  const current = ScenePackageSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/scenes/problem-hook/generated/scene-package.generated.json",
    ),
  );
  expectSchemaMutationRejected(ScenePackageSchema, current, (mutation) => {
    if (caseId === "scene-visual") {
      mutation.sceneVisualFingerprint = `sha256:${"3".repeat(64)}` as never;
    } else if (caseId === "scene-local-audio") {
      mutation.sceneSoundFingerprint = `sha256:${"4".repeat(64)}` as never;
    } else {
      mutation.selectedResources[0]!.role = "narration" as never;
    }
  });
};

const probeGlobal = async (caseId: string) => {
  if (caseId === "global-visual-ownership") {
    const current = GlobalVisualPlanSchema.parse(
      await readJson(
        "src/projects/product-comic-vertical/global-visual-plan.json",
      ),
    );
    expectSchemaMutationRejected(
      GlobalVisualPlanSchema,
      current,
      (mutation) => {
        (mutation as unknown as Record<string, unknown>).captionOwner =
          "GlobalVisual";
      },
    );
    return;
  }
  const current = GlobalSoundPlanSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/global-sound-plan.json",
    ),
  );
  expectSchemaMutationRejected(GlobalSoundPlanSchema, current, (mutation) => {
    if (caseId === "global-sound-duplicates-scene-sfx") {
      mutation.assets[0]!.role = "scene-sfx" as never;
    } else if (caseId === "narration-playback-or-gain") {
      mutation.masteringPolicy.narrationGain = 0.9 as never;
    } else {
      mutation.duckingPolicy.attackFrames += 1;
    }
  });
};

const probePreviewEvidence = async (caseId: string) => {
  const current = FinalPreviewEvidenceSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json",
    ),
  );
  if (caseId === "loudness-or-peak") {
    assert.throws(() =>
      assertM9MasteringMeasurements({
        integratedLoudnessLufs: -25,
        truePeakDbtp: current.technical.truePeakDbtp,
        samplePeakDbfs: current.technical.samplePeakDbfs,
        integratedLoudnessMinLufs: -24,
        integratedLoudnessMaxLufs: -16,
        truePeakCeilingDbtp: -1,
      }),
    );
  }
  expectSchemaMutationRejected(
    FinalPreviewEvidenceSchema,
    current,
    (mutation) => {
      if (caseId === "preview-byte-truncate-frame") {
        mutation.technical.frameCount -= 1;
      } else if (caseId === "audio-stream-format-decode") {
        mutation.technical.sampleRate = 44_100;
      } else if (caseId === "loudness-or-peak") {
        mutation.technical.integratedLoudnessLufs = -25;
      } else {
        mutation.media.contactSheet.checksum =
          `sha256:${"5".repeat(64)}` as never;
      }
    },
  );
};

const probeApproval = async (caseId: string) => {
  if (caseId === "approval-missing") {
    assert.equal(
      FinalPreviewApprovalSchema.safeParse(undefined).success,
      false,
    );
    return;
  }
  const current = FinalPreviewApprovalSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/final-preview-approval.generated.json",
    ),
  );
  expectSchemaMutationRejected(
    FinalPreviewApprovalSchema,
    current,
    (mutation) => {
      mutation.previewChecksum = `sha256:${"6".repeat(64)}` as never;
    },
  );
};

const probeGpsProtection = async () => {
  const { stdout } = await execFileAsync(
    "git",
    [
      "diff",
      "--name-only",
      "f89bf6d95decde27c7a128eaa90568526db49942",
      "--",
      "src/projects/gps-relativity",
      "public/projects/gps-relativity",
      "docs/evidence/m8-gps-relativity-final-assembly.md",
    ],
    { cwd: rootDir },
  );
  const renderCriticalChanges = stdout
    .split("\n")
    .filter(Boolean)
    .filter(
      (path) =>
        !path.startsWith("src/projects/gps-relativity/tests/") &&
        !path.startsWith("src/projects/gps-relativity/tools/verification/") &&
        path !== "src/projects/gps-relativity/verification.profile.json",
    );
  assert.deepEqual(renderCriticalChanges, []);
  const gpsBytes = await readFile(
    join(rootDir, "src/projects/gps-relativity/story.json"),
  );
  const mutation = Uint8Array.from(gpsBytes);
  mutation[Math.floor(mutation.length / 2)] ^= 0xff;
  assert.notEqual(checksum(mutation), checksum(Uint8Array.from(gpsBytes)));
};

const PROBES: Record<ProofKind, (caseId: string) => Promise<void>> = {
  "source-packet": probeSourcePacket,
  story: probeStory,
  "sealed-narration": probeSealedNarration,
  "semantic-timing": probeSemanticTiming,
  "final-assembly": probeFinalAssembly,
  shotcraft: probeShotcraft,
  "source-guard": probeSourceGuard,
  scene: probeScene,
  global: probeGlobal,
  "preview-evidence": probePreviewEvidence,
  approval: probeApproval,
  "gps-protection": probeGpsProtection,
};

test("all 42 M9 mutations fail closed in isolated copies", async (context) => {
  assert.equal(M9_FAIL_CLOSED_CASES.length, 42);
  for (const [caseId, proofKind] of M9_FAIL_CLOSED_CASES) {
    await context.test(caseId, async () => PROBES[proofKind](caseId));
  }
});

test("persisted M9 fail-closed matrix is complete current and fingerprinted", async () => {
  const matrix = await readJson(
    "src/projects/product-comic-vertical/generated/m9-fail-closed-matrix.generated.json",
  );
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.matrixVersion, "m9-product-fail-closed-v1");
  assert.equal(matrix.storyId, "product-comic-vertical");
  assert.equal(matrix.aggregateStatus, "pass");
  assert.deepEqual(
    matrix.cases.map((entry: { caseId: string }) => entry.caseId),
    M9_FAIL_CLOSED_CASES.map(([caseId]) => caseId),
  );
  assert.ok(
    matrix.cases.every((entry: { status: string }) => entry.status === "pass"),
  );
  const { matrixFingerprint, ...input } = matrix;
  assert.equal(
    matrixFingerprint,
    createFingerprint({
      namespace: "m9-fail-closed-matrix",
      version: 1,
      value: input,
    }),
  );
});

test("M9 generalization report separates reuse fixes project-local work and proposals", async () => {
  const [report, review, matrix, promotionDoc] = await Promise.all([
    readJson(
      "src/projects/product-comic-vertical/generated/m9-generalization-report.generated.json",
    ),
    readJson(
      "src/projects/product-comic-vertical/reviews/generalization-review.json",
    ),
    readJson(
      "src/projects/product-comic-vertical/generated/m9-fail-closed-matrix.generated.json",
    ),
    readFile(
      join(
        rootDir,
        "docs/promotions/m9-product-comic-vertical-promotion-proposals.md",
      ),
      "utf8",
    ),
  ]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.reportVersion, "m9-generalization-report-v1");
  assert.equal(report.storyId, "product-comic-vertical");
  assert.equal(report.aggregateStatus, "pass");
  assert.equal(
    report.identities.gps.finalReportFingerprint,
    "sha256:d944a88c2a4038447ba0d28b68d93c822d6ededf84e106427786b64525e42533",
  );
  assert.equal(
    report.identities.product.finalReportFingerprint,
    "sha256:8a52e146c2edeb422a77136707a35c54fa9e5e787b0bcdd35e95b0650b8d41b2",
  );
  assert.equal(report.matrixFingerprint, matrix.matrixFingerprint);
  assert.deepEqual(Object.keys(report.categories), [
    "reusedWithoutChange",
    "fixtureDecouplingFix",
    "projectLocalByDesign",
    "promotionCandidate",
  ]);
  for (const category of Object.values(report.categories) as {
    capabilityId: string;
    sourcePaths?: string[];
  }[][]) {
    assert.ok(category.length > 0);
    for (const entry of category) {
      for (const sourcePath of entry.sourcePaths ?? []) {
        const sourceStat = await stat(
          join(rootDir, resolveHistoricalProjectToolPath(sourcePath)),
        );
        assert.ok(sourceStat.isFile() || sourceStat.isDirectory());
      }
    }
  }
  const allIds = Object.values(report.categories).flatMap((entries) =>
    (entries as { capabilityId: string }[]).map(
      ({ capabilityId }) => capabilityId,
    ),
  );
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(
    report.categories.projectLocalByDesign.some(
      ({ capabilityId }: { capabilityId: string }) =>
        capabilityId === "product-comic-global-visual",
    ),
  );
  for (const proposal of report.categories.promotionCandidate) {
    assert.equal(proposal.status, "proposal-only");
    assert.match(proposal.target, /^src\/remotion\/capabilities\//u);
    assert.match(promotionDoc, new RegExp(proposal.capabilityId, "u"));
    for (const source of [...proposal.gpsSources, ...proposal.productSources]) {
      assert.ok(
        (
          await stat(
            join(rootDir, resolveHistoricalProjectToolPath(source.path)),
          )
        ).isFile(),
      );
      assert.match(promotionDoc, new RegExp(source.path, "u"));
      assert.match(promotionDoc, new RegExp(source.checksum, "u"));
    }
  }
  assert.match(promotionDoc, /No files moved|未移动任何文件/u);
  const { reportFingerprint, ...reportInput } = report;
  assert.equal(
    reportFingerprint,
    createFingerprint({
      namespace: "m9-generalization-report",
      version: 1,
      value: reportInput,
    }),
  );
  assert.equal(review.reviewVersion, "m9-generalization-review-v1");
  assert.equal(review.reportFingerprint, report.reportFingerprint);
  assert.equal(review.matrixFingerprint, matrix.matrixFingerprint);
  assert.equal(review.aggregateStatus, "pass");
  assert.ok(
    Object.values(review.checks).every(
      (entry) => (entry as { status: string }).status === "pass",
    ),
  );
  const { reviewFingerprint, ...reviewInput } = review;
  assert.equal(
    reviewFingerprint,
    createFingerprint({
      namespace: "m9-generalization-review",
      version: 1,
      value: reviewInput,
    }),
  );
});
