import { z } from "zod";

import { PreviewCatalogReadinessSchema, PreviewCatalogSchema } from "./preview";

export const RSP_PROTOCOL_VERSION = "rsp-local-v1" as const;
export const RSP_SESSION_SCHEMA_VERSION = 1 as const;

export const RSP_CLI_FAILURES = Object.freeze({
  appUnavailable: { code: "rsp-app-unavailable", exitCode: 1 },
  protocolIncompatible: { code: "rsp-protocol-incompatible", exitCode: 2 },
  workspaceInvalid: { code: "rsp-workspace-invalid", exitCode: 3 },
  unauthorized: { code: "rsp-unauthorized", exitCode: 4 },
});

const RequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u);
const AbsolutePathSchema = z
  .string()
  .min(1)
  .refine((path) => path.startsWith("/"), {
    message: "Expected an absolute POSIX path.",
  });

export const SessionRecordSchema = z.strictObject({
  schemaVersion: z.literal(RSP_SESSION_SCHEMA_VERSION),
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  workspaceId: z.string().uuid(),
  socketPath: AbsolutePathSchema,
  appPid: z.number().int().positive(),
  enginePid: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export const DoctorResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  workspaceId: z.string().uuid(),
  adapterMode: z.literal("repository"),
  repositoryMode: z.literal("build-time-checkout"),
  runtimePackMode: z.literal("host-node-prototype"),
  previewCatalog: PreviewCatalogReadinessSchema,
  desktopTcpListeners: z.literal(false),
  productionAvailable: z.literal(false),
  deliveryAvailable: z.literal(false),
  distributionReady: z.literal(false),
  runtimePackAvailable: z.literal(false),
  activeWork: z.literal(false),
  process: z.strictObject({
    appPid: z.number().int().positive(),
    enginePid: z.number().int().positive(),
  }),
  session: z.strictObject({
    active: z.literal(true),
    expiresAt: z.string().datetime({ offset: true }),
  }),
});

export type DoctorResponse = z.infer<typeof DoctorResponseSchema>;

const EngineRequestBaseSchema = z.strictObject({
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
});

export const MainToEngineMessageSchema = z.discriminatedUnion("type", [
  EngineRequestBaseSchema.extend({
    type: z.literal("initialize"),
    workspaceRoot: AbsolutePathSchema,
    repositoryRoot: AbsolutePathSchema,
    appPid: z.number().int().positive(),
    sessionExpiresAt: z.string().datetime({ offset: true }),
  }),
  EngineRequestBaseSchema.extend({
    type: z.literal("refresh-preview-catalog"),
  }),
  EngineRequestBaseSchema.extend({ type: z.literal("shutdown") }),
]);

export type MainToEngineMessage = z.infer<typeof MainToEngineMessageSchema>;

const EngineResponseBaseSchema = z.strictObject({
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
});

export const EngineToMainMessageSchema = z.discriminatedUnion("type", [
  EngineResponseBaseSchema.extend({
    type: z.literal("initialized"),
    workspaceId: z.string().uuid(),
    workspaceRoot: AbsolutePathSchema,
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("preview-catalog"),
    catalog: PreviewCatalogSchema,
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("doctor-state"),
    doctor: DoctorResponseSchema,
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("fatal"),
    code: z.enum([
      "engine-protocol-invalid",
      "engine-initialization-failed",
      "preview-catalog-failed",
      "rsp-server-failed",
    ]),
    message: z.string().min(1).max(500),
  }),
  EngineResponseBaseSchema.extend({ type: z.literal("stopped") }),
]);

export type EngineToMainMessage = z.infer<typeof EngineToMainMessageSchema>;

export const parseMainToEngineMessage = (value: unknown) =>
  MainToEngineMessageSchema.parse(value);

export const parseEngineToMainMessage = (value: unknown) =>
  EngineToMainMessageSchema.parse(value);
