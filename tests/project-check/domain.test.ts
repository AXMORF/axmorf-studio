import assert from "node:assert/strict";
import test from "node:test";

import { NARRATIVE_AUTO_CHECK_IDS } from "../../src/contracts";
import {
  createNarrativeCheckItem,
  mapNarrativeCheckFailure,
} from "../../scripts/project-check/domain";

test("safe failure mapping uses fixed codes and never exposes raw diagnostics", () => {
  const cases = [
    ["source-contracts", new Error("ENOENT /home/private/token"), "missing"],
    ["source-contracts", new Error("contains malformed JSON at /data/private"), "malformed"],
    ["sealed-narration", new Error("checksum is stale"), "checksum-mismatch"],
    ["story-check", new Error("identity does not match endpoint"), "identity-mismatch"],
    ["project-registry", new Error("ProjectRegistry drift: stale bytes"), "registry-drift"],
    ["m3-evidence", new Error("ffprobe wrong codec"), "media-invalid"],
  ] as const;
  for (const [checkId, error, expectedCode] of cases) {
    const reason = mapNarrativeCheckFailure(checkId, error);
    assert.equal(reason.code, expectedCode);
    assert.doesNotMatch(
      JSON.stringify(reason),
      /\/home\/|\/data\/|token|endpoint|stack|cause/i,
    );
  }
});

test("fixed check items preserve order-specific evidence ownership", () => {
  assert.deepEqual(
    NARRATIVE_AUTO_CHECK_IDS.map((checkId) =>
      createNarrativeCheckItem({ checkId, status: "pass" }),
    ).map((item) => [item.checkId, item.evidenceIds]),
    [
      ["source-contracts", []],
      ["story-check", ["story-check"]],
      ["sealed-narration", ["sealed-manifest", "complete-wav"]],
      ["semantic-timing", ["semantic-timing"]],
      ["project-registry", ["project-registry"]],
      ["narrative-baseline", []],
      ["m3-evidence", ["m3-receipt"]],
    ],
  );
  const failed = createNarrativeCheckItem({
    checkId: "project-registry",
    status: "fail",
    error: new Error("ProjectRegistry drift at /srv/private"),
  });
  assert.equal(failed.failureReasons[0]?.code, "registry-drift");
  assert.doesNotMatch(JSON.stringify(failed), /\/srv\/|private/i);
});
