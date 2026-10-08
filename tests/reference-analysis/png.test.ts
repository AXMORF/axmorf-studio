import assert from "node:assert/strict";
import test from "node:test";

import {
  referencePngCrc32,
  validateReferencePreviewPng,
} from "../../scripts/reference-analysis/png";
import { fixtureRgbPng } from "./fixtures";

test("PNG validation checks complete RGB pixels, geometry and CRCs", () => {
  assert.equal(referencePngCrc32(Buffer.from("123456789")), 0xcbf43926);
  const png = fixtureRgbPng(4, 3, (x, y) => x * 20 + y * 30);
  assert.doesNotThrow(() =>
    validateReferencePreviewPng(png, { width: 4, height: 3 }),
  );
  assert.throws(
    () => validateReferencePreviewPng(png, { width: 5, height: 3 }),
    /geometry/u,
  );
  const corrupt = Buffer.from(png);
  corrupt[45] ^= 1;
  assert.throws(
    () => validateReferencePreviewPng(corrupt, { width: 4, height: 3 }),
    /chunk checksum/u,
  );
  assert.throws(
    () =>
      validateReferencePreviewPng(png.subarray(0, png.length - 4), {
        width: 4,
        height: 3,
      }),
    /truncated/u,
  );
  assert.throws(
    () =>
      validateReferencePreviewPng(Buffer.concat([png, Buffer.from([0])]), {
        width: 4,
        height: 3,
      }),
    /trailing bytes/u,
  );
});

test("a PNG with self-consistent CRCs but invalid compressed pixels is rejected", () => {
  const png = fixtureRgbPng(4, 3);
  const damaged = Buffer.from(png);
  const idat = 33;
  const length = damaged.readUInt32BE(idat);
  damaged[idat + 8] = 0;
  damaged.writeUInt32BE(
    referencePngCrc32(damaged.subarray(idat + 4, idat + 8 + length)),
    idat + 8 + length,
  );
  assert.throws(
    () => validateReferencePreviewPng(damaged, { width: 4, height: 3 }),
    /compressed data/u,
  );
});
