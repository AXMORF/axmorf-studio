import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerAssetManifestSchema,
  assertProducerAssetManifest,
} from "@axmorf/studio/contracts";
import { getProducerSoundLibrary } from "@axmorf/studio/remotion";

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

const soundEffect = {
  schemaVersion: 1,
  id: "audio.proof-effect",
  kind: "asset",
  status: "approved",
  title: "Proof effect",
  description: "Verified local sound effect",
  useCases: ["scene sound effect"],
  tags: ["proof", "sound-effect"],
  authority: {
    kind: "repository-file",
    repositoryPath: "src/remotion/catalog/assets.manifest.json",
  },
  allowedUse: "runtime-approved",
  assetKind: "audio",
  mediaRole: "sound-effect",
  localPath: "public/assets/library/proof-effect.wav",
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
    assets: [soundEffect],
  });
  assert.doesNotThrow(() => assertProducerAssetManifest(manifest));
  assert.throws(() =>
    ProducerAssetManifestSchema.parse({
      schemaVersion: 1,
      assets: [soundEffect, soundEffect],
    }),
  );
  assert.throws(() =>
    ProducerAssetManifestSchema.parse({
      schemaVersion: 1,
      assets: [soundEffect],
      extra: true,
    }),
  );
});

test("sound library accepts only current verified sound contributions", () => {
  const library = getProducerSoundLibrary({
    schemaVersion: 1,
    assets: [soundEffect],
  });
  assert.equal(library["sound-effect"].length, 1);
  assert.equal(library["background-music"].length, 0);

  assert.throws(() =>
    getProducerSoundLibrary({
      schemaVersion: 1,
      assets: [{ ...soundEffect, mediaRole: "narration" }],
    }),
  );
  assert.throws(() =>
    getProducerSoundLibrary({
      schemaVersion: 1,
      assets: [
        {
          ...soundEffect,
          status: "blocked",
          allowedUse: "blocked",
          license: { ...license, verificationStatus: "unverified" },
        },
      ],
    }),
  );
});
