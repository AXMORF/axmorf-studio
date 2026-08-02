import assert from "node:assert/strict";
import test from "node:test";

import {
  gpsRelativityCoverage,
  gpsRelativityRendererPropsByMeaning,
  gpsRelativityRendererRegistry,
  gpsRelativitySoundDesignProjection,
  gpsRelativityStoryVisualProjection,
} from "../../src/projects/gps-relativity/scene-runtime-data";

const meaningIds = [
  "position-is-time",
  "two-relativistic-effects",
  "net-drift",
  "error-accumulation",
  "practical-conclusion",
] as const;

test("GPS M7 runtime data binds five ready Scenes in Story order", () => {
  assert.deepEqual(gpsRelativityCoverage.storyBeatOrder, meaningIds);
  assert.deepEqual(
    gpsRelativityCoverage.entries.map((entry) => entry.status),
    meaningIds.map(() => "ready"),
  );
  assert.deepEqual(
    gpsRelativityStoryVisualProjection.entries.map(
      ({ meaningId }) => meaningId,
    ),
    meaningIds,
  );
  assert.deepEqual(
    gpsRelativitySoundDesignProjection.entries.map(
      ({ meaningId }) => meaningId,
    ),
    meaningIds,
  );
  assert.deepEqual(
    Object.keys(gpsRelativityRendererPropsByMeaning),
    meaningIds,
  );
  assert.equal(Object.keys(gpsRelativityRendererRegistry).length, 5);
});

test("GPS M7 uses fixed Beat windows and four zero-duration hard cuts", () => {
  assert.deepEqual(
    gpsRelativityStoryVisualProjection.entries.map(
      ({ startFrame, endFrame }) => [startFrame, endFrame],
    ),
    [
      [15, 361],
      [361, 696],
      [696, 1018],
      [1018, 1433],
      [1433, 1716],
    ],
  );
  assert.equal(gpsRelativityStoryVisualProjection.durationInFrames, 1731);
  assert.equal(gpsRelativityStoryVisualProjection.transitions.length, 4);
  for (const transition of gpsRelativityStoryVisualProjection.transitions) {
    assert.equal(transition.kind, "hard-cut");
    assert.equal(transition.durationInFrames, 0);
  }
});
