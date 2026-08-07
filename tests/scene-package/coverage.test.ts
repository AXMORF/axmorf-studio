import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneCoverageMapSchema,
  buildSceneFallbackDeclaration,
  buildSceneCoverageMap,
} from "../../src/contracts/scene-package";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createM6PackageInput } from "../fixtures/scene/m6-package-input";

test("coverage follows StoryBeat order with exclusive ready fallback missing and stale states", () => {
  const ready = buildScenePackage(createM6PackageInput());
  const fallback = buildSceneFallbackDeclaration({
    taskInputFingerprint: `sha256:${"b".repeat(64)}`,
    meaningId: "meaning-two",
    reason: "An approved transparent fallback for this synthetic fixture.",
  });
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: [
      "meaning-one",
      "meaning-two",
      "meaning-three",
      "meaning-four",
    ],
    packages: [ready],
    fallbacks: [fallback],
    stalePackages: [
      {
        meaningId: "meaning-four",
        packageFingerprint: `sha256:${"c".repeat(64)}`,
        driftLayer: "renderer-source",
      },
    ],
  });
  assert.deepEqual(
    coverage.entries.map((entry) => entry.status),
    ["ready", "fallback", "missing", "stale"],
  );
  assert.equal(
    SceneCoverageMapSchema.parse(coverage).coverageFingerprint,
    coverage.coverageFingerprint,
  );
});

test("coverage rejects duplicate unknown out-of-order and conflicting claims", () => {
  const ready = buildScenePackage(createM6PackageInput());
  const base = {
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one"],
    packages: [ready],
    fallbacks: [],
    stalePackages: [],
  } as const;
  for (const mutation of [
    { ...base, storyBeatOrder: ["meaning-one", "meaning-one"] },
    { ...base, packages: [{ ...ready, meaningId: "unknown" }] },
    {
      ...base,
      fallbacks: [
        buildSceneFallbackDeclaration({
          taskInputFingerprint: `sha256:${"b".repeat(64)}`,
          meaningId: "meaning-one",
          reason: "Conflicts with ready.",
        }),
      ],
    },
  ]) {
    assert.throws(() => buildSceneCoverageMap(mutation));
  }
});
