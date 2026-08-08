import { join } from "node:path";

import { buildRenderLaunchReceipt } from "../../../src/contracts";
import {
  assertDeliveryDirectoryChain,
  assertDeliveryOutputAbsent,
  cleanupDeliveryStaging,
  copyDeliveryFileExclusive,
  createDeliveryStaging,
  deliveryExists,
  deliveryPathExists,
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

export const buildDelivery = async ({
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
    deliveryId: model.deliveryId,
  });
  await assertDeliveryDirectoryChain([
    paths.deliveries,
    paths.project,
    paths.delivery,
  ]);
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
    if (
      !intentExists &&
      (await deliveryPathExists(join(paths.delivery, `${projectId}.mp4`)))
    ) {
      throw new Error("Delivery render output already exists before launch.");
    }
    if (!intentExists || !receiptExists) {
      throw new Error("Existing automatic delivery package is incomplete.");
    }
    const checked = await checkDeliveryDirectory({
      deliveryDir: paths.delivery,
      deliveryId: model.deliveryId,
      inputs,
      requireReceipt: true,
    });
    return { ...checked, noOp: true as const };
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
      throw new Error("Automatic delivery inputs drifted before render launch.");
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
    await assertDeliveryOutputAbsent(logPath);
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
