import { join } from "node:path";

import {
  DeliveryLaunchManifestSchema,
  RenderLaunchIntentSchema,
  RenderLaunchReceiptSchema,
  buildRenderLaunchReceipt,
} from "../../../src/contracts";
import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import {
  assertDeliveryDirectoryChain,
  assertDeliveryOutputAbsent,
  cleanupDeliveryStaging,
  copyDeliveryFileExclusive,
  createDeliveryStaging,
  deliveryExists,
  deliveryPathExists,
  inspectDeliveryFile,
  promoteDeliveryStaging,
  resolveDeliveryPaths,
  writeDeliveryFileExclusive,
  writeDeliveryFileAtomicExclusive,
} from "../adapters/filesystem";
import { launchDetachedRemotionRender } from "../adapters/render-launch";
import { buildDeliveryPackageModel } from "../domain/model";
import { serializeDeliveryJson } from "../domain/package";
import { checkDeliveryDirectory } from "./check";
import { loadCurrentDeliveryInputs } from "./inputs";
import type { DeliveryApplicationDependencies } from "./types";

const decodeDeliveryJson = (bytes: Uint8Array, label: string) => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`${label} is malformed JSON.`, { cause: error });
  }
};

const buildDeliveryUnlocked = async ({
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
  const paths = resolveDeliveryPaths({
    rootDir,
    projectId,
  });
  await assertDeliveryDirectoryChain([paths.deliveries, paths.delivery]);
  if (await deliveryExists(paths.delivery)) {
    const intentExists = await deliveryPathExists(
      join(paths.delivery, "render-launch-intent.json"),
    );
    const receiptExists = await deliveryPathExists(
      join(paths.delivery, "render-launch-receipt.json"),
    );
    if (intentExists && !receiptExists) {
      throw new Error(
        "Automatic delivery launch is ambiguous: intent exists without a receipt; refusing to retry.",
      );
    }
    if (intentExists !== receiptExists) {
      throw new Error("Existing automatic delivery package is incomplete.");
    }
    if (intentExists && receiptExists) {
      const [manifestFile, intentFile, receiptFile] = await Promise.all([
        inspectDeliveryFile(
          join(paths.delivery, "delivery-launch-manifest.json"),
        ),
        inspectDeliveryFile(join(paths.delivery, "render-launch-intent.json")),
        inspectDeliveryFile(join(paths.delivery, "render-launch-receipt.json")),
      ]);
      const existingManifest = DeliveryLaunchManifestSchema.parse(
        decodeDeliveryJson(manifestFile.bytes, "Delivery manifest"),
      );
      const existingIntent = RenderLaunchIntentSchema.parse(
        decodeDeliveryJson(intentFile.bytes, "Render launch intent"),
      );
      const existingReceipt = RenderLaunchReceiptSchema.parse(
        decodeDeliveryJson(receiptFile.bytes, "Render launch receipt"),
      );
      if (
        existingManifest.deliveryId !== existingIntent.deliveryId ||
        existingReceipt.deliveryId !== existingIntent.deliveryId ||
        existingReceipt.intentFingerprint !==
          existingIntent.intentFingerprint ||
        existingReceipt.commandFingerprint !==
          existingIntent.commandFingerprint ||
        existingReceipt.outputPath !== existingIntent.outputPath
      ) {
        throw new Error(
          "Existing automatic delivery launch records are cross-bound.",
        );
      }
      if (existingManifest.deliveryId === model.deliveryId) {
        const checked = await checkDeliveryDirectory({
          deliveryDir: paths.delivery,
          deliveryId: model.deliveryId,
          inputs,
          requireReceipt: true,
        });
        return { ...checked, noOp: true as const };
      }
    }
  }

  const staging = await createDeliveryStaging({
    rootDir,
    projectId,
    deliveryId: model.deliveryId,
  });
  let promoted = false;
  try {
    const [cover4x3, cover3x4] = inputs.cover.result.covers;
    await Promise.all([
      copyDeliveryFileExclusive({
        source: join(rootDir, cover4x3.repositoryPath),
        destination: join(staging.root, "cover-4x3.png"),
      }),
      copyDeliveryFileExclusive({
        source: join(rootDir, cover3x4.repositoryPath),
        destination: join(staging.root, "cover-3x4.png"),
      }),
    ]);
    await Promise.all([
      writeDeliveryFileExclusive({
        destination: join(staging.root, "asset-attributions.json"),
        bytes: model.bytes.assetAttributions,
      }),
      writeDeliveryFileExclusive({
        destination: join(staging.root, "publishing.json"),
        bytes: model.bytes.publishing,
      }),
      writeDeliveryFileExclusive({
        destination: join(staging.root, "delivery-launch-manifest.json"),
        bytes: model.bytes.manifest,
      }),
      writeDeliveryFileExclusive({
        destination: join(staging.root, "HANDOFF.md"),
        bytes: model.bytes.handoff,
      }),
      writeDeliveryFileExclusive({
        destination: join(staging.root, "render-launch-intent.json"),
        bytes: model.bytes.intent,
      }),
      writeDeliveryFileExclusive({
        destination: join(staging.root, "immutable-checksums.sha256"),
        bytes: model.bytes.ledger,
      }),
    ]);
    await checkDeliveryDirectory({
      deliveryDir: staging.root,
      deliveryId: model.deliveryId,
      inputs,
      requireReceipt: false,
    });
    await promoteDeliveryStaging({
      staging: staging.root,
      destination: paths.delivery,
    });
    promoted = true;

    const launchInputs = await loadInputs({
      rootDir,
      projectId,
      dependencies,
    });
    const launchModel = buildDeliveryPackageModel(launchInputs);
    if (launchModel.deliveryId !== model.deliveryId) {
      throw new Error(
        "Automatic delivery inputs drifted before render launch.",
      );
    }
    await checkDeliveryDirectory({
      deliveryDir: paths.delivery,
      deliveryId: model.deliveryId,
      inputs: launchInputs,
      requireReceipt: false,
    });

    const outputPath = join(rootDir, model.intent.outputPath);
    const logPath = join(rootDir, model.intent.logPath);
    await assertDeliveryOutputAbsent(outputPath);
    await assertDeliveryDirectoryChain([
      join(rootDir, "out"),
      join(rootDir, "out", projectId),
      join(rootDir, "out", projectId, "delivery-render"),
    ]);
    const launch = dependencies.launchRender ?? launchDetachedRemotionRender;
    await launch({
      rootDir,
      command: join(rootDir, model.intent.command),
      args: model.intent.args,
      logPath,
    });
    const now = (dependencies.clock ?? (() => new Date()))();
    if (Number.isNaN(now.getTime())) {
      throw new Error("Delivery launch receipt clock is invalid.");
    }
    const receipt = buildRenderLaunchReceipt({
      intent: model.intent,
      startedAt: now.toISOString(),
    });
    await writeDeliveryFileAtomicExclusive({
      destination: join(paths.delivery, "render-launch-receipt.json"),
      bytes: serializeDeliveryJson(receipt),
    });
    return {
      projectId,
      deliveryId: model.deliveryId,
      status: "delivery-render-started" as const,
      noOp: false as const,
    };
  } finally {
    if (!promoted) await cleanupDeliveryStaging(staging.root);
  }
};

export const buildDelivery = async (
  input: Parameters<typeof buildDeliveryUnlocked>[0],
) => {
  const lock = await acquireRepositoryOperationLock({
    rootDir: input.rootDir,
    ownerId: "delivery-build",
  });
  try {
    return await buildDeliveryUnlocked(input);
  } finally {
    await lock.release();
  }
};
