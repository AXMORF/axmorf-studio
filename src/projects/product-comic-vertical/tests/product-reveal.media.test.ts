import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ReferenceFidelityReviewSchema } from "../../../contracts";

const rootDir = process.cwd();

const checksum = async (path: string) =>
  `sha256:${createHash("sha256")
    .update(new Uint8Array(await readFile(join(rootDir, path))))
    .digest("hex")}`;

test("product-reveal fidelity review media bytes match every sealed checksum", async () => {
  const review = ReferenceFidelityReviewSchema.parse(
    JSON.parse(
      await readFile(
        join(
          rootDir,
          "src/projects/product-comic-vertical/scenes/product-reveal/generated/reference-fidelity-review.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  for (const item of review.items) {
    for (const artifact of [
      item.sourcePreview,
      item.adaptationPreview,
      ...item.phasePairs.flatMap((pair) => [
        pair.sourceEvidence,
        pair.adaptationEvidence,
      ]),
    ]) {
      assert.equal(await checksum(artifact.artifactPath), artifact.checksum);
    }
  }
});
