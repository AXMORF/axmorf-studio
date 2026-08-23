import {
  PexelsAcquisitionReceiptV1Schema,
  assertImportableExternalAssetAcquisition,
  buildExternalAssetAcquisition,
} from "../../../src/contracts";

export const adaptPexelsAcquisitionReceiptV1 = (rawReceipt: unknown) => {
  const receipt = PexelsAcquisitionReceiptV1Schema.parse(rawReceipt);
  return assertImportableExternalAssetAcquisition(
    buildExternalAssetAcquisition({
      schemaVersion: 1,
      provider: receipt.provider,
      providerAssetId: receipt.providerAssetId,
      providerReceiptId: receipt.acquisitionId,
      assetKind: "image",
      sourcePageUrl: receipt.sourcePageUrl,
      creator: receipt.creator,
      license: receipt.license,
      attribution: {
        required: receipt.providerPolicy.attributionRequired,
        text: receipt.providerPolicy.attributionText,
      },
      acquiredAt: receipt.acquiredAt,
      file: {
        relativePath: receipt.file.relativePath,
        mimeType: receipt.file.mimeType,
        width: receipt.file.width,
        height: receipt.file.height,
        sizeBytes: receipt.file.sizeInBytes,
        sha256: `sha256:${receipt.file.sha256}`,
      },
    }),
  );
};
