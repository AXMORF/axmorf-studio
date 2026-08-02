import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateM7SceneReview } from "../../scripts/m7-gps/evidence";

const rootDir = join(import.meta.dirname, "../..");

test("M7 review strictly binds five current Scene and four continuity conclusions", async () => {
  const raw = JSON.parse(
    await readFile(
      join(rootDir, "src/projects/gps-relativity/reviews/m7-scene-review.json"),
      "utf8",
    ),
  );
  const review = await validateM7SceneReview({ rootDir, rawReview: raw });
  assert.equal(review.scenes.length, 5);
  assert.equal(review.continuity.length, 4);
  assert.ok(review.scenes.every((scene) => scene.visual.status === "pass"));
  assert.ok(review.scenes.every((scene) => scene.sound.status === "pass"));
  await assert.rejects(() =>
    validateM7SceneReview({
      rootDir,
      rawReview: {
        ...raw,
        scenes: [raw.scenes[1], raw.scenes[0], ...raw.scenes.slice(2)],
      },
    }),
  );
  await assert.rejects(() =>
    validateM7SceneReview({
      rootDir,
      rawReview: {
        ...raw,
        continuity: raw.continuity.map(
          (entry: Record<string, unknown>, index: number) =>
            index === 0
              ? {
                  ...entry,
                  fromSceneVisualFingerprint: `sha256:${"a".repeat(64)}`,
                }
              : entry,
        ),
      },
    }),
  );
});

test("M7 evidence source excludes approval release and automatic aesthetic scoring", async () => {
  const source = await readFile(
    join(rootDir, "scripts/m7-gps/evidence.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /FinalPreviewApproval|userApproval|releaseStatus|aestheticScore/u,
  );
});
