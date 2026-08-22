import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  PreviewCatalogSchema,
  type PreviewCatalog,
} from "../../desktop/contracts/preview";
import {
  EngineToMainMessageSchema,
  RSP_PROTOCOL_VERSION,
  type EngineToMainMessage,
} from "../../desktop/contracts/protocol";
import { createWorkspaceManifest } from "../../desktop/contracts/workspace";
import {
  createEngineController,
  type EngineDependencies,
  type EngineMessageEvent,
} from "../../desktop/engine/entry";

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";
const expiresAt = "2026-08-22T12:00:00.000Z";

const emptyCatalog = (): PreviewCatalog =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: [],
    unavailable: [],
  });

const unavailableCatalog = (): PreviewCatalog =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: [],
    unavailable: [{ storyId: "story-one", code: "delivery-missing" }],
  });

const tokenEvent = (token: Uint8Array): EngineMessageEvent => {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  let closed = false;
  return {
    data: {
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "initialize-1",
      type: "initialize",
      workspaceRoot: "/tmp/axmorf-workspace",
      repositoryRoot: "/tmp/repository",
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
            if (!closed) listener?.({ data: token } as MessageEvent<unknown>);
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
  catalog = unavailableCatalog(),
  failCatalog = false,
}: {
  readonly catalog?: PreviewCatalog;
  readonly failCatalog?: boolean;
} = {}) => {
  const messages: EngineToMainMessage[] = [];
  let rspClosed = 0;
  let receivedToken: Uint8Array | undefined;
  let catalogReads = 0;
  const dependencies: EngineDependencies = {
    initializeWorkspace: async (options) => ({
      workspaceRoot: options.workspaceRoot,
      manifest: createWorkspaceManifest(workspaceId),
      initialized: true,
    }),
    buildPreviewCatalog: async ({ repositoryRoot }) => {
      catalogReads += 1;
      assert.equal(repositoryRoot, "/tmp/repository");
      if (failCatalog) throw new Error("/private/repository/catalog-secret");
      return catalog;
    },
    startRspDoctorServer: async (options) => {
      receivedToken = Uint8Array.from(options.token);
      assert.equal(options.workspaceId, workspaceId);
      assert.equal(options.getDoctorState().desktopTcpListeners, false);
      return {
        record: {
          schemaVersion: 1,
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
    getReceivedToken: () => receivedToken,
    getRspClosed: () => rspClosed,
    getCatalogReads: () => catalogReads,
  };
};

test("Engine initializes Workspace and rsp UDS without starting or refreshing repository services", async () => {
  const harness = createHarness();
  const token = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  await harness.controller.handleMessageEvent(tokenEvent(token));

  assert.deepEqual(harness.getReceivedToken(), token);
  assert.equal(harness.getCatalogReads(), 0);
  assert.deepEqual(
    harness.messages.map(({ type }) => type),
    ["initialized", "doctor-state"],
  );
  const doctor = harness.controller.doctorState();
  assert.equal(doctor.previewCatalog.state, "not-loaded");
  assert.equal(doctor.desktopTcpListeners, false);
  assert.equal(doctor.repositoryMode, "build-time-checkout");
  assert.equal(doctor.productionAvailable, false);
  assert.equal(doctor.deliveryAvailable, false);
  assert.doesNotMatch(JSON.stringify(harness.messages), /Bearer|secret/iu);
});

test("Engine refreshes Preview Catalog only on an explicit request and shuts rsp down", async () => {
  const harness = createHarness();
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(7)),
  );
  await harness.controller.handleMessageEvent(
    command("refresh-preview-catalog", "refresh-1"),
  );

  assert.equal(harness.getCatalogReads(), 1);
  assert.deepEqual(
    harness.messages.slice(2).map(({ type }) => type),
    ["preview-catalog", "doctor-state"],
  );
  assert.equal(harness.controller.doctorState().previewCatalog.state, "ready");
  assert.equal(
    harness.controller.doctorState().previewCatalog.unavailableCount,
    1,
  );

  await harness.controller.handleMessageEvent(
    command("shutdown", "shutdown-1"),
  );
  assert.equal(harness.getRspClosed(), 1);
  assert.equal(harness.messages.at(-1)?.type, "stopped");
});

test("unknown protocol and invalid transferred token fail closed with redacted messages", async () => {
  const incompatible = createHarness({ catalog: emptyCatalog() });
  await incompatible.controller.handleMessageEvent({
    data: {
      protocolVersion: "rsp-local-v2",
      requestId: "future-1",
      type: "initialize",
    },
  });
  assert.equal(incompatible.messages[0]?.type, "fatal");
  if (incompatible.messages[0]?.type === "fatal") {
    assert.equal(incompatible.messages[0].code, "engine-protocol-invalid");
    assert.equal(incompatible.messages[0].requestId, "future-1");
  }

  for (const event of [
    { ...tokenEvent(new Uint8Array(32)), ports: [] },
    tokenEvent(new Uint8Array(31).fill(9)),
  ]) {
    const harness = createHarness({ catalog: emptyCatalog() });
    await harness.controller.handleMessageEvent(event);
    const fatal = harness.messages.at(-1);
    assert.equal(fatal?.type, "fatal");
    if (fatal?.type === "fatal") {
      assert.equal(fatal.code, "engine-initialization-failed");
      assert.equal(fatal.message, "Desktop Engine initialization failed.");
    }
    assert.equal(harness.getReceivedToken(), undefined);
  }
});

test("Preview Catalog refresh failure closes rsp and never exposes repository error text", async () => {
  const harness = createHarness({ failCatalog: true });
  await harness.controller.handleMessageEvent(
    tokenEvent(new Uint8Array(32).fill(4)),
  );
  await harness.controller.handleMessageEvent(
    command("refresh-preview-catalog", "refresh-failed"),
  );

  assert.equal(harness.getRspClosed(), 1);
  assert.equal(harness.messages.at(-1)?.type, "fatal");
  const fatal = harness.messages.at(-1);
  if (fatal?.type === "fatal") {
    assert.equal(fatal.code, "preview-catalog-failed");
    assert.equal(fatal.message, "Desktop Preview Catalog refresh failed.");
    assert.doesNotMatch(fatal.message, /private|repository|secret/iu);
  }
  assert.equal(harness.controller.doctorState().previewCatalog.state, "failed");
});
