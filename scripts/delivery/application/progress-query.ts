import { join } from "node:path";

import {
  DeliveryLaunchManifestSchema,
  RenderLaunchIntentSchema,
  RenderLaunchReceiptSchema,
} from "../../../src/contracts/delivery-launch";
import { deliveryPathExists, readDeliveryJson } from "../adapters/filesystem";

export type DeliveryProgressProjection = Readonly<{
  status: "pending" | "failed" | "attention" | "launched";
  detail: string;
  occurredAt: string | null;
}>;

export const readDeliveryProgressProjection = async ({
  rootDir,
  storyId,
  renderReadyFingerprint,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly renderReadyFingerprint: string | null;
}): Promise<DeliveryProgressProjection> => {
  if (renderReadyFingerprint === null) {
    return {
      status: "pending",
      detail: "等待生产流程进入 render-ready",
      occurredAt: null,
    };
  }
  const base = `deliveries/${storyId}`;
  const manifestPath = `${base}/delivery-launch-manifest.json`;
  if (!(await deliveryPathExists(join(rootDir, manifestPath)))) {
    return {
      status: "pending",
      detail: "等待当前 Run 的 Cover 与交付包就绪",
      occurredAt: null,
    };
  }
  const manifest = DeliveryLaunchManifestSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: manifestPath }),
  );
  if (
    manifest.storyId !== storyId ||
    manifest.renderReadyFingerprint !== renderReadyFingerprint
  ) {
    return {
      status: "pending",
      detail: "等待与当前 Run 绑定的新交付包",
      occurredAt: null,
    };
  }

  const intentPath = `${base}/render-launch-intent.json`;
  if (!(await deliveryPathExists(join(rootDir, intentPath)))) {
    return {
      status: "failed",
      detail: "当前交付包缺少 render launch intent",
      occurredAt: null,
    };
  }
  const intent = RenderLaunchIntentSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: intentPath }),
  );
  if (
    intent.deliveryId !== manifest.deliveryId ||
    intent.renderReadyFingerprint !== renderReadyFingerprint
  ) {
    throw new Error("Delivery render launch intent is stale.");
  }

  const receiptPath = `${base}/render-launch-receipt.json`;
  if (!(await deliveryPathExists(join(rootDir, receiptPath)))) {
    return {
      status: "attention",
      detail: "已写入启动意图但缺少 spawn 回执（launch-ambiguous）",
      occurredAt: null,
    };
  }
  const receipt = RenderLaunchReceiptSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: receiptPath }),
  );
  if (
    receipt.deliveryId !== intent.deliveryId ||
    receipt.storyId !== storyId ||
    receipt.intentFingerprint !== intent.intentFingerprint ||
    receipt.commandFingerprint !== intent.commandFingerprint ||
    receipt.outputPath !== intent.outputPath
  ) {
    throw new Error("Delivery render launch receipt is stale.");
  }
  return {
    status: "launched",
    detail: "Remotion 已收到 spawn 确认；不代表 MP4 已完成",
    occurredAt: receipt.startedAt,
  };
};
