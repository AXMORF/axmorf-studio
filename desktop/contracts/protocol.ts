import { z } from "zod";

import {
  DeliveryPolicySchema,
  PexelsAcquisitionReceiptV1Schema,
  ProjectCreateInputSchema,
  ProjectRevisionCandidateIdSchema,
  ProjectRevisionInputSchema,
  ProductionRevisionIdSchema,
  StoryIdSchema,
  TaskRevisionSchema,
} from "../../src/contracts";
import { AgentExecutionOverrideSchema } from "../../settings/contracts/execution-preferences";
import { DesktopDarwinArchitectureSchema } from "../configuration/darwin-target";
import {
  DesktopProjectStatusSchema,
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
} from "./preview";
import { DesktopProductionProgressSchema } from "./production-progress";
import { RspFieldIssueSchema } from "./issues";

export const RSP_PROTOCOL_VERSION = "rsp-local-v2" as const;
export const RSP_SESSION_SCHEMA_VERSION = 2 as const;
export const RSP_MAX_ASSET_BYTES = 64 * 1024 * 1024;
export const RSP_MAX_ASSET_BASE64_CHARACTERS =
  Math.ceil(RSP_MAX_ASSET_BYTES / 3) * 4;
export const RSP_MAX_REQUEST_BYTES =
  RSP_MAX_ASSET_BASE64_CHARACTERS + 256 * 1024;

export const RSP_CLI_FAILURES = Object.freeze({
  appUnavailable: { code: "rsp-app-unavailable", exitCode: 1 },
  protocolIncompatible: { code: "rsp-protocol-incompatible", exitCode: 2 },
  workspaceInvalid: { code: "rsp-workspace-invalid", exitCode: 3 },
  unauthorized: { code: "rsp-unauthorized", exitCode: 4 },
  requestInvalid: { code: "rsp-request-invalid", exitCode: 5 },
  commandFailed: { code: "rsp-command-failed", exitCode: 6 },
  conflict: { code: "rsp-conflict", exitCode: 7 },
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
const AttemptIdSchema = z.string().uuid();
const CandidateBase64Schema = z
  .string()
  .min(4)
  .max(RSP_MAX_ASSET_BASE64_CHARACTERS)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);

const RspAssetImportInputObjectSchema = z.strictObject({
  role: z.enum(["scene-visual", "global-visual"]),
  receipt: PexelsAcquisitionReceiptV1Schema,
  candidateBase64: CandidateBase64Schema,
});

const validateAssetImportBytes = (
  request: z.infer<typeof RspAssetImportInputObjectSchema>,
  context: z.RefinementCtx,
) => {
  const candidateBytes = Buffer.from(request.candidateBase64, "base64");
  if (
    request.receipt.file.sizeInBytes > RSP_MAX_ASSET_BYTES ||
    candidateBytes.byteLength !== request.receipt.file.sizeInBytes ||
    candidateBytes.toString("base64") !== request.candidateBase64
  ) {
    context.addIssue({
      code: "custom",
      message: "Candidate bytes do not match the bounded receipt size.",
      path: ["candidateBase64"],
    });
  }
};

export const RspAssetImportInputSchema =
  RspAssetImportInputObjectSchema.superRefine(validateAssetImportBytes);

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

export const ActiveWorkSummarySchema = z
  .strictObject({
    storyId: StoryIdSchema,
    candidateId: ProjectRevisionCandidateIdSchema.nullable().optional(),
    kind: z.enum(["production", "delivery", "workspace-migration"]),
    attemptId: AttemptIdSchema.nullable(),
    phase: z.string().min(1).max(80),
  })
  .readonly();

export const DesktopNetworkPolicySchema = z
  .strictObject({
    controlPlane: z.literal("authenticated-unix-domain-socket-only"),
    persistentTcpListeners: z.literal(false),
    deliveryBuildListener: z
      .strictObject({
        transport: z.literal("http"),
        host: z.literal("127.0.0.1"),
        portAllocation: z.literal("os-ephemeral"),
        scope: z.literal("delivery-build"),
      })
      .readonly(),
  })
  .readonly();

export const DESKTOP_NETWORK_POLICY = DesktopNetworkPolicySchema.parse({
  controlPlane: "authenticated-unix-domain-socket-only",
  persistentTcpListeners: false,
  deliveryBuildListener: {
    transport: "http",
    host: "127.0.0.1",
    portAllocation: "os-ephemeral",
    scope: "delivery-build",
  },
});

export const DoctorResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    workspaceId: z.string().uuid(),
    adapterMode: z.literal("workspace"),
    runtimePackMode: z.literal("embedded"),
    previewCatalog: PreviewCatalogReadinessSchema,
    network: DesktopNetworkPolicySchema,
    productionAvailable: z.literal(true),
    deliveryAvailable: z.boolean(),
    deliveryBlocker: z
      .strictObject({
        code: z.string().min(1).max(96),
        message: z.string().min(1).max(500),
      })
      .readonly()
      .nullable(),
    distributionReady: z.literal(false),
    runtimePackAvailable: z.literal(true),
    runtimePack: z.strictObject({
      runtimePackId: z.string().regex(/^runtime-pack-[a-f0-9]{64}$/u),
      architecture: DesktopDarwinArchitectureSchema,
    }),
    provider: z.enum(["ready", "not-configured", "unavailable"]),
    activeWork: ActiveWorkSummarySchema.nullable(),
    process: z.strictObject({
      appPid: z.number().int().positive(),
      enginePid: z.number().int().positive(),
    }),
    session: z.strictObject({
      active: z.literal(true),
      expiresAt: z.string().datetime({ offset: true }),
    }),
  })
  .superRefine((doctor, context) => {
    if (doctor.deliveryAvailable !== (doctor.deliveryBlocker === null)) {
      context.addIssue({
        code: "custom",
        message: "Delivery capability and blocker are inconsistent.",
        path: ["deliveryAvailable"],
      });
    }
  });

export type DoctorResponse = z.infer<typeof DoctorResponseSchema>;

const RspRequestBaseShape = {
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
  workspaceId: z.string().uuid(),
} as const;

const AssetImportRequestSchema = z.strictObject({
  ...RspRequestBaseShape,
  command: z.literal("asset-import"),
  storyId: StoryIdSchema,
  ...RspAssetImportInputObjectSchema.shape,
});

export const RspCommandRequestSchema = z
  .discriminatedUnion("command", [
    z.strictObject({ ...RspRequestBaseShape, command: z.literal("doctor") }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-create-context"),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-validate"),
      input: z.unknown(),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-revise-context"),
      storyId: StoryIdSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-revise-validate"),
      input: z.unknown(),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-revise"),
      input: ProjectRevisionInputSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("context"),
      storyId: StoryIdSchema,
      candidateId: ProjectRevisionCandidateIdSchema.optional(),
      deliveryPolicy: DeliveryPolicySchema.optional(),
      execution: AgentExecutionOverrideSchema.optional(),
      runtimeMaxConcurrency: z.number().int().nonnegative().safe().optional(),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-create"),
      input: ProjectCreateInputSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-list"),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("project-delete"),
      storyId: StoryIdSchema,
      confirmDelete: z.literal(true),
    }),
    AssetImportRequestSchema,
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("inspect"),
      storyId: StoryIdSchema,
      candidateId: ProjectRevisionCandidateIdSchema.optional(),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("prepare"),
      storyId: StoryIdSchema,
      candidateId: ProjectRevisionCandidateIdSchema.optional(),
      deliveryPolicy: DeliveryPolicySchema.optional(),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("task-check"),
      taskRevision: TaskRevisionSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("task-describe"),
      taskRevision: TaskRevisionSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("task-finalize"),
      taskRevision: TaskRevisionSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("task-commit"),
      taskRevision: TaskRevisionSchema,
      attemptId: AttemptIdSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("task-fail"),
      taskRevision: TaskRevisionSchema,
      attemptId: AttemptIdSchema,
      kind: z.enum(["task", "host"]),
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("continue"),
      storyId: StoryIdSchema,
      revisionId: ProductionRevisionIdSchema,
      attemptId: AttemptIdSchema,
      candidateId: ProjectRevisionCandidateIdSchema.optional(),
      deliveryPolicy: DeliveryPolicySchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("attempt-status"),
      storyId: StoryIdSchema,
      attemptId: AttemptIdSchema,
    }),
    z.strictObject({
      ...RspRequestBaseShape,
      command: z.literal("delivery-build"),
      storyId: StoryIdSchema,
      candidateId: ProjectRevisionCandidateIdSchema.optional(),
    }),
  ])
  .superRefine((request, context) => {
    if (request.command === "asset-import") {
      validateAssetImportBytes(request, context);
    }
  });

export type RspCommandRequest = z.infer<typeof RspCommandRequestSchema>;

const RSP_READ_ONLY_COMMANDS = new Set<RspCommandRequest["command"]>([
  "doctor",
  "project-create-context",
  "project-validate",
  "project-revise-context",
  "project-revise-validate",
  "project-list",
  "context",
  "inspect",
  "attempt-status",
  "task-describe",
  "task-check",
]);

export const isRspReadOnlyCommand = (command: RspCommandRequest["command"]) =>
  RSP_READ_ONLY_COMMANDS.has(command);

export const RspCommandResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.strictObject({
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    ok: z.literal(false),
    error: z.strictObject({
      code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      message: z.string().min(1).max(500),
      issues: z.array(RspFieldIssueSchema).max(50).readonly().optional(),
    }),
  }),
]);

export type RspCommandResponse = z.infer<typeof RspCommandResponseSchema>;

const EngineRequestBaseSchema = z.strictObject({
  protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
});

export const MainToEngineMessageSchema = z.discriminatedUnion("type", [
  EngineRequestBaseSchema.extend({
    type: z.literal("initialize"),
    workspaceRoot: AbsolutePathSchema,
    appResourcesRoot: AbsolutePathSchema,
    applicationSupportRoot: AbsolutePathSchema,
    cacheRoot: AbsolutePathSchema,
    appPid: z.number().int().positive(),
    sessionExpiresAt: z.string().datetime({ offset: true }),
  }),
  EngineRequestBaseSchema.extend({
    type: z.literal("refresh-preview-catalog"),
  }),
  EngineRequestBaseSchema.extend({
    type: z.literal("build-delivery"),
    storyId: StoryIdSchema,
  }),
  EngineRequestBaseSchema.extend({
    type: z.literal("delete-project"),
    storyId: StoryIdSchema,
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
    type: z.literal("workspace-projects"),
    projects: z.array(DesktopProjectStatusSchema).readonly(),
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("production-progress"),
    progress: z.array(DesktopProductionProgressSchema).readonly(),
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("doctor-state"),
    doctor: DoctorResponseSchema,
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("active-work-state"),
    activeWork: ActiveWorkSummarySchema.nullable(),
  }),
  EngineResponseBaseSchema.extend({
    type: z.literal("fatal"),
    code: z.enum([
      "engine-protocol-invalid",
      "engine-initialization-failed",
      "runtime-pack-invalid",
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
