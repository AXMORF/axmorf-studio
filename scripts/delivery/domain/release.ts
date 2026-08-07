import {
  DeliveryPublishingSchema,
  DeliveryReleaseManifestSchema,
  serializeCanonicalJson,
  type DeliveryPublishing,
  type DeliveryReleaseManifest,
} from "../../../src/contracts";

export const serializeDeliveryJson = (value: unknown) =>
  `${serializeCanonicalJson(value)}\n`;

export const buildDeliveryHandoff = ({
  manifest,
  publishing,
}: {
  readonly manifest: Pick<
    DeliveryReleaseManifest,
    "releaseId" | "storyId" | "compositionId" | "identities" | "verification"
  >;
  readonly publishing: DeliveryPublishing;
}) => {
  const lines = [
    `# ${publishing.title}`,
    "",
    `- Story: \`${manifest.storyId}\``,
    `- Composition: \`${manifest.compositionId}\``,
    `- Release: \`${manifest.releaseId}\``,
    `- Approved preview: \`${manifest.identities.approvedPreviewChecksum}\``,
    `- FinalAssembly: \`${manifest.identities.finalAssemblyFingerprint}\``,
    `- Final check: \`${manifest.identities.finalMechanicalCheckReportFingerprint}\``,
    "",
    "## Files",
    "",
    `- \`${publishing.mp4FileName}\``,
    "- `cover-4x3.png`",
    "- `cover-3x4.png`",
    "- `publishing.json`",
    "- `release-manifest.json`",
    "- `checksums.sha256`",
    "",
    "## Verify",
    "",
    "```bash",
    manifest.verification.deliveryCheckCommand,
    manifest.verification.checksumCommand,
    "```",
    "",
    "This package is local delivery only. It performs no upload, login, network publishing, promotion, or approval signing.",
    "",
  ];
  return lines.join("\n");
};

export type ChecksumLedgerEntry = Readonly<{
  fileName: string;
  checksum: string;
}>;

export const buildChecksumLedger = (
  entries: readonly ChecksumLedgerEntry[],
) => {
  const sorted = [...entries].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  if (
    sorted.length === 0 ||
    new Set(sorted.map(({ fileName }) => fileName)).size !== sorted.length
  ) {
    throw new Error("Delivery checksum ledger requires unique files.");
  }
  for (const entry of sorted) {
    if (
      !/^sha256:[0-9a-f]{64}$/u.test(entry.checksum) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(entry.fileName) ||
      entry.fileName === "checksums.sha256"
    ) {
      throw new Error("Delivery checksum ledger entry is invalid.");
    }
  }
  return `${sorted
    .map(
      ({ checksum, fileName }) =>
        `${checksum.slice("sha256:".length)}  ${fileName}`,
    )
    .join("\n")}\n`;
};

export const assertCanonicalPublishing = (
  raw: unknown,
  expected: DeliveryPublishing,
) => {
  const actual = DeliveryPublishingSchema.parse(raw);
  if (serializeDeliveryJson(actual) !== serializeDeliveryJson(expected)) {
    throw new Error("Delivery publishing metadata drifted.");
  }
  return actual;
};

export const assertCanonicalReleaseManifest = (
  raw: unknown,
  expected: DeliveryReleaseManifest,
) => {
  const actual = DeliveryReleaseManifestSchema.parse(raw);
  if (serializeDeliveryJson(actual) !== serializeDeliveryJson(expected)) {
    throw new Error("Delivery release manifest drifted.");
  }
  return actual;
};
