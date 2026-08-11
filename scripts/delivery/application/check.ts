import { join } from "node:path";

import {
  DeliveryIdSchema,
  RenderLaunchReceiptSchema,
} from "../../../src/contracts";
import {
  assertDeliveryDirectoryChain,
  assertDeliveryEntries,
  deliveryPathExists,
  inspectDeliveryFile,
  resolveDeliveryPaths,
} from "../adapters/filesystem";
import { buildDeliveryPackageModel } from "../domain/model";
import { serializeDeliveryJson } from "../domain/package";
import { loadCurrentDeliveryInputs } from "./inputs";
import type { DeliveryApplicationDependencies } from "./types";

const PRELAUNCH_FILES = [
  "HANDOFF.md",
  "cover-3x4.png",
  "cover-4x3.png",
  "delivery-launch-manifest.json",
  "immutable-checksums.sha256",
  "publishing.json",
  "render-launch-intent.json",
] as const;

const decodeJson = (bytes: Uint8Array, label: string) => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`${label} is malformed JSON.`, { cause: error });
  }
};

const assertExactBytes = (actual: Uint8Array, expected: string, label: string) => {
  const wanted = new TextEncoder().encode(expected);
  if (
    actual.byteLength !== wanted.byteLength ||
    actual.some((value, index) => value !== wanted[index])
  ) {
    throw new Error(`${label} drifted.`);
  }
};

export const checkDeliveryDirectory = async ({
  deliveryDir,
  deliveryId: rawDeliveryId,
  inputs,
  requireReceipt,
}: {
  readonly deliveryDir: string;
  readonly deliveryId: string;
  readonly inputs: Awaited<ReturnType<typeof loadCurrentDeliveryInputs>>;
  readonly requireReceipt: boolean;
}) => {
  const deliveryId = DeliveryIdSchema.parse(rawDeliveryId);
  const model = buildDeliveryPackageModel(inputs);
  if (model.deliveryId !== deliveryId) {
    throw new Error("Delivery identity is stale against current inputs.");
  }
  const receiptPath = join(deliveryDir, "render-launch-receipt.json");
  const hasReceipt = await deliveryPathExists(receiptPath);
  if (requireReceipt && !hasReceipt) {
    throw new Error(
      "Automatic delivery launch is ambiguous: intent exists without a receipt.",
    );
  }
  await assertDeliveryEntries({
    deliveryDir,
    expected: hasReceipt
      ? [...PRELAUNCH_FILES, "render-launch-receipt.json"]
      : PRELAUNCH_FILES,
    ignoredOutputFileName: `${inputs.story.storyId}.mp4`,
  });
  const [cover4x3, cover3x4, publishing, manifest, handoff, intent, ledger] =
    await Promise.all(
      [
        "cover-4x3.png",
        "cover-3x4.png",
        "publishing.json",
        "delivery-launch-manifest.json",
        "HANDOFF.md",
        "render-launch-intent.json",
        "immutable-checksums.sha256",
      ].map((fileName) => inspectDeliveryFile(join(deliveryDir, fileName))),
    );
  const [expected4x3, expected3x4] = inputs.cover.result.covers;
  if (
    cover4x3.checksum !== expected4x3.checksum ||
    cover4x3.sizeBytes !== expected4x3.sizeBytes ||
    cover3x4.checksum !== expected3x4.checksum ||
    cover3x4.sizeBytes !== expected3x4.sizeBytes
  ) {
    throw new Error("Delivery Cover copies drifted from the immutable result.");
  }
  assertExactBytes(publishing.bytes, model.bytes.publishing, "publishing.json");
  assertExactBytes(
    manifest.bytes,
    model.bytes.manifest,
    "delivery-launch-manifest.json",
  );
  assertExactBytes(handoff.bytes, model.bytes.handoff, "HANDOFF.md");
  assertExactBytes(intent.bytes, model.bytes.intent, "render-launch-intent.json");
  assertExactBytes(
    ledger.bytes,
    model.bytes.ledger,
    "immutable-checksums.sha256",
  );
  if (
    serializeDeliveryJson(model.manifest) !==
      serializeDeliveryJson(decodeJson(manifest.bytes, "Delivery manifest")) ||
    serializeDeliveryJson(model.intent) !==
      serializeDeliveryJson(decodeJson(intent.bytes, "Render launch intent"))
  ) {
    throw new Error("Delivery launch contracts are not canonical.");
  }
  if (hasReceipt) {
    const receiptFile = await inspectDeliveryFile(receiptPath);
    const receipt = RenderLaunchReceiptSchema.parse(
      decodeJson(receiptFile.bytes, "Render launch receipt"),
    );
    if (
      receipt.deliveryId !== deliveryId ||
      receipt.storyId !== inputs.story.storyId ||
      receipt.intentFingerprint !== model.intent.intentFingerprint ||
      receipt.commandFingerprint !== model.intent.commandFingerprint ||
      receipt.outputPath !== model.intent.outputPath
    ) {
      throw new Error("Render launch receipt is stale against its intent.");
    }
  }
  return {
    projectId: inputs.story.storyId,
    deliveryId,
    status: hasReceipt ? ("delivery-render-started" as const) : ("launch-intent-recorded" as const),
  };
};

export const checkDelivery = async ({
  rootDir,
  projectId,
  dependencies = {},
  loadInputs = loadCurrentDeliveryInputs,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly dependencies?: DeliveryApplicationDependencies;
  readonly loadInputs?: typeof loadCurrentDeliveryInputs;
}) => {
  const inputs = await loadInputs({
    rootDir,
    projectId,
    dependencies,
  });
  const model = buildDeliveryPackageModel(inputs);
  const paths = resolveDeliveryPaths({ rootDir, projectId });
  await assertDeliveryDirectoryChain([
    paths.deliveries,
    paths.delivery,
  ]);
  return checkDeliveryDirectory({
    deliveryDir: paths.delivery,
    deliveryId: model.deliveryId,
    inputs,
    requireReceipt: true,
  });
};
