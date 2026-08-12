import assert from "node:assert/strict";
import test from "node:test";

import {
  ExternalAssetAcquisitionSchema,
  ExternalImageAssetAcquisitionSchema,
  assertImportableExternalAssetAcquisition,
  buildExternalAssetAcquisition,
} from "../../src/contracts";
import { adaptPexelsAcquisitionReceiptV1 } from "../../scripts/project-assets/adapters/pexels-receipt";

const sha = (character: string) => character.repeat(64);

const pexelsReceipt = () => ({
  schemaVersion: 1,
  acquisitionId: "pexels:2014422",
  provider: "pexels",
  providerAssetId: "2014422",
  sourcePageUrl: "https://www.pexels.com/photo/granite-2014422/",
  creator: {
    name: "Fixture Photographer",
    profileUrl: "https://www.pexels.com/@fixture-photographer",
  },
  license: {
    name: "Pexels License",
    url: "https://www.pexels.com/license/",
  },
  providerPolicy: {
    attributionRequired: true,
    attributionText: "Photo by Fixture Photographer on Pexels",
  },
  searchContext: {
    query: "granite",
    orientation: "landscape",
    selectionNote: "Opening reality anchor",
  },
  file: {
    relativePath: "original.png",
    mimeType: "image/png",
    width: 1,
    height: 1,
    sizeInBytes: 68,
    sha256: sha("a"),
  },
  acquiredAt: "2026-08-12T00:00:00.000Z",
});

test("strict Pexels receipt v1 maps into a fingerprinted generic image acquisition", () => {
  const acquisition = adaptPexelsAcquisitionReceiptV1(pexelsReceipt());
  assert.equal(acquisition.assetKind, "image");
  assert.equal(acquisition.provider, "pexels");
  assert.equal(acquisition.file.sizeBytes, 68);
  assert.match(acquisition.provenanceFingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    ExternalImageAssetAcquisitionSchema.parse(acquisition),
    acquisition,
  );

  assert.throws(() =>
    adaptPexelsAcquisitionReceiptV1({ ...pexelsReceipt(), unknown: true }),
  );
  assert.throws(() =>
    adaptPexelsAcquisitionReceiptV1({ ...pexelsReceipt(), schemaVersion: 2 }),
  );
  assert.throws(() =>
    adaptPexelsAcquisitionReceiptV1({ ...pexelsReceipt(), assetKind: "video" }),
  );
  assert.throws(() =>
    adaptPexelsAcquisitionReceiptV1({
      ...pexelsReceipt(),
      providerPolicy: { attributionRequired: true, attributionText: "" },
    }),
  );
});

test("generic acquisition is an extensible discriminated union while import policy fails closed", () => {
  const common = {
    schemaVersion: 1,
    provider: "future-provider",
    providerAssetId: "asset-1",
    providerReceiptId: "future-provider:asset-1",
    sourcePageUrl: "https://example.com/assets/asset-1",
    creator: { name: "Creator", profileUrl: "https://example.com/creator" },
    license: { name: "Example License", url: "https://example.com/license" },
    attribution: { required: true, text: "Media by Creator" },
    acquiredAt: "2026-08-12T00:00:00.000Z",
  } as const;
  const video = buildExternalAssetAcquisition({
    ...common,
    assetKind: "video",
    file: {
      relativePath: "original.mp4",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationInMilliseconds: 1_000,
      codec: "h264",
      sizeBytes: 100,
      sha256: `sha256:${sha("b")}`,
    },
  });
  const audio = buildExternalAssetAcquisition({
    ...common,
    providerAssetId: "asset-2",
    assetKind: "audio",
    file: {
      relativePath: "original.wav",
      mimeType: "audio/wav",
      durationInMilliseconds: 1_000,
      codec: "pcm_s16le",
      sampleRate: 48_000,
      channels: 1,
      sizeBytes: 100,
      sha256: `sha256:${sha("c")}`,
    },
  });
  assert.equal(ExternalAssetAcquisitionSchema.parse(video).assetKind, "video");
  assert.equal(ExternalAssetAcquisitionSchema.parse(audio).assetKind, "audio");
  assert.throws(
    () => assertImportableExternalAssetAcquisition(video),
    /image/iu,
  );
  assert.throws(
    () => assertImportableExternalAssetAcquisition(audio),
    /image/iu,
  );
});
