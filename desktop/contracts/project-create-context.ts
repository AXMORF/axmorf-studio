import { z } from "zod";

import {
  ProducerConfigIdSchema,
  ResourceAllowedUseSchema,
  ResourceIdSchema,
  SceneTemplateIdSchema,
  StyleProfileIdSchema,
} from "../../src/contracts";
import { RSP_PROTOCOL_VERSION } from "./protocol";
import { RspFieldIssueSchema } from "./issues";

const CatalogChoiceTextSchema = z.string().trim().min(1).max(1000);

export const RspProjectCreateContextSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-project-create-context-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    config: z
      .strictObject({
        state: z.enum(["configured", "not-configured"]),
        blocker: z
          .strictObject({
            code: z.literal("desktop-producer-config-required"),
            message: z.string().min(1).max(500),
            ownerAction: z.string().min(1).max(500),
          })
          .readonly()
          .nullable(),
      })
      .readonly(),
    provider: z
      .strictObject({
        readiness: z.enum(["ready", "not-configured", "unavailable"]),
        requiredForProjectCreate: z.literal(false),
      })
      .readonly(),
    styleProfiles: z
      .array(
        z
          .strictObject({
            id: StyleProfileIdSchema,
            title: CatalogChoiceTextSchema.max(200),
            description: CatalogChoiceTextSchema,
          })
          .readonly(),
      )
      .readonly(),
    publishingCollections: z
      .array(
        z
          .strictObject({
            id: ProducerConfigIdSchema,
            name: CatalogChoiceTextSchema.max(96),
            description: CatalogChoiceTextSchema.max(500),
          })
          .readonly(),
      )
      .readonly(),
    sceneTemplates: z
      .strictObject({
        omission: z.literal("inherit-producer-config-defaults"),
        defaults: z
          .strictObject({
            introSceneTemplateId: SceneTemplateIdSchema.nullable(),
            outroSceneTemplateId: SceneTemplateIdSchema.nullable(),
          })
          .readonly()
          .nullable(),
        options: z
          .array(
            z
              .strictObject({
                id: SceneTemplateIdSchema,
                name: CatalogChoiceTextSchema.max(96),
                description: CatalogChoiceTextSchema.max(500),
              })
              .readonly(),
          )
          .readonly(),
      })
      .readonly(),
    resources: z
      .array(
        z
          .strictObject({
            id: ResourceIdSchema,
            title: CatalogChoiceTextSchema.max(200),
            description: CatalogChoiceTextSchema,
            kind: z.enum(["asset", "capability"]),
            allowedUse: ResourceAllowedUseSchema,
            mediaRole: z
              .enum([
                "scene-visual",
                "sound-effect",
                "narration",
                "background-music",
                "global-visual",
              ])
              .nullable(),
          })
          .readonly(),
      )
      .readonly(),
    renderDefaults: z
      .strictObject({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.number().int().positive(),
        locale: z.string().min(1),
      })
      .readonly()
      .nullable(),
    commands: z
      .strictObject({
        validate: z.literal("./.rsp/bin/rsp project validate"),
        create: z.literal("./.rsp/bin/rsp project create"),
      })
      .readonly(),
  })
  .readonly();

export type RspProjectCreateContext = z.infer<
  typeof RspProjectCreateContextSchema
>;

export const RspProjectCreateValidationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-project-create-validation-v1"),
    status: z.enum(["project-create-valid", "project-create-invalid"]),
    storyId: z.string().nullable(),
    issues: z.array(RspFieldIssueSchema).max(50).readonly(),
  })
  .readonly();

export type RspProjectCreateValidation = z.infer<
  typeof RspProjectCreateValidationSchema
>;
