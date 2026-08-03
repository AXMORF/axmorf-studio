import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {
  M9_MEANING_IDS,
  buildM9StillManifest,
  validateM9SceneReview,
} from "../../scripts/m9-product/scene-evidence";

const rootDir = process.cwd();

test("M9 scene review is current pass-only and binds all ten packages", async () => {
  const review = await validateM9SceneReview({
    rootDir,
    rawReview: JSON.parse(
      await readFile(
        join(
          rootDir,
          "src/projects/product-comic-vertical/reviews/scene-review.json",
        ),
        "utf8",
      ),
    ),
  });
  assert.equal(review.status, "pass");
  assert.deepEqual(review.scenes.map(({meaningId}) => meaningId), M9_MEANING_IDS);
  assert.equal(review.scenes.length, 10);
  assert.equal(review.continuity.length, 9);
  const stills = buildM9StillManifest();
  assert.equal(stills.length, 45);
  assert.deepEqual(
    stills
      .filter(({purpose}) =>
        ["entry", "middle", "exit"].includes(purpose),
      )
      .map(({meaningId}) => meaningId),
    M9_MEANING_IDS.flatMap((meaningId) => [meaningId, meaningId, meaningId]),
  );
  assert.equal(
    stills.filter(({purpose}) => purpose.startsWith("exact-phase-")).length,
    3,
  );
  assert.equal(
    stills.filter(({purpose}) => purpose === "scene-cue-peak").length,
    10,
  );
});

test("M9 scene review rejects a stale package identity", async () => {
  const raw = JSON.parse(
    await readFile(
      join(
        rootDir,
        "src/projects/product-comic-vertical/reviews/scene-review.json",
      ),
      "utf8",
    ),
  ) as {scenes: {packageFingerprint: string}[]};
  raw.scenes[0]!.packageFingerprint = `sha256:${"0".repeat(64)}`;
  await assert.rejects(
    validateM9SceneReview({rootDir, rawReview: raw}),
    /stale|identity|order/iu,
  );
});
