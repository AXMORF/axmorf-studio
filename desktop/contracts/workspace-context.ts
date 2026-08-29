import { z } from "zod";

import {
  DeliveryPolicySchema,
  ProjectAssetManifestSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  StoryIdSchema,
  StorySpecSchema,
  TaskWorkerTransportSchema,
  VisualStyleSpecSchema,
} from "../../src/contracts";

export const WORKSPACE_CONTEXT_CONTRACT_VERSION =
  "rsp-workspace-context-v1" as const;
export const WORKSPACE_PROJECT_SETTINGS_CONTRACT_VERSION =
  "desktop-project-control-settings-v1" as const;

export const WorkspaceProjectControlSettingsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(WORKSPACE_PROJECT_SETTINGS_CONTRACT_VERSION),
    storyId: StoryIdSchema,
    deliveryPolicy: DeliveryPolicySchema,
  })
  .readonly();

export type WorkspaceProjectControlSettings = z.infer<
  typeof WorkspaceProjectControlSettingsSchema
>;

const ExecutionSourceSchema = z.enum([
  "user-prompt",
  "settings",
  "builtin-default",
]);

export const WorkspaceExecutionResolutionSchema = z
  .strictObject({
    status: z.enum(["ready", "blocked"]),
    mode: z.enum(["inline", "subagents"]),
    requestedMaxConcurrency: z.number().int().positive().nullable(),
    effectiveMaxConcurrency: z.number().int().nonnegative(),
    requireExactConcurrency: z.boolean(),
    workerTransport: TaskWorkerTransportSchema.nullable(),
    source: z.strictObject({
      mode: ExecutionSourceSchema,
      maxConcurrency: ExecutionSourceSchema.nullable(),
    }),
    limitedBy: z
      .array(
        z.enum([
          "runtime-unknown-default",
          "runtime-capacity",
          "repository-safety-ceiling",
          "worker-transport-unverified",
        ]),
      )
      .readonly(),
    persistence: z.literal("current-production-only"),
  })
  .readonly();

export const WorkspaceContextProjectionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(WORKSPACE_CONTEXT_CONTRACT_VERSION),
    storyId: StoryIdSchema,
    story: StorySpecSchema,
    render: RenderSpecSchema,
    visualStyle: VisualStyleSpecSchema,
    assets: ProjectAssetManifestSchema,
    catalog: ResourceCatalogSchema,
    controlPlane: z
      .strictObject({
        provider: z
          .strictObject({
            readiness: z.enum(["ready", "not-configured", "unavailable"]),
            configState: z.enum(["configured", "not-configured"]),
            defaultProviderKind: z.string().min(1).max(80).nullable(),
            defaultVoiceProfileId: z.string().min(1).max(120).nullable(),
          })
          .readonly(),
        deliveryPolicy: z
          .strictObject({
            value: DeliveryPolicySchema,
            source: z.enum([
              "command-override",
              "project-setting",
              "app-default",
            ]),
          })
          .readonly(),
        execution: WorkspaceExecutionResolutionSchema,
      })
      .readonly(),
  })
  .readonly();

export type WorkspaceContextProjection = z.infer<
  typeof WorkspaceContextProjectionSchema
>;
