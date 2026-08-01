import assert from "node:assert/strict";
import test from "node:test";

import { SealedNarrationManifestSchema } from "../../src/contracts/sealed-narration";
import { buildValidSealedNarrationManifest } from "../fixtures/narrative";

test("sealed narration validates ordered measured PCM artifacts", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.equal(
    SealedNarrationManifestSchema.parse(manifest).completeAudio
      .sampleFrameCount,
    110400,
  );
});

test("sealed narration rejects partial totals and stale fingerprints", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      completeAudio: { ...manifest.completeAudio, sampleFrameCount: 110399 },
    }),
  );
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: manifest.segments.map((segment, index) =>
        index === 0 && segment.kind === "chunk"
          ? { ...segment, checksum: `sha256:${"d".repeat(64)}` }
          : segment,
      ),
    }),
  );
});

test("pause segments must immediately follow their declared chunk", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: [
        manifest.segments[1],
        manifest.segments[0],
        manifest.segments[2],
      ],
    }),
  );
});

test("sealed narration paths stay inside the owning Story directory", () => {
  const manifest = buildValidSealedNarrationManifest();
  assert.throws(() =>
    SealedNarrationManifestSchema.parse({
      ...manifest,
      segments: manifest.segments.map((segment, index) =>
        index === 0 && segment.kind === "chunk"
          ? {
              ...segment,
              localPath: "public/projects/other-story/narration/opening.wav",
            }
          : segment,
      ),
    }),
  );
});
