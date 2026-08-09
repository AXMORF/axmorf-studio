import assert from "node:assert/strict";
import test from "node:test";

import { authorizeNarrationSealPromotion } from "../../scripts/narration/seal-runner";

const sha = (character: string) => `sha256:${character.repeat(64)}`;

test("supersede authorization requires one exact current active seal identity", () => {
  const current = sha("a");
  const next = sha("b");

  assert.equal(
    authorizeNarrationSealPromotion({
      existingFingerprint: undefined,
      nextFingerprint: next,
      supersedeFingerprint: undefined,
    }),
    false,
  );
  assert.throws(
    () =>
      authorizeNarrationSealPromotion({
        existingFingerprint: undefined,
        nextFingerprint: next,
        supersedeFingerprint: current,
      }),
    /no active sealed fingerprint/iu,
  );
  assert.equal(
    authorizeNarrationSealPromotion({
      existingFingerprint: current,
      nextFingerprint: current,
      supersedeFingerprint: undefined,
    }),
    true,
  );
  assert.throws(
    () =>
      authorizeNarrationSealPromotion({
        existingFingerprint: current,
        nextFingerprint: current,
        supersedeFingerprint: sha("c"),
      }),
    /does not match the current sealed fingerprint/iu,
  );
  assert.equal(
    authorizeNarrationSealPromotion({
      existingFingerprint: current,
      nextFingerprint: current,
      supersedeFingerprint: current,
    }),
    true,
  );
  assert.throws(
    () =>
      authorizeNarrationSealPromotion({
        existingFingerprint: current,
        nextFingerprint: next,
        supersedeFingerprint: undefined,
      }),
    /different active seal exists/iu,
  );
  assert.equal(
    authorizeNarrationSealPromotion({
      existingFingerprint: current,
      nextFingerprint: next,
      supersedeFingerprint: current,
    }),
    false,
  );
});
