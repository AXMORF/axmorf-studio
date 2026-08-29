import assert from "node:assert/strict";
import test from "node:test";

import {
  MainToEngineMessageSchema,
  RSP_MAX_ASSET_BASE64_CHARACTERS,
  RSP_MAX_ASSET_BYTES,
  RSP_CLI_FAILURES,
  RSP_PROTOCOL_VERSION,
  RspAssetImportInputSchema,
  RspCommandRequestSchema,
  RspCommandResponseSchema,
  SessionRecordSchema,
} from "../../desktop/contracts/protocol";
import { buildTaskWorkerBindingId } from "../../src/contracts";

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";

const imageReceipt = (sizeBytes = 3) =>
  ({
    provider: "pexels",
    schemaVersion: 1,
    acquisitionId: "pexels:1",
    providerAssetId: "1",
    sourcePageUrl: "https://www.pexels.com/photo/fixture-1/",
    creator: {
      name: "Creator",
      profileUrl: "https://www.pexels.com/@creator",
    },
    license: {
      name: "Pexels License",
      url: "https://www.pexels.com/license/",
    },
    providerPolicy: {
      attributionRequired: true,
      attributionText: "Photo by Creator on Pexels",
    },
    acquiredAt: "2026-08-23T00:00:00.000Z",
    file: {
      relativePath: "original.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      sizeInBytes: sizeBytes,
      sha256: "d".repeat(64),
    },
  });

test("rsp v2 failure codes have stable unique exits", () => {
  assert.deepEqual(
    Object.values(RSP_CLI_FAILURES).map(({ exitCode }) => exitCode),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(
    new Set(Object.values(RSP_CLI_FAILURES).map(({ code }) => code)).size,
    7,
  );
});

test("rsp v2 response and session records reject legacy or extra fields", () => {
  const response = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "request-1",
    ok: false,
    error: {
      code: "rsp-conflict",
      message: "Attempt is already claimed.",
      issues: [
        {
          path: "$.attemptId",
          code: "rsp-attempt-claimed",
          message: "The attempt is already claimed.",
          ownerAction: "Read attempt status instead of starting another continuation.",
        },
      ],
    },
  } as const;
  assert.equal(RspCommandResponseSchema.parse(response).ok, false);
  assert.throws(() =>
    RspCommandResponseSchema.parse({ ...response, stack: "private" }),
  );
  const session = {
    schemaVersion: 2,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    socketPath: "/workspace/.rsp/session/rsp.sock",
    appPid: 41,
    enginePid: 42,
    expiresAt: "2026-08-23T12:00:00.000Z",
  } as const;
  assert.equal(SessionRecordSchema.parse(session).schemaVersion, 2);
  assert.throws(() =>
    SessionRecordSchema.parse({ ...session, schemaVersion: 1 }),
  );
});

test("Main can request one scoped delivery build from Engine", () => {
  const message = MainToEngineMessageSchema.parse({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "delivery-1",
    type: "build-delivery",
    storyId: "story-example",
  });
  assert.equal(message.type, "build-delivery");
  assert.throws(() =>
    MainToEngineMessageSchema.parse({ ...message, repositoryRoot: "/repo" }),
  );
});

test("rsp asset import binds one bounded stdin byte envelope", () => {
  const stdin = {
    role: "scene-visual",
    receipt: imageReceipt(),
    candidateBase64: Buffer.from([1, 2, 3]).toString("base64"),
  } as const;
  assert.equal(RspAssetImportInputSchema.parse(stdin).role, "scene-visual");
  assert.throws(() =>
    RspAssetImportInputSchema.parse({ ...stdin, storyId: "story-example" }),
  );
  assert.throws(() =>
    RspAssetImportInputSchema.parse({
      ...stdin,
      receipt: { ...stdin.receipt, acquisitionId: "pexels:2" },
    }),
  );
  assert.throws(() =>
    RspAssetImportInputSchema.parse({
      ...stdin,
      candidatePath: "/tmp/candidate.png",
    }),
  );
  const request = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "asset-1",
    workspaceId,
    command: "asset-import",
    storyId: "story-example",
    ...stdin,
  } as const;
  assert.equal(RspCommandRequestSchema.parse(request).command, "asset-import");
  assert.equal(
    RSP_MAX_ASSET_BASE64_CHARACTERS,
    Math.ceil(RSP_MAX_ASSET_BYTES / 3) * 4,
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...request,
      candidatePath: "/tmp/candidate.png",
    }),
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...request,
      candidateBase64: Buffer.from([1, 2]).toString("base64"),
    }),
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...request,
      receipt: imageReceipt(1),
      candidateBase64: "/x==",
    }),
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...request,
      receipt: imageReceipt(RSP_MAX_ASSET_BYTES + 1),
      candidateBase64: "AAAA",
    }),
  );
});

test("rsp context accepts only explicit delivery and execution overrides", () => {
  const base = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "context-1",
    workspaceId,
    command: "context",
    storyId: "story-example",
  } as const;
  assert.deepEqual(RspCommandRequestSchema.parse(base), base);
  assert.equal(
    RspCommandRequestSchema.parse({
      ...base,
      deliveryPolicy: "automatic",
      execution: {
        mode: "subagents",
        maxConcurrency: 3,
        requireExactConcurrency: true,
      },
      runtimeMaxConcurrency: 4,
    }).command,
    "context",
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...base,
      deliveryPolicy: "automatic",
      executionMode: "subagents",
    }),
  );
});

test("rsp discovery, lifecycle, task, and attempt requests remain strict", () => {
  const taskRevision = `task-${"c".repeat(64)}`;
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const bindingId = buildTaskWorkerBindingId({ taskRevision, attemptId });
  const request = (command: Record<string, unknown>) =>
    RspCommandRequestSchema.parse({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "surface-1",
      workspaceId,
      ...command,
    });
  assert.equal(request({ command: "project-create-context" }).command, "project-create-context");
  assert.equal(
    request({ command: "project-validate", input: { schemaVersion: 1 } }).command,
    "project-validate",
  );
  assert.equal(request({ command: "project-list" }).command, "project-list");
  assert.equal(
    request({
      command: "project-delete",
      storyId: "story-example",
      confirmDelete: true,
    }).command,
    "project-delete",
  );
  assert.equal(
    request({
      command: "task-describe",
      taskRevision,
      attemptId,
      bindingId,
    }).command,
    "task-describe",
  );
  assert.equal(
    request({
      command: "task-finalize",
      taskRevision,
      attemptId,
      bindingId,
    }).command,
    "task-finalize",
  );
  assert.equal(
    request({
      command: "task-bind",
      taskRevision,
      attemptId,
      bindingId,
      transport: "controller-io",
    }).command,
    "task-bind",
  );
  assert.equal(
    request({
      command: "attempt-status",
      storyId: "story-example",
      attemptId,
    }).command,
    "attempt-status",
  );
  assert.throws(() => request({ command: "project-delete", storyId: "story-example" }));
});

test("rsp prepare omits policy when no command override was supplied", () => {
  const request = RspCommandRequestSchema.parse({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "prepare-1",
    workspaceId,
    command: "prepare",
    storyId: "story-example",
  });
  assert.equal(request.command, "prepare");
  assert.equal("deliveryPolicy" in request, false);
});
