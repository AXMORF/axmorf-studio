import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerAssetManifestSchema,
  assertProducerAssetManifest,
} from "../../src/contracts/assets";
import { getProducerSoundLibrary } from "../../src/remotion/capabilities/sound/library";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const license = {
  id: "CC0-1.0",
  verificationStatus: "verified",
  sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  attributionText: null,
  verifiedAt: "2026-08-02T00:00:00.000Z",
  sourceEvidenceFingerprint: digest("a"),
} as const;

const ambience = {
  schemaVersion: 1,
  id: "audio.proof-ambience",
  kind: "asset",
  status: "approved",
  title: "Proof ambience",
  description: "Verified local ambience",
  useCases: ["scene ambience"],
  tags: ["ambience", "proof"],
  authority: {
    kind: "repository-file",
    repositoryPath: "src/remotion/catalog/assets.manifest.json",
  },
  allowedUse: "runtime-approved",
  assetKind: "audio",
  mediaRole: "scene-ambience",
  localPath: "public/assets/library/proof-ambience.wav",
  checksum: digest("b"),
  license,
  media: {
    durationInSeconds: 1,
    codec: "pcm_s16le",
    sampleRate: 48000,
  },
} as const;

test("ProducerAssetManifest remains a strict compatibility view over asset descriptors", () => {
  const manifest = ProducerAssetManifestSchema.parse({
    schemaVersion: 1,
    assets: [ambience],
  });
  assert.doesNotThrow(() => assertProducerAssetManifest(manifest));
  assert.throws(() =>
    ProducerAssetManifestSchema.parse({
      schemaVersion: 1,
      assets: [ambience, ambience],
    }),
  );
  assert.throws(() =>
    ProducerAssetManifestSchema.parse({
      schemaVersion: 1,
      assets: [ambience],
      extra: true,
    }),
  );
});

test("sound library accepts only current verified Scene-local audio", () => {
  const library = getProducerSoundLibrary({
    schemaVersion: 1,
    assets: [ambience],
  });
  assert.equal(library.ambience.length, 1);
  assert.equal(library.sfx.length, 0);
  assert.equal(library.narration.length, 0);
  assert.equal(library.bgm.length, 0);

  assert.throws(() =>
    getProducerSoundLibrary({
      schemaVersion: 1,
      assets: [{ ...ambience, mediaRole: "narration" }],
    }),
  );
  assert.throws(() =>
    getProducerSoundLibrary({
      schemaVersion: 1,
      assets: [
        {
          ...ambience,
          status: "blocked",
          allowedUse: "blocked",
          license: { ...license, verificationStatus: "unverified" },
        },
      ],
    }),
  );
});
