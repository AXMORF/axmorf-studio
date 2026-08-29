import { z } from "zod";

import {
  TaskWorkerBindingSchema,
  TaskWorkerFileWriteInputSchema,
} from "../../src/contracts";
import {
  RSP_PROTOCOL_VERSION,
  RspAssetImportInputSchema,
} from "./protocol";
import { buildRspProjectRevisionSchemaResponse } from "./project-revision-surface";

const CommandMutabilitySchema = z.enum([
  "read-only",
  "write",
  "delete",
  "provider-write",
  "task-write",
]);
const CommandSessionSchema = z.enum(["required", "not-required"]);
const CommandStdinSchema = z.enum([
  "none",
  "raw-project-create-input",
  "raw-project-revision-input",
  "raw-asset-import-input",
  "task-worker-file-write-input",
]);

const RspCommandDiscoverySchema = z
  .strictObject({
    command: z.string().min(1).max(80),
    usage: z.string().min(1).max(500),
    mutability: CommandMutabilitySchema,
    session: CommandSessionSchema,
    stdin: CommandStdinSchema,
  })
  .readonly();

export const RspAssetImportSchemaResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-asset-import-schema-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    command: z.literal("asset import"),
    stdin: z.literal("raw-asset-import-input"),
    projectBinding: z.literal("--project"),
    candidateEncoding: z.literal("canonical-base64"),
    jsonSchema: z.record(z.string(), z.unknown()),
  })
  .readonly();

export const RspCommandCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-command-catalog-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    commands: z.array(RspCommandDiscoverySchema).min(1).readonly(),
  })
  .readonly();

export const RspTaskWorkerSchemaResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-task-worker-schema-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    command: z.literal("schema task-worker"),
    transports: z
      .tuple([z.literal("shared-workspace"), z.literal("controller-io")])
      .readonly(),
    preflight: z.strictObject({
      bindBeforeWrites: z.literal(true),
      immutableInputFailure: z.literal("abort-zero-write"),
      genericDelegateIsRuntimeNative: z.literal(false),
    }),
    validationOwnership: z.strictObject({
      repairable: z.literal("agent-output"),
      infrastructure: z.literal("worker-host"),
      immutableAuthority: z.literal("fixed-controller"),
    }),
    bindingJsonSchema: z.record(z.string(), z.unknown()),
    fileWriteInputJsonSchema: z.record(z.string(), z.unknown()),
  })
  .readonly();

const command = ({
  command,
  usage,
  mutability,
  session = "required",
  stdin = "none",
}: z.input<typeof RspCommandDiscoverySchema>) =>
  RspCommandDiscoverySchema.parse({
    command,
    usage,
    mutability,
    session,
    stdin,
  });
export const buildRspAssetImportSchemaResponse = () =>
  RspAssetImportSchemaResponseSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-asset-import-schema-v1",
    protocolVersion: RSP_PROTOCOL_VERSION,
    command: "asset import",
    stdin: "raw-asset-import-input",
    projectBinding: "--project",
    candidateEncoding: "canonical-base64",
    jsonSchema: z.toJSONSchema(RspAssetImportInputSchema),
  });

export const buildRspTaskWorkerSchemaResponse = () =>
  RspTaskWorkerSchemaResponseSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-task-worker-schema-v1",
    protocolVersion: RSP_PROTOCOL_VERSION,
    command: "schema task-worker",
    transports: ["shared-workspace", "controller-io"],
    preflight: {
      bindBeforeWrites: true,
      immutableInputFailure: "abort-zero-write",
      genericDelegateIsRuntimeNative: false,
    },
    validationOwnership: {
      repairable: "agent-output",
      infrastructure: "worker-host",
      immutableAuthority: "fixed-controller",
    },
    bindingJsonSchema: z.toJSONSchema(TaskWorkerBindingSchema),
    fileWriteInputJsonSchema: z.toJSONSchema(TaskWorkerFileWriteInputSchema),
  });

export { buildRspProjectRevisionSchemaResponse };

export const buildRspCommandCatalog = () =>
  RspCommandCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-command-catalog-v1",
    protocolVersion: RSP_PROTOCOL_VERSION,
    commands: [
      command({
        command: "help --json",
        usage: "./.rsp/bin/rsp help --json",
        mutability: "read-only",
        session: "not-required",
        stdin: "none",
      }),
      command({
        command: "doctor",
        usage: "./.rsp/bin/rsp doctor",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "schema project-create",
        usage: "./.rsp/bin/rsp schema project-create",
        mutability: "read-only",
        session: "not-required",
        stdin: "none",
      }),
      command({
        command: "schema project-revision",
        usage: "./.rsp/bin/rsp schema project-revision",
        mutability: "read-only",
        session: "not-required",
        stdin: "none",
      }),
      command({
        command: "schema asset-import",
        usage: "./.rsp/bin/rsp schema asset-import",
        mutability: "read-only",
        session: "not-required",
        stdin: "none",
      }),
      command({
        command: "schema task-worker",
        usage: "./.rsp/bin/rsp schema task-worker",
        mutability: "read-only",
        session: "not-required",
        stdin: "none",
      }),
      command({
        command: "project create-context",
        usage: "./.rsp/bin/rsp project create-context",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "project validate",
        usage: "./.rsp/bin/rsp project validate",
        mutability: "read-only",
        session: "required",
        stdin: "raw-project-create-input",
      }),
      command({
        command: "project create",
        usage: "./.rsp/bin/rsp project create",
        mutability: "write",
        session: "required",
        stdin: "raw-project-create-input",
      }),
      command({
        command: "project revise-context",
        usage:
          "./.rsp/bin/rsp project revise-context --project <storyId>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "project revise-validate",
        usage: "./.rsp/bin/rsp project revise-validate",
        mutability: "read-only",
        session: "required",
        stdin: "raw-project-revision-input",
      }),
      command({
        command: "project revise",
        usage: "./.rsp/bin/rsp project revise",
        mutability: "write",
        session: "required",
        stdin: "raw-project-revision-input",
      }),
      command({
        command: "project list",
        usage: "./.rsp/bin/rsp project list",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "project delete",
        usage:
          "./.rsp/bin/rsp project delete --project <storyId> --confirm-delete",
        mutability: "delete",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "asset import",
        usage: "./.rsp/bin/rsp asset import --project <storyId>",
        mutability: "write",
        session: "required",
        stdin: "raw-asset-import-input",
      }),
      command({
        command: "context",
        usage:
          "./.rsp/bin/rsp context --project <storyId> [--candidate <candidateId>] [--delivery-policy <manual|automatic>] [--execution-mode <inline|subagents>] [--max-concurrency <n>] [--require-exact-concurrency <true|false>] [--runtime-max-concurrency <n>] [--worker-transport <shared-workspace|controller-io>]",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "inspect",
        usage:
          "./.rsp/bin/rsp inspect --project <storyId> [--candidate <candidateId>]",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "prepare",
        usage:
          "./.rsp/bin/rsp prepare --project <storyId> [--candidate <candidateId>] [--delivery-policy <manual|automatic>]",
        mutability: "provider-write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task bind",
        usage:
          "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task describe",
        usage:
          "./.rsp/bin/rsp task describe --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task finalize",
        usage:
          "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        mutability: "task-write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task check",
        usage:
          "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task commit",
        usage:
          "./.rsp/bin/rsp task commit --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        mutability: "write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task fail",
        usage:
          "./.rsp/bin/rsp task fail --task <taskRevision> --attempt <attemptId> --binding <bindingId> --kind <task|host|fixed>",
        mutability: "write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task file-read",
        usage:
          "./.rsp/bin/rsp task file-read --task <taskRevision> --attempt <attemptId> --binding <bindingId> --path <logicalPath>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "task file-write",
        usage:
          "./.rsp/bin/rsp task file-write --task <taskRevision> --attempt <attemptId> --binding <bindingId> --path <logicalPath>",
        mutability: "task-write",
        session: "required",
        stdin: "task-worker-file-write-input",
      }),
      command({
        command: "attempt status",
        usage:
          "./.rsp/bin/rsp attempt status --project <storyId> --attempt <attemptId>",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "attempt recover-inspect",
        usage:
          "./.rsp/bin/rsp attempt recover-inspect --project <storyId> --attempt <failedAttemptId> [--candidate <candidateId>]",
        mutability: "read-only",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "attempt reissue",
        usage:
          "./.rsp/bin/rsp attempt reissue --project <storyId> --attempt <failedAttemptId> [--candidate <candidateId>] [--delivery-policy <manual|automatic>]",
        mutability: "write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "continue",
        usage:
          "./.rsp/bin/rsp continue --project <storyId> --revision <revisionId> --attempt <attemptId> [--candidate <candidateId>] [--delivery-policy <manual|automatic>]",
        mutability: "write",
        session: "required",
        stdin: "none",
      }),
      command({
        command: "delivery build",
        usage:
          "./.rsp/bin/rsp delivery build --project <storyId> [--candidate <candidateId>]",
        mutability: "write",
        session: "required",
        stdin: "none",
      }),
    ],
  });
