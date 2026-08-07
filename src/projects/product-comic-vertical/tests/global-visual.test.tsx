import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
} from "../../../contracts";
import { productComicVerticalFinalAssemblyData } from "../final-assembly-data";

const rootDir = process.cwd();

test("Product Comic GlobalVisual is a vertical project-local continuity treatment", async () => {
  const { globalVisualPlan: plan, globalVisualProjection: projection } =
    productComicVerticalFinalAssemblyData;
  assert.doesNotThrow(() => GlobalVisualPlanSchema.parse(plan));
  assert.doesNotThrow(() => GlobalVisualProjectionSchema.parse(projection));
  assert.equal(plan.storyId, "product-comic-vertical");
  assert.deepEqual(
    [plan.width, plan.height, plan.durationInFrames],
    [1080, 1920, 5116],
  );
  assert.equal(projection.globalVisualPlanFingerprint, plan.planFingerprint);
  assert.ok(plan.continuityMotif.windows.length >= 9);
  const source = await readFile(
    join(
      rootDir,
      "src/projects/product-comic-vertical/global-visual/GlobalVisualLayers.tsx",
    ),
    "utf8",
  );
  assert.match(source, /useCurrentFrame/u);
  assert.match(source, /pointerEvents:\s*["']none["']/u);
  assert.match(source, /product-comic/iu);
  assert.doesNotMatch(
    source,
    /Caption|subtitle|SceneChooser|auto.*layout|modulePath|import\s*\(|animation|transition|gps|satellite|orbit/iu,
  );
});

test("M9 GlobalVisual projection fails closed on plan or source drift", () => {
  const { globalVisualPlan: plan, globalVisualProjection: projection } =
    productComicVerticalFinalAssemblyData;
  assert.throws(() =>
    GlobalVisualPlanSchema.parse({
      ...plan,
      continuityMotif: {
        ...plan.continuityMotif,
        opacity: plan.continuityMotif.opacity + 0.01,
      },
    }),
  );
  assert.throws(() =>
    GlobalVisualProjectionSchema.parse({
      ...projection,
      sourceChecksum: `sha256:${"2".repeat(64)}`,
    }),
  );
});
