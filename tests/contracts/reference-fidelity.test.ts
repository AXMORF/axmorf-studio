import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ReferenceFidelityReviewSchema,
  buildNotApplicableFidelityReceipt,
  computeReferenceFidelityReviewFingerprint,
} from "../../src/contracts/reference-fidelity";

const repositoryRoot = join(import.meta.dirname, "../..");

test("Agent review record is strict current and binds paired phases normal-speed previews and traits", async () => {
  const raw = JSON.parse(
    await readFile(
      join(
        repositoryRoot,
        "tests/fixtures/external-references/fidelity/source-adaptation-review.json",
      ),
      "utf8",
    ),
  );
  const review = ReferenceFidelityReviewSchema.parse(raw);
  assert.equal(
    computeReferenceFidelityReviewFingerprint(review),
    review.reviewFingerprint,
  );
  assert.equal(review.items[0].recognizable, true);
  assert.equal(review.items[0].phasePairs.length, 2);
  assert.throws(() =>
    ReferenceFidelityReviewSchema.parse({
      ...review,
      items: [{ ...review.items[0], recognizable: false }],
    }),
  );
  assert.throws(() =>
    ReferenceFidelityReviewSchema.parse({
      ...review,
      items: [
        {
          ...review.items[0],
          traitReviews: [{ ...review.items[0].traitReviews[0], note: "" }],
        },
      ],
    }),
  );
});

test("empty and inspiration selections produce strict not-applicable identities only", () => {
  const empty = buildNotApplicableFidelityReceipt({
    selectionFingerprint: `sha256:${"a".repeat(64)}`,
    reason: "empty",
  });
  const inspiration = buildNotApplicableFidelityReceipt({
    selectionFingerprint: `sha256:${"b".repeat(64)}`,
    reason: "inspiration-only",
  });
  assert.equal(empty.status, "not-applicable");
  assert.notEqual(empty.receiptFingerprint, inspiration.receiptFingerprint);
  assert.throws(() =>
    buildNotApplicableFidelityReceipt({
      selectionFingerprint: `sha256:${"a".repeat(64)}`,
      reason: "exact-demo-localized" as never,
    }),
  );
});
