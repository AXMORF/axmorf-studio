import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const DELIVERY_LAUNCH_MANIFEST_VERSION =
  "delivery-launch-manifest-v4" as const;
export const RENDER_LAUNCH_INTENT_VERSION = "render-launch-intent-v4" as const;
export const RENDER_LAUNCH_RECEIPT_VERSION =
  "render-launch-receipt-v4" as const;
export const RENDER_LAUNCH_POLICY_VERSION =
  "detached-spawn-acknowledgement-v1" as const;
export const DELIVERY_PUBLISHING_VERSION = "delivery-publishing-v2" as const;

export const DeliveryIdSchema = z
  .string()
  .regex(/^delivery-[0-9a-f]{64}$/u)
  .brand<"DeliveryId">();

const SafeRepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.includes("://"),
    "Delivery paths must be repository-relative.",
  );

const RenderArgSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) => !value.includes("\0"),
    "Render arguments cannot contain NUL.",
  );

const DeliveryIdentityInputObject = z
  .object({
    storyId: StoryIdSchema,
    publishingIntentFingerprint: Sha256DigestSchema,
    publishingChecksum: Sha256DigestSchema,
    assetAttributionsFingerprint: Sha256DigestSchema,
    assetAttributionsChecksum: Sha256DigestSchema,
    coverResultFingerprint: Sha256DigestSchema,
    renderReadyFingerprint: Sha256DigestSchema,
    renderPlanFingerprint: Sha256DigestSchema,
    compositionId: CompositionIdSchema,
    renderArgs: z.array(RenderArgSchema).min(4).max(32).readonly(),
    renderLaunchPolicyVersion: z.literal(RENDER_LAUNCH_POLICY_VERSION),
  })
  .strict()
  .superRefine((identity, context) => {
    const expectedOutput = `deliveries/${identity.storyId}/${identity.storyId}.mp4`;
    if (
      identity.renderArgs[0] !== "render" ||
      identity.renderArgs[1] !== "src/index.ts" ||
      identity.renderArgs[2] !== identity.compositionId ||
      identity.renderArgs[3] !== expectedOutput
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Delivery identity must bind the fixed Remotion render argument template.",
        path: ["renderArgs"],
      });
    }
  });

export const DeliveryIdentityInputSchema =
  DeliveryIdentityInputObject.readonly();

const pickDeliveryIdentity = (rawInput: unknown) => {
  const input = rawInput as Record<string, unknown>;
  return DeliveryIdentityInputSchema.parse({
    storyId: input.storyId,
    publishingIntentFingerprint: input.publishingIntentFingerprint,
    publishingChecksum: input.publishingChecksum,
    assetAttributionsFingerprint: input.assetAttributionsFingerprint,
    assetAttributionsChecksum: input.assetAttributionsChecksum,
    coverResultFingerprint: input.coverResultFingerprint,
    renderReadyFingerprint: input.renderReadyFingerprint,
    renderPlanFingerprint: input.renderPlanFingerprint,
    compositionId: input.compositionId,
    renderArgs: input.renderArgs,
    renderLaunchPolicyVersion: input.renderLaunchPolicyVersion,
  });
};

export const computeDeliveryIdentityFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "automatic-delivery-identity",
    version: 1,
    value: pickDeliveryIdentity(rawInput),
  });

export const createDeliveryId = (rawInput: unknown) => {
  const fingerprint = computeDeliveryIdentityFingerprint(rawInput);
  return DeliveryIdSchema.parse(
    `delivery-${fingerprint.slice("sha256:".length)}`,
  );
};

const ImmutableFileSchema = z
  .object({
    fileName: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const DeliveryPublishingChapterSchema = z
  .object({
    meaningId: MeaningIdSchema,
    name: z.string().trim().min(1).max(64),
    startFrame: z.number().int().nonnegative().safe(),
    timecode: z.string().regex(/^\d{2,}:[0-5]\d:[0-5]\d$/u),
  })
  .strict()
  .readonly();

export const formatDeliveryTimecode = (startFrame: number, fps: number) => {
  const totalSeconds = Math.floor(startFrame / fps);
  const hours = Math.floor(totalSeconds / 3_600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const DeliveryPublishingInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(DELIVERY_PUBLISHING_VERSION),
    storyId: StoryIdSchema,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).max(2_000),
    topics: z.array(z.string().trim().min(1).max(48)).min(6).max(7).readonly(),
    collection: z.string().trim().min(1).max(96),
    outputFileName: z.string().regex(/^[a-z0-9][a-z0-9-]*\.mp4$/u),
    coverFileNames: z
      .object({
        cover4x3: z.literal("cover-4x3.png"),
        cover3x4: z.literal("cover-3x4.png"),
      })
      .strict()
      .readonly(),
    fps: PositiveIntegerSchema.max(120),
    frameCount: PositiveIntegerSchema,
    plannedDurationSeconds: z.number().positive().finite(),
    chapters: z
      .array(DeliveryPublishingChapterSchema)
      .min(1)
      .max(256)
      .readonly(),
  })
  .strict()
  .superRefine((publishing, context) => {
    if (
      publishing.plannedDurationSeconds !==
      publishing.frameCount / publishing.fps
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Publishing planned duration must equal frameCount divided by fps.",
        path: ["plannedDurationSeconds"],
      });
    }
    for (const [index, chapter] of publishing.chapters.entries()) {
      if (
        chapter.timecode !==
        formatDeliveryTimecode(chapter.startFrame, publishing.fps)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Publishing chapter timecode must floor its start frame to HH:MM:SS.",
          path: ["chapters", index, "timecode"],
        });
      }
    }
  });

export const DeliveryPublishingSchema =
  DeliveryPublishingInputObject.readonly();

export const buildDeliveryPublishing = (rawInput: unknown) =>
  DeliveryPublishingSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 2,
    contractVersion: DELIVERY_PUBLISHING_VERSION,
  });

const DeliveryLaunchManifestInputObject = DeliveryIdentityInputObject.extend({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(DELIVERY_LAUNCH_MANIFEST_VERSION),
  deliveryId: DeliveryIdSchema,
  plannedDurationSeconds: z.number().positive().finite(),
  fps: PositiveIntegerSchema.max(120),
  frameCount: PositiveIntegerSchema,
  files: z
    .object({
      cover4x3: ImmutableFileSchema,
      cover3x4: ImmutableFileSchema,
      publishing: ImmutableFileSchema,
      assetAttributions: ImmutableFileSchema,
    })
    .strict()
    .readonly(),
}).strict();

export const DeliveryLaunchManifestInputSchema =
  DeliveryLaunchManifestInputObject.superRefine((manifest, context) => {
    if (manifest.deliveryId !== createDeliveryId(manifest)) {
      context.addIssue({
        code: "custom",
        message: "Delivery identity is stale.",
        path: ["deliveryId"],
      });
    }
    if (
      manifest.plannedDurationSeconds !==
      manifest.frameCount / manifest.fps
    ) {
      context.addIssue({
        code: "custom",
        message: "Planned duration must equal frameCount divided by fps.",
        path: ["plannedDurationSeconds"],
      });
    }
  }).readonly();

export const computeDeliveryLaunchManifestFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.manifestFingerprint;
  const input = DeliveryLaunchManifestInputSchema.parse(record);
  return createFingerprint({
    namespace: "delivery-launch-manifest",
    version: 1,
    value: input,
  });
};

export const DeliveryLaunchManifestSchema =
  DeliveryLaunchManifestInputObject.extend({
    manifestFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      const { manifestFingerprint, ...input } = manifest;
      const parsed = DeliveryLaunchManifestInputSchema.safeParse(input);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path,
          });
        }
        return;
      }
      if (
        manifestFingerprint !==
        computeDeliveryLaunchManifestFingerprint(parsed.data)
      ) {
        context.addIssue({
          code: "custom",
          message: "Delivery launch manifest fingerprint is stale.",
          path: ["manifestFingerprint"],
        });
      }
    })
    .readonly();

export const buildDeliveryLaunchManifest = (rawInput: unknown) => {
  const input = DeliveryLaunchManifestInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: DELIVERY_LAUNCH_MANIFEST_VERSION,
  });
  return DeliveryLaunchManifestSchema.parse({
    ...input,
    manifestFingerprint: computeDeliveryLaunchManifestFingerprint(input),
  });
};

const RenderLaunchIntentInputObject = DeliveryIdentityInputObject.extend({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(RENDER_LAUNCH_INTENT_VERSION),
  deliveryId: DeliveryIdSchema,
  outputPath: SafeRepositoryPathSchema,
  logPath: SafeRepositoryPathSchema,
  command: z.literal("node_modules/.bin/remotion"),
  args: z.array(RenderArgSchema).min(4).max(32).readonly(),
  commandFingerprint: Sha256DigestSchema,
  status: z.literal("launch-intent-recorded"),
}).strict();

export const RenderLaunchIntentInputSchema =
  RenderLaunchIntentInputObject.superRefine((intent, context) => {
    const expectedDeliveryId = createDeliveryId(intent);
    const expectedOutput = `deliveries/${intent.storyId}/${intent.storyId}.mp4`;
    const expectedLog = `out/${intent.storyId}/delivery-render/${expectedDeliveryId}.log`;
    if (
      intent.deliveryId !== expectedDeliveryId ||
      intent.outputPath !== expectedOutput ||
      intent.logPath !== expectedLog ||
      JSON.stringify(intent.args) !== JSON.stringify(intent.renderArgs)
    ) {
      context.addIssue({
        code: "custom",
        message: "Render launch intent paths or arguments are stale.",
        path: ["args"],
      });
    }
    const commandFingerprint = createFingerprint({
      namespace: "detached-remotion-command",
      version: 1,
      value: {
        command: intent.command,
        args: intent.args,
        cwd: ".",
        outputPath: intent.outputPath,
        logPath: intent.logPath,
      },
    });
    if (intent.commandFingerprint !== commandFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Render launch command fingerprint is stale.",
        path: ["commandFingerprint"],
      });
    }
  }).readonly();

export const computeRenderLaunchIntentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.intentFingerprint;
  const input = RenderLaunchIntentInputSchema.parse(record);
  return createFingerprint({
    namespace: "render-launch-intent",
    version: 1,
    value: input,
  });
};

export const RenderLaunchIntentSchema = RenderLaunchIntentInputObject.extend({
  intentFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((intent, context) => {
    const { intentFingerprint, ...input } = intent;
    const parsed = RenderLaunchIntentInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (
      intentFingerprint !== computeRenderLaunchIntentFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Render launch intent fingerprint is stale.",
        path: ["intentFingerprint"],
      });
    }
  })
  .readonly();

export const buildRenderLaunchIntent = (rawInput: unknown) => {
  const identity = pickDeliveryIdentity(rawInput);
  const deliveryId = createDeliveryId(identity);
  const outputPath = `deliveries/${identity.storyId}/${identity.storyId}.mp4`;
  const logPath = `out/${identity.storyId}/delivery-render/${deliveryId}.log`;
  const args = identity.renderArgs;
  const command = "node_modules/.bin/remotion" as const;
  const commandFingerprint = createFingerprint({
    namespace: "detached-remotion-command",
    version: 1,
    value: { command, args, cwd: ".", outputPath, logPath },
  });
  const input = RenderLaunchIntentInputSchema.parse({
    ...identity,
    schemaVersion: 1,
    contractVersion: RENDER_LAUNCH_INTENT_VERSION,
    deliveryId,
    outputPath,
    logPath,
    command,
    args,
    commandFingerprint,
    status: "launch-intent-recorded",
  });
  return RenderLaunchIntentSchema.parse({
    ...input,
    intentFingerprint: computeRenderLaunchIntentFingerprint(input),
  });
};

const RenderLaunchReceiptInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(RENDER_LAUNCH_RECEIPT_VERSION),
    deliveryId: DeliveryIdSchema,
    storyId: StoryIdSchema,
    intentFingerprint: Sha256DigestSchema,
    commandFingerprint: Sha256DigestSchema,
    outputPath: SafeRepositoryPathSchema,
    startedAt: z.string().datetime({ offset: true }),
    status: z.literal("render-started"),
  })
  .strict();

export const RenderLaunchReceiptInputSchema =
  RenderLaunchReceiptInputObject.readonly();

export const computeRenderLaunchReceiptFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.receiptFingerprint;
  const input = RenderLaunchReceiptInputSchema.parse(record);
  return createFingerprint({
    namespace: "render-launch-receipt",
    version: 1,
    value: input,
  });
};

export const RenderLaunchReceiptSchema = RenderLaunchReceiptInputObject.extend({
  receiptFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((receipt, context) => {
    const { receiptFingerprint, ...input } = receipt;
    if (receiptFingerprint !== computeRenderLaunchReceiptFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "Render launch receipt fingerprint is stale.",
        path: ["receiptFingerprint"],
      });
    }
  })
  .readonly();

export const buildRenderLaunchReceipt = ({
  intent: rawIntent,
  startedAt,
}: {
  readonly intent: unknown;
  readonly startedAt: string;
}) => {
  const intent = RenderLaunchIntentSchema.parse(rawIntent);
  const input = RenderLaunchReceiptInputSchema.parse({
    schemaVersion: 1,
    contractVersion: RENDER_LAUNCH_RECEIPT_VERSION,
    deliveryId: intent.deliveryId,
    storyId: intent.storyId,
    intentFingerprint: intent.intentFingerprint,
    commandFingerprint: intent.commandFingerprint,
    outputPath: intent.outputPath,
    startedAt,
    status: "render-started",
  });
  return RenderLaunchReceiptSchema.parse({
    ...input,
    receiptFingerprint: computeRenderLaunchReceiptFingerprint(input),
  });
};

export type DeliveryId = z.infer<typeof DeliveryIdSchema>;
export type DeliveryLaunchManifest = z.infer<
  typeof DeliveryLaunchManifestSchema
>;
export type DeliveryPublishing = z.infer<typeof DeliveryPublishingSchema>;
export type RenderLaunchIntent = z.infer<typeof RenderLaunchIntentSchema>;
export type RenderLaunchReceipt = z.infer<typeof RenderLaunchReceiptSchema>;
