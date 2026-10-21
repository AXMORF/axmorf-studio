import assert from "node:assert/strict";
import test from "node:test";

import {
  createFingerprint,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";

test("canonical JSON sorts object keys and preserves array order", () => {
  assert.equal(
    serializeCanonicalJson({ b: 2, a: [3, 1] }),
    '{"a":[3,1],"b":2}',
  );
  assert.notEqual(
    serializeCanonicalJson([1, 2]),
    serializeCanonicalJson([2, 1]),
  );
  assert.throws(() => serializeCanonicalJson({ invalid: undefined }));
  assert.throws(() => serializeCanonicalJson(Number.POSITIVE_INFINITY));
  assert.throws(() => serializeCanonicalJson(new Array(1)));
  assert.throws(() => serializeCanonicalJson({ [Symbol("hidden")]: true }));
});

test("fingerprint uses a stable domain-separated SHA-256 value", () => {
  assert.equal(
    createFingerprint({ namespace: "test", version: 1, value: { b: 2, a: 1 } }),
    "sha256:b4e91d40fea999175beb7d25b9b48f5328882e5bd798c61bff5544822fae64fa",
  );
});
