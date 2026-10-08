import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_V2_IDS,
  createFinalAssemblyPlan,
  createFinalMechanicalCheckV2Report,
  createGlobalVisualPlan,
  generateVisualSemanticTiming,
  parseNarrativeProjectSource,
  StorySpecSchema,
} from "@axmorf/studio/contracts";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import {
  loadCurrentFinalAssemblyBranch,
  type FinalSceneBranchResult,
} from "../../scripts/project-check/final-run";
import { checksumFile } from "../../scripts/project-check/project-files";
import { finalAssemblyInput } from "../fixtures/final-assembly/input";
import { validRenderSpec, validVideoBrief } from "../fixtures/narrative";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

test("Final assembly identity invalidation matrix rejects every locked assembly boundary", () => {
  const base = finalAssemblyInput();
  const mutations = [
    { ...base, schemaVersion: 2 },
    { ...base, semanticTimingFingerprint: sha("a") },
    { ...base, durationInFrames: 121 },
    { ...base, fps: 60 },
    { ...base, resourceCatalogFingerprint: sha("a") },
    { ...base, soundDesignProjectionFingerprint: sha("a") },
    { ...base, compositionSourceChecksum: sha("a") },
    { ...base, zOrderVersion: "track-array-v1" },
    { ...base, mixOrderVersion: "adaptive-mastering-v1" },
    { ...base, scenePackageFingerprints: [sha("8"), sha("8")] },
    { ...base, unknown: true },
  ];
  const current = createFinalAssemblyPlan(base).finalAssemblyFingerprint;
  for (const mutation of mutations) {
    if (
      mutation.schemaVersion === 1 &&
      mutation.zOrderVersion === base.zOrderVersion &&
      mutation.mixOrderVersion === base.mixOrderVersion &&
      !("unknown" in mutation) &&
      new Set(mutation.scenePackageFingerprints).size ===
        mutation.scenePackageFingerprints.length
    ) {
      assert.notEqual(
        createFinalAssemblyPlan(mutation).finalAssemblyFingerprint,
        current,
      );
    } else {
      assert.throws(() => createFinalAssemblyPlan(mutation));
    }
  }
});

test("v2 cannot pass with stale assembly order or extra identity", () => {
  const identity = {
    narrativeReportFingerprint: sha("1"),
    visualStyleFingerprint: sha("2"),
    resourceCatalogFingerprint: sha("3"),
    referenceModes: ["empty"],
    externalSnapshotFingerprints: [],
    fidelityReceiptFingerprints: [],
    sceneCoverageFingerprint: sha("4"),
    scenePackageFingerprints: [sha("5")],
    rendererRegistryFingerprint: sha("6"),
    storyVisualProjectionFingerprint: sha("7"),
    soundDesignProjectionFingerprint: sha("8"),
    compositionAssemblyChecksum: sha("9"),
    globalVisualPlanFingerprint: sha("c"),
    globalVisualProjectionFingerprint: sha("d"),
    finalAssemblyFingerprint: sha("e"),
  } as const;
  const checks = FINAL_MECHANICAL_CHECK_V2_IDS.map((checkId) => ({
    checkId,
    status: ["external-references", "reference-fidelity"].includes(checkId)
      ? ("not-applicable" as const)
      : ("pass" as const),
    failureReasons: [],
  }));
  const base = {
    schemaVersion: 2 as const,
    reportVersion: "final-mechanical-check-v2" as const,
    storyId: "synthetic-proof",
    level: "final" as const,
    aggregateStatus: "pass" as const,
    inputIdentity: identity,
    checks,
  };
  assert.doesNotThrow(() => createFinalMechanicalCheckV2Report(base));
  assert.throws(() =>
    createFinalMechanicalCheckV2Report({
      ...base,
      checks: [...checks].reverse(),
    }),
  );
  assert.throws(() =>
    createFinalMechanicalCheckV2Report({
      ...base,
      inputIdentity: { ...identity, extra: true },
    }),
  );
});

test("current visual assembly verifies the authored timeline and refuses a retained narration identity", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "axmorf-current-visual-assembly-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "synthetic-proof";
  const projectDir = join(rootDir, "src/projects", storyId);
  const writeJson = async (path: string, value: unknown) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  };
  const projectSource = parseNarrativeProjectSource({
    brief: { ...validVideoBrief, storyId },
    story: {
      schemaVersion: 3,
      storyId,
      title: "Visual proof",
      beats: [
        {
          kind: "visual-scene",
          meaningId: "mechanism",
          narrativePurpose: "Show a causal mechanism.",
          durationInFrames: 93,
        },
      ],
    },
    narration: null,
    render: { ...validRenderSpec, compositionId: "SyntheticProof" },
  });
  const timing = generateVisualSemanticTiming({
    story: projectSource.story,
    render: projectSource.render,
  });
  const catalog = buildResourceCatalog([]);
  const globalVisual = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId,
    compositionId: projectSource.render.compositionId,
    width: projectSource.render.width,
    height: projectSource.render.height,
    fps: projectSource.render.fps,
    durationInFrames: timing.durationInFrames,
    captionSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    catalogFingerprint: catalog.catalogFingerprint,
    frameTreatment: {
      inset: 0,
      borderWidth: 0,
      borderColor: "#ffffff",
      borderOpacity: 0,
      vignetteOpacity: 0,
      grainOpacity: 0,
    },
    continuityMotif: {
      color: "#ffffff",
      strokeWidth: 1,
      opacity: 0,
      motionPolicy: "linear-frame-progress-v1",
      windows: [],
    },
  });
  await Promise.all([
    ...Object.entries(projectSource).map(([name, value]) =>
      writeJson(join(projectDir, `${name}.json`), value),
    ),
    writeJson(
      join(projectDir, "generated/sealed-narration.generated.json"),
      null,
    ),
    writeJson(
      join(projectDir, "generated/mastered-narration.generated.json"),
      null,
    ),
    writeJson(
      join(projectDir, "generated/semantic-timing.generated.json"),
      timing,
    ),
    writeJson(
      join(projectDir, "generated/resource-catalog.generated.json"),
      catalog,
    ),
    writeJson(join(projectDir, "global-visual-plan.json"), globalVisual),
  ]);
  await writeFile(
    join(projectDir, "Composition.tsx"),
    "export default () => null;\n",
  );
  const planInput = {
    ...finalAssemblyInput(),
    durationInFrames: timing.durationInFrames,
    semanticTimingFingerprint: timing.fingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    globalVisualPlanFingerprint: globalVisual.planFingerprint,
    compositionSourceChecksum: await checksumFile(
      join(projectDir, "Composition.tsx"),
    ),
    sealedNarrationChecksum: null,
    sealedNarrationFingerprint: null,
  };
  await writeJson(
    join(projectDir, "generated/final-assembly.generated.json"),
    createFinalAssemblyPlan(planInput),
  );
  const sceneBranch: FinalSceneBranchResult = {
    referenceModes: ["empty"],
    visualStyleFingerprint: sha("1"),
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    externalSnapshotFingerprints: [],
    fidelityReceiptFingerprints: [],
    sceneCoverageFingerprint: planInput.sceneCoverageFingerprint,
    scenePackageFingerprints: planInput.scenePackageFingerprints,
    rendererRegistryFingerprint: planInput.rendererRegistryFingerprint,
    storyVisualProjectionFingerprint:
      planInput.storyVisualProjectionFingerprint,
    soundDesignProjectionFingerprint:
      planInput.soundDesignProjectionFingerprint,
    compositionAssemblyChecksum: planInput.compositionSourceChecksum,
    checkStatuses: {
      "visual-style": "pass",
      "resource-catalog": "pass",
      "external-references": "not-applicable",
      "reference-fidelity": "not-applicable",
      "scene-coverage": "pass",
      "scene-packages": "pass",
      "renderer-registry": "pass",
      "scene-projections": "pass",
      "composition-assembly": "pass",
    },
  };
  const current = await loadCurrentFinalAssemblyBranch({
    rootDir,
    projectId: storyId,
    sceneBranch,
  });
  assert.equal(current.checkStatuses["final-assembly"], "pass");
  await writeJson(
    join(projectDir, "generated/final-assembly.generated.json"),
    createFinalAssemblyPlan({
      ...planInput,
      sealedNarrationChecksum: sha("2"),
      sealedNarrationFingerprint: sha("3"),
    }),
  );
  assert.equal(
    (
      await loadCurrentFinalAssemblyBranch({
        rootDir,
        projectId: storyId,
        sceneBranch,
      })
    ).checkStatuses["final-assembly"],
    "fail",
  );
  await writeJson(
    join(projectDir, "generated/final-assembly.generated.json"),
    createFinalAssemblyPlan(planInput),
  );
  const nextStory = StorySpecSchema.parse({
    ...projectSource.story,
    beats: [
      {
        kind: "visual-scene" as const,
        meaningId: "mechanism",
        narrativePurpose: "Show a causal mechanism.",
        durationInFrames: 94,
      },
    ],
  });
  await writeJson(join(projectDir, "story.json"), nextStory);
  await writeJson(
    join(projectDir, "generated/semantic-timing.generated.json"),
    generateVisualSemanticTiming({
      story: nextStory,
      render: projectSource.render,
    }),
  );
  assert.equal(
    (
      await loadCurrentFinalAssemblyBranch({
        rootDir,
        projectId: storyId,
        sceneBranch,
      })
    ).checkStatuses["final-assembly"],
    "fail",
  );
});
