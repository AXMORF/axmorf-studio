import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionRevisionIdSchema,
  ProjectRevisionCandidateIdSchema,
  StoryIdSchema,
  TaskRevisionSchema,
} from "../../src/contracts";

import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  PreviewCatalogSchema,
  type PreviewCatalog,
} from "../../desktop/contracts/preview";
import {
  DESKTOP_NETWORK_POLICY,
  EngineToMainMessageSchema,
  RSP_PROTOCOL_VERSION,
  RspCommandRequestSchema,
  type EngineToMainMessage,
  type RspCommandRequest,
} from "../../desktop/contracts/protocol";
import { RspCommandFailure } from "../../desktop/adapters/rsp-socket";
import {
  buildDesktopCompatibilityManifest,
  type RuntimePackManifest,
} from "../../desktop/contracts/runtime-pack";
import { createDesktopPrivateConfig } from "../../desktop/contracts/settings";
import { createWorkspaceManifest } from "../../desktop/contracts/workspace";
import {
  createEngineController,
  type EngineDependencies,
  type EngineMessageEvent,
} from "../../desktop/engine/entry";
import { desktopProducerConfigFixture } from "./producer-config-fixture";

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";
const expiresAt = "2026-08-22T12:00:00.000Z";
const runtimePack = {
  runtimePackId: `runtime-pack-${"a".repeat(64)}`,
  architecture: "arm64",
  platform: "darwin",
  engineVersion: "desktop-engine-phase-b-v1",
  protocolVersion: "rsp-local-v2",
  skillVersion: "workspace-production-skill-v1",
  workspaceSchemaVersion: 2,
  rspClient: {
    relativePath: "bin/rsp",
    sha256: "b".repeat(64),
    version: "rsp-local-v2",
  },
} as unknown as RuntimePackManifest;

const emptyCatalog = (): PreviewCatalog =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: [],
    unavailable: [],
  });

const assetImportRequest = (requestId: string) =>
  RspCommandRequestSchema.parse({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId,
    workspaceId,
    command: "asset-import",
    storyId: "story-one",
    role: "scene-visual",
    receipt: {
      schemaVersion: 1,
      provider: "pexels",
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
        sizeInBytes: 3,
        sha256: "d".repeat(64),
      },
    },
    candidateBase64: Buffer.from([1, 2, 3]).toString("base64"),
  });

const tokenEvent = (
  token: Uint8Array,
  privateConfig: unknown = createDesktopPrivateConfig({
    producerConfig: desktopProducerConfigFixture,
  }),
): EngineMessageEvent => {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  let closed = false;
  return {
    data: {
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "initialize-1",
      type: "initialize",
      workspaceRoot: "/tmp/axmorf-workspace",
      appResourcesRoot: "/tmp/app-resources",
      applicationSupportRoot: "/tmp/app-support",
      cacheRoot: "/tmp/cache",
      appPid: 41,
      sessionExpiresAt: expiresAt,
    },
    ports: [
      {
        on: (_type, nextListener) => {
          listener = nextListener;
        },
        off: () => {
          listener = undefined;
        },
        start: () => {
          queueMicrotask(() => {
            if (!closed) {
              listener?.({
                data: {
                  token,
                  privateConfig,
                  provider: privateConfig === null ? "not-configured" : "ready",
                },
              } as MessageEvent<unknown>);
            }
          });
        },
        close: () => {
          closed = true;
        },
      },
    ],
  };
};

const command = (
  type: "refresh-preview-catalog" | "shutdown",
  requestId: string,
): EngineMessageEvent => ({
  data: { protocolVersion: RSP_PROTOCOL_VERSION, requestId, type },
});

const createHarness = ({
  failRuntime = false,
  executeCommand,
}: {
  readonly failRuntime?: boolean;
  readonly executeCommand?: (request: RspCommandRequest) => Promise<unknown>;
} = {}) => {
  const messages: EngineToMainMessage[] = [];
  const commands: string[] = [];
  let rspClosed = 0;
  let receivedToken: Uint8Array | undefined;
  let executeFromRsp:
    | ((request: RspCommandRequest) => Promise<unknown>)
    | undefined;
  let authorizeFromRsp: ((request: RspCommandRequest) => void) | undefined;
  let catalogReads = 0;
  const dependencies: EngineDependencies = {
    initializeWorkspace: async (options) => {
      assert.equal(
        options.rspExecutable.path,
        "/tmp/app-resources/runtime-pack/bin/rsp",
      );
      return {
        workspaceRoot: options.workspaceRoot,
        manifest: createWorkspaceManifest(workspaceId),
        initialized: true,
      };
    },
    verifyRuntimePack: async () => {
      if (failRuntime) throw new Error("runtime-secret");
      return runtimePack;
    },
    readCompatibility: async () =>
      buildDesktopCompatibilityManifest({
        appVersion: "0.1.0",
        runtimePack,
      }),
    resolveRuntime: async () => ({
      rendererRuntimeFingerprint: `sha256:${"c".repeat(64)}`,
      browserExecutable: "/tmp/app-resources/runtime-pack/browser/chrome",
      binariesDirectory: "/tmp/app-resources/runtime-pack/bin",
      ffmpegExecutable: "/tmp/app-resources/runtime-pack/bin/ffmpeg",
      ffprobeExecutable: "/tmp/app-resources/runtime-pack/bin/ffprobe",
    }),
    buildPreviewCatalog: async () => {
      catalogReads += 1;
      return { catalog: emptyCatalog(), projects: [] };
    },
    createCommandRuntime: async () => ({
      activeWork: null,
      deliveryAvailable: true,
      deliveryBlocker: null,
      shutdown: async () => undefined,
      latestAttempt: async () => null,
      executeCommand: async (request) => {
        commands.push(request.command);
        if (executeCommand !== undefined) return executeCommand(request);
        return request.command === "prepare"
          ? { attemptId: "ed99ee7f-f8ec-45f0-ae5e-0a840bcfd720" }
          : { status: "ok" };
      },
    }),
    startRspDoctorServer: async (options) => {
      receivedToken = Uint8Array.from(options.token);
      assert.equal(options.workspaceId, workspaceId);
      assert.deepEqual(
        options.getDoctorState().network,
        DESKTOP_NETWORK_POLICY,
      );
      assert.ok(options.executeCommand !== undefined);
      assert.ok(options.authorizeCommand !== undefined);
      authorizeFromRsp = options.authorizeCommand;
      executeFromRsp = options.executeCommand;
      return {
        record: {
          schemaVersion: 2,
          protocolVersion: RSP_PROTOCOL_VERSION,
          workspaceId,
          socketPath: "/tmp/axmorf-workspace/.rsp/session/rsp.sock",
          appPid: 41,
          enginePid: 42,
          expiresAt,
        },
        close: async () => {
          rspClosed += 1;
        },
      };
    },
    homeDirectory: () => "/tmp/home",
    enginePid: () => 42,
    tokenTimeoutMs: 100,
  };
  const controller = createEngineController({
    parentPort: {
      postMessage: (message) => {
        messages.push(EngineToMainMessageSchema.parse(message));
      },
    },
    dependencies,
  });
  return {
    controller,
    messages,
    commands,
    getReceivedToken: () => receivedToken,
    getRspClosed: () => rspClosed,
    getCatalogReads: () => catalogReads,
    executeFromRsp: (request: RspCommandRequest) => {
      if (executeFromRsp === undefined) throw new Error("rsp-not-started");
      authorizeFromRsp?.(request);
      return executeFromRsp(request);
    },
  };
};

test("Engine verifies embedded Runtime Pack before advertising Phase B capabilities", async () => {
  const harness = createHarness();
  const token = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  await harness.controller.handleMessageEvent(tokenEvent(token));
  assert.deepEqual(harness.getReceivedToken(), token);
  assert.equal(harness.getCatalogReads(), 0);
  const doctor = harness.controller.doctorState();
  assert.equal(doctor.adapterMode, "workspace");
  assert.equal(doctor.runtimePackMode, "embedded");
  assert.equal(doctor.productionAvailable, true);
  assert.equal(doctor.deliveryAvailable, true);
  assert.equal(doctor.deliveryBlocker, null);
  assert.equal(doctor.runtimePack.runtimePackId, runtimePack.runtimePackId);
  assert.equal(doctor.activeWork, null);
  assert.doesNotMatch(JSON.stringify(harness.messages), /Bearer|secret/iu);
});

test("deferred prepare publishes active work before provider work and transitions without an idle gap", async () => {
  let resolvePrepare: ((value: unknown) => void) | undefined;
  const prepareResult = new Promise<unknown>((resolve) => {
    resolvePrepare = resolve;
  });
  const harness = createHarness({
    executeCommand: (request) =>
      request.command === "prepare"
        ? prepareResult
        : Promise.resolve({ status: "ok" }),
  });
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(6)),
  );

  const pending = harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-deferred-prepare",
    workspaceId,
    command: "prepare",
    storyId: StoryIdSchema.parse("story-one"),
    deliveryPolicy: "manual",
  });
  assert.deepEqual(harness.controller.doctorState().activeWork, {
    storyId: "story-one",
    kind: "production",
    attemptId: null,
    phase: "preparing-production",
  });
  assert.deepEqual(
    harness.messages
      .filter(
        (message) =>
          message.requestId === "rsp-deferred-prepare" &&
          message.type === "active-work-state",
      )
      .map((message) =>
        message.type === "active-work-state" ? message.activeWork?.phase : null,
      ),
    ["preparing-production"],
  );

  resolvePrepare?.({ attemptId: "ed99ee7f-f8ec-45f0-ae5e-0a840bcfd720" });
  await pending;
  assert.equal(
    harness.controller.doctorState().activeWork?.phase,
    "awaiting-task-terminals",
  );
  assert.deepEqual(
    harness.messages
      .filter(
        (message) =>
          message.requestId === "rsp-deferred-prepare" &&
          message.type === "active-work-state",
      )
      .map((message) =>
        message.type === "active-work-state" ? message.activeWork?.phase : null,
      ),
    ["preparing-production", "awaiting-task-terminals"],
  );
});

test("failed deferred prepare clears its preparing active work", async () => {
  let rejectPrepare: ((error: Error) => void) | undefined;
  const prepareResult = new Promise<unknown>((_resolve, reject) => {
    rejectPrepare = reject;
  });
  const harness = createHarness({
    executeCommand: (request) =>
      request.command === "prepare"
        ? prepareResult
        : Promise.resolve({ status: "ok" }),
  });
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(8)),
  );

  const pending = harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-failed-prepare",
    workspaceId,
    command: "prepare",
    storyId: StoryIdSchema.parse("story-one"),
    deliveryPolicy: "manual",
  });
  assert.equal(
    harness.controller.doctorState().activeWork?.phase,
    "preparing-production",
  );
  rejectPrepare?.(new Error("provider-unavailable"));
  await assert.rejects(pending, /provider-unavailable/u);
  assert.equal(harness.controller.doctorState().activeWork, null);
  assert.deepEqual(
    harness.messages
      .filter(
        (message) =>
          message.requestId === "rsp-failed-prepare" &&
          message.type === "active-work-state",
      )
      .map((message) =>
        message.type === "active-work-state"
          ? (message.activeWork?.phase ?? null)
          : null,
      ),
    ["preparing-production", null],
  );
});

test("active work rejects conflicting mutations and only admits its exact attempt", async () => {
  let resolvePrepare: ((value: unknown) => void) | undefined;
  const prepareResult = new Promise<unknown>((resolve) => {
    resolvePrepare = resolve;
  });
  const harness = createHarness({
    executeCommand: (request) =>
      request.command === "prepare"
        ? prepareResult
        : Promise.resolve({ status: "ok" }),
  });
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(3)),
  );
  const attemptId = "ed99ee7f-f8ec-45f0-ae5e-0a840bcfd720";
  const revisionId = ProductionRevisionIdSchema.parse(
    `revision-${"a".repeat(64)}`,
  );
  const prepare = (requestId: string) =>
    ({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      workspaceId,
      command: "prepare",
      storyId: StoryIdSchema.parse("story-one"),
      deliveryPolicy: "manual",
    }) as const;
  const expectConflict = async (request: RspCommandRequest) => {
    await assert.rejects(
      async () => harness.executeFromRsp(request),
      (error: unknown) =>
        error instanceof RspCommandFailure && error.code === "rsp-conflict",
    );
  };

  const pending = harness.executeFromRsp(prepare("rsp-first-prepare"));
  await expectConflict(prepare("rsp-second-prepare"));
  await expectConflict(assetImportRequest("rsp-active-import"));
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-active-delivery",
    workspaceId,
    command: "delivery-build",
    storyId: StoryIdSchema.parse("story-one"),
  });
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-finalize-before-attempt",
    workspaceId,
    command: "task-finalize",
    taskRevision: TaskRevisionSchema.parse(`task-${"b".repeat(64)}`),
  });
  assert.deepEqual(harness.commands, ["prepare"]);
  assert.equal(
    harness.controller.doctorState().activeWork?.phase,
    "preparing-production",
  );

  resolvePrepare?.({ attemptId });
  await pending;
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-wrong-story-continue",
    workspaceId,
    command: "continue",
    storyId: StoryIdSchema.parse("story-two"),
    revisionId,
    attemptId,
    deliveryPolicy: "manual",
  });
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-wrong-candidate-continue",
    workspaceId,
    command: "continue",
    storyId: StoryIdSchema.parse("story-one"),
    revisionId,
    attemptId,
    candidateId: ProjectRevisionCandidateIdSchema.parse(
      `revision-candidate-${"c".repeat(64)}`,
    ),
    deliveryPolicy: "automatic",
  });
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-wrong-attempt-continue",
    workspaceId,
    command: "continue",
    storyId: StoryIdSchema.parse("story-one"),
    revisionId,
    attemptId: "11111111-1111-4111-8111-111111111111",
    deliveryPolicy: "manual",
  });
  await expectConflict({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-wrong-attempt-commit",
    workspaceId,
    command: "task-commit",
    taskRevision: TaskRevisionSchema.parse(`task-${"b".repeat(64)}`),
    attemptId: "11111111-1111-4111-8111-111111111111",
  });
  assert.deepEqual(harness.commands, ["prepare"]);
  assert.equal(
    harness.controller.doctorState().activeWork?.phase,
    "awaiting-task-terminals",
  );

  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-active-task-describe",
    workspaceId,
    command: "task-describe",
    taskRevision: TaskRevisionSchema.parse(`task-${"b".repeat(64)}`),
  });
  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-active-task-finalize",
    workspaceId,
    command: "task-finalize",
    taskRevision: TaskRevisionSchema.parse(`task-${"b".repeat(64)}`),
  });
  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-exact-attempt-commit",
    workspaceId,
    command: "task-commit",
    taskRevision: TaskRevisionSchema.parse(`task-${"b".repeat(64)}`),
    attemptId,
  });
  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-exact-attempt-continue",
    workspaceId,
    command: "continue",
    storyId: StoryIdSchema.parse("story-one"),
    revisionId,
    attemptId,
    deliveryPolicy: "manual",
  });
  assert.deepEqual(harness.commands, [
    "prepare",
    "task-describe",
    "task-finalize",
    "task-commit",
    "continue",
  ]);
  assert.equal(harness.controller.doctorState().activeWork, null);
});

test("Engine refresh emits exact Catalog, Project state, and doctor", async () => {
  const harness = createHarness();
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(7)),
  );
  await harness.controller.handleMessageEvent(
    command("refresh-preview-catalog", "refresh-1"),
  );
  assert.equal(harness.getCatalogReads(), 1);
  assert.deepEqual(
    harness.messages.slice(-4).map(({ type }) => type),
    [
      "preview-catalog",
      "workspace-projects",
      "production-progress",
      "doctor-state",
    ],
  );
  await harness.controller.handleMessageEvent(
    command("shutdown", "shutdown-1"),
  );
  assert.equal(harness.getRspClosed(), 1);
  assert.equal(harness.messages.at(-1)?.type, "stopped");
});

test("RSP production terminals publish active work and automatically refresh Catalog", async () => {
  const harness = createHarness();
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(5)),
  );
  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-prepare-1",
    workspaceId,
    command: "prepare",
    storyId: StoryIdSchema.parse("story-one"),
    deliveryPolicy: "manual",
  });
  assert.equal(
    harness.controller.doctorState().activeWork?.phase,
    "awaiting-task-terminals",
  );
  assert.equal(harness.getCatalogReads(), 1);

  await harness.executeFromRsp({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "rsp-continue-1",
    workspaceId,
    command: "continue",
    storyId: StoryIdSchema.parse("story-one"),
    revisionId: ProductionRevisionIdSchema.parse(`revision-${"a".repeat(64)}`),
    attemptId: "ed99ee7f-f8ec-45f0-ae5e-0a840bcfd720",
    deliveryPolicy: "manual",
  });
  assert.equal(harness.controller.doctorState().activeWork, null);
  assert.equal(harness.getCatalogReads(), 2);
  assert.ok(
    harness.messages.some(
      (message) =>
        message.type === "active-work-state" && message.activeWork !== null,
    ),
  );
  assert.ok(
    harness.messages.some(
      (message) =>
        message.type === "active-work-state" && message.activeWork === null,
    ),
  );
  const messageTypes = harness.messages.map(({ type }) => type);
  const idleIndex = messageTypes.lastIndexOf("active-work-state");
  const catalogIndex = messageTypes.lastIndexOf("preview-catalog");
  const progressIndex = messageTypes.lastIndexOf("production-progress");
  assert.ok(catalogIndex >= 0 && catalogIndex < idleIndex);
  assert.ok(progressIndex >= 0 && progressIndex < idleIndex);
});

test("missing private ProducerConfig keeps inspect available without provider readiness", async () => {
  const harness = createHarness();
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(4), null),
  );
  assert.equal(harness.controller.doctorState().productionAvailable, true);
  assert.equal(harness.controller.doctorState().provider, "not-configured");
  assert.ok(harness.getReceivedToken() !== undefined);
});

test("invalid Runtime Pack fails closed before Workspace or rsp capabilities", async () => {
  const harness = createHarness({ failRuntime: true });
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(9)),
  );
  const fatal = harness.messages.at(-1);
  assert.equal(fatal?.type, "fatal");
  if (fatal?.type === "fatal") assert.equal(fatal.code, "runtime-pack-invalid");
  assert.equal(harness.getReceivedToken(), undefined);
  assert.doesNotMatch(JSON.stringify(harness.messages), /runtime-secret/u);
});
