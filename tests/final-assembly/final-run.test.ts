import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_MECHANICAL_CHECK_V2_IDS,
  createFinalAssemblyPlan,
  createFinalMechanicalCheckV2Report,
} from "@axmorf/studio/contracts";
import { finalAssemblyInput } from "../fixtures/final-assembly/input";

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
