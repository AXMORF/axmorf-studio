import { z } from "zod";

import { ProjectRevisionInputSchema } from "../../src/contracts";
import { RSP_PROTOCOL_VERSION } from "./protocol";

export const RspProjectRevisionSchemaResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-project-revision-schema-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    command: z.literal("project revise"),
    stdin: z.literal("raw-project-revision-input"),
    contextCommand: z.literal(
      "./.rsp/bin/rsp project revise-context --project <storyId>",
    ),
    validateCommand: z.literal("./.rsp/bin/rsp project revise-validate"),
    candidatePolicy: z.literal(
      "same-project-candidate-auto-promote-after-verified-delivery",
    ),
    jsonSchema: z.record(z.string(), z.unknown()),
  })
  .readonly();

export const buildRspProjectRevisionSchemaResponse = () =>
  RspProjectRevisionSchemaResponseSchema.parse({
    schemaVersion: 1,
    contractVersion: "rsp-project-revision-schema-v1",
    protocolVersion: RSP_PROTOCOL_VERSION,
    command: "project revise",
    stdin: "raw-project-revision-input",
    contextCommand:
      "./.rsp/bin/rsp project revise-context --project <storyId>",
    validateCommand: "./.rsp/bin/rsp project revise-validate",
    candidatePolicy:
      "same-project-candidate-auto-promote-after-verified-delivery",
    jsonSchema: z.toJSONSchema(ProjectRevisionInputSchema),
  });
