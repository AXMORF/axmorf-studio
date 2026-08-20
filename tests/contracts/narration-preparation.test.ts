import assert from "node:assert/strict";
import test from "node:test";

import {
  NARRATION_MASTERING_POLICY,
  NarrationPreparationReceiptSchema,
} from "../../src/contracts";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

test("narration preparation receipt binds the exact provider attempt to the active seal", () => {
  const receipt = NarrationPreparationReceiptSchema.parse({
    schemaVersion: 1,
    contractVersion: "narration-preparation-v1",
    storyId: "story-example",
    generationInputFingerprint: sha("1"),
    providerAttemptFingerprint: sha("2"),
    sealedNarrationFingerprint: sha("3"),
    masteringPolicy: NARRATION_MASTERING_POLICY,
  });

  assert.equal(receipt.providerAttemptFingerprint, sha("2"));
  assert.throws(() =>
    NarrationPreparationReceiptSchema.parse({
      ...receipt,
      privateVoicePath: "/private/voice.wav",
    }),
  );
});
