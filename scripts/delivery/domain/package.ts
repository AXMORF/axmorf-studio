import {
  DeliveryLaunchManifestSchema,
  DeliveryPublishingSchema,
  RenderLaunchIntentSchema,
  RenderLaunchReceiptSchema,
  serializeCanonicalJson,
  type DeliveryLaunchManifest,
  type DeliveryPublishing,
} from "../../../src/contracts";

export const serializeDeliveryJson = (value: unknown) =>
  `${serializeCanonicalJson(value)}\n`;

export const buildDeliveryHandoff = ({
  manifest,
  publishing,
}: {
  readonly manifest: DeliveryLaunchManifest;
  readonly publishing: DeliveryPublishing;
}) =>
  [
    `# ${publishing.title}`,
    "",
    `- Story: \`${manifest.storyId}\``,
    `- Composition: \`${manifest.compositionId}\``,
    `- Delivery: \`${manifest.deliveryId}\``,
    `- Planned duration: \`${publishing.plannedDurationSeconds}s\``,
    "",
    "## Immutable launch package",
    "",
    "- `cover-4x3.png`",
    "- `cover-3x4.png`",
    "- `publishing.json`",
    "- `delivery-launch-manifest.json`",
    "- `render-launch-intent.json`",
    "- `immutable-checksums.sha256`",
    "",
    "The MP4 is rendered asynchronously to the planned output path. A launch receipt proves only that the operating system acknowledged process creation; it proves no later render state or media validity.",
    "",
    "## Manual diagnostic only",
    "",
    "```bash",
    `npm run delivery:check -- --project ${manifest.storyId} --delivery ${manifest.deliveryId}`,
    "```",
    "",
  ].join("\n");

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
      entry.fileName === "immutable-checksums.sha256"
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

const assertCanonical = <Value>(
  raw: unknown,
  expected: Value,
  parse: (input: unknown) => Value,
  label: string,
) => {
  const actual = parse(raw);
  if (serializeDeliveryJson(actual) !== serializeDeliveryJson(expected)) {
    throw new Error(`${label} drifted.`);
  }
  return actual;
};

export const assertCanonicalPublishing = (
  raw: unknown,
  expected: DeliveryPublishing,
) =>
  assertCanonical(
    raw,
    expected,
    DeliveryPublishingSchema.parse,
    "Delivery publishing metadata",
  );

export const assertCanonicalLaunchManifest = (
  raw: unknown,
  expected: DeliveryLaunchManifest,
) =>
  assertCanonical(
    raw,
    expected,
    DeliveryLaunchManifestSchema.parse,
    "Delivery launch manifest",
  );

export const assertCanonicalLaunchIntent = (
  raw: unknown,
  expected: ReturnType<typeof RenderLaunchIntentSchema.parse>,
) =>
  assertCanonical(
    raw,
    expected,
    RenderLaunchIntentSchema.parse,
    "Render launch intent",
  );

export const parseLaunchReceipt = (raw: unknown) =>
  RenderLaunchReceiptSchema.parse(raw);
