import { homedir } from "node:os";
import { join } from "node:path";

import { buildRepositoryPreviewCatalog } from "../adapters/repository-preview-catalog";
import {
  startRspDoctorServer,
  type RspDoctorServerHandle,
} from "../adapters/rsp-socket";
import { initializeWorkspace } from "../application/initialize-workspace";
import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
  type PreviewCatalog,
  type PreviewCatalogReadiness,
} from "../contracts/preview";
import {
  DoctorResponseSchema,
  RSP_PROTOCOL_VERSION,
  parseMainToEngineMessage,
  type DoctorResponse,
  type EngineToMainMessage,
  type MainToEngineMessage,
} from "../contracts/protocol";

export const DESKTOP_ENGINE_ENTRY_ID = "desktop-engine-phase-a-v1" as const;

type TokenPort = {
  readonly on: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  readonly off: (
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  readonly start: () => void;
  readonly close: () => void;
};

export type EngineMessageEvent = {
  readonly data: unknown;
  readonly ports?: readonly TokenPort[];
};

export type EngineParentPort = {
  readonly postMessage: (message: EngineToMainMessage) => void;
};

export type EngineDependencies = Readonly<{
  initializeWorkspace: typeof initializeWorkspace;
  buildPreviewCatalog: typeof buildRepositoryPreviewCatalog;
  startRspDoctorServer: typeof startRspDoctorServer;
  homeDirectory: () => string;
  enginePid: () => number;
  tokenTimeoutMs: number;
}>;

const defaultDependencies: EngineDependencies = {
  initializeWorkspace,
  buildPreviewCatalog: buildRepositoryPreviewCatalog,
  startRspDoctorServer,
  homeDirectory: homedir,
  enginePid: () => process.pid,
  tokenTimeoutMs: 5_000,
};

const emptyCatalog = (): PreviewCatalog =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_CATALOG_VERSION,
    entries: [],
    unavailable: [],
  });

const notLoaded = (): PreviewCatalogReadiness =>
  PreviewCatalogReadinessSchema.parse({
    state: "not-loaded",
    entryCount: 0,
    unavailableCount: 0,
    failureCode: null,
  });

const receiveSessionToken = ({
  ports,
  timeoutMs,
}: {
  readonly ports: readonly TokenPort[] | undefined;
  readonly timeoutMs: number;
}) => {
  if (ports?.length !== 1) {
    return Promise.reject(new Error("engine-session-token-port-required"));
  }
  const port = ports[0]!;
  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, token?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      port.off("message", onMessage);
      port.close();
      if (error === null && token !== undefined) resolve(token);
      else reject(error ?? new Error("engine-session-token-invalid"));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!(event.data instanceof Uint8Array) || event.data.byteLength < 32) {
        finish(new Error("engine-session-token-invalid"));
        return;
      }
      finish(null, Uint8Array.from(event.data));
    };
    const timer = setTimeout(
      () => finish(new Error("engine-session-token-timeout")),
      timeoutMs,
    );
    timer.unref();
    port.on("message", onMessage);
    port.start();
  });
};

const requestIdFromUnknown = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "string" &&
    /^[A-Za-z0-9._:-]{1,128}$/u.test(value.requestId)
  ) {
    return value.requestId;
  }
  return "engine-invalid-request";
};

type FatalCode = Extract<EngineToMainMessage, { type: "fatal" }>["code"];

const fatalMessage = (code: FatalCode) => {
  switch (code) {
    case "engine-protocol-invalid":
      return "Desktop Engine rejected an incompatible message.";
    case "engine-initialization-failed":
      return "Desktop Engine initialization failed.";
    case "preview-catalog-failed":
      return "Desktop Preview Catalog refresh failed.";
    case "rsp-server-failed":
      return "Workspace rsp server failed.";
  }
};

export const createEngineController = ({
  parentPort,
  dependencies = defaultDependencies,
}: {
  readonly parentPort: EngineParentPort;
  readonly dependencies?: EngineDependencies;
}) => {
  let workspace: Awaited<ReturnType<typeof initializeWorkspace>> | undefined;
  let repositoryRoot: string | undefined;
  let appPid: number | undefined;
  let sessionExpiresAt: string | undefined;
  let rspServer: RspDoctorServerHandle | undefined;
  let catalog = emptyCatalog();
  let catalogReadiness = notLoaded();
  let terminal = false;

  const post = (message: EngineToMainMessage) =>
    parentPort.postMessage(message);

  const doctorState = (): DoctorResponse => {
    if (
      workspace === undefined ||
      appPid === undefined ||
      sessionExpiresAt === undefined
    ) {
      throw new Error("engine-not-initialized");
    }
    return DoctorResponseSchema.parse({
      schemaVersion: 1,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId: workspace.manifest.workspaceId,
      adapterMode: "repository",
      repositoryMode: "build-time-checkout",
      runtimePackMode: "host-node-prototype",
      previewCatalog: catalogReadiness,
      desktopTcpListeners: false,
      productionAvailable: false,
      deliveryAvailable: false,
      distributionReady: false,
      runtimePackAvailable: false,
      activeWork: false,
      process: { appPid, enginePid: dependencies.enginePid() },
      session: { active: true, expiresAt: sessionExpiresAt },
    });
  };

  const stopOwnedResources = async () => {
    await rspServer?.close().catch(() => undefined);
    rspServer = undefined;
  };

  const fatal = async ({
    requestId,
    code,
  }: {
    readonly requestId: string;
    readonly code: FatalCode;
  }) => {
    if (terminal) return;
    terminal = true;
    await stopOwnedResources();
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type: "fatal",
      code,
      message: fatalMessage(code),
    });
  };

  const initialize = async (
    message: Extract<MainToEngineMessage, { readonly type: "initialize" }>,
    event: EngineMessageEvent,
  ) => {
    if (workspace !== undefined) throw new Error("engine-already-initialized");
    const token = await receiveSessionToken({
      ports: event.ports,
      timeoutMs: dependencies.tokenTimeoutMs,
    });
    workspace = await dependencies.initializeWorkspace({
      workspaceRoot: message.workspaceRoot,
      homeDirectory: dependencies.homeDirectory(),
      repositoryRoot: message.repositoryRoot,
      integrationResourcesRoot: join(
        message.repositoryRoot,
        "desktop/resources/workspace-integration",
      ),
      forbiddenRoots: [],
    });
    repositoryRoot = message.repositoryRoot;
    appPid = message.appPid;
    sessionExpiresAt = message.sessionExpiresAt;
    try {
      rspServer = await dependencies.startRspDoctorServer({
        workspaceRoot: workspace.workspaceRoot,
        workspaceId: workspace.manifest.workspaceId,
        appPid,
        enginePid: dependencies.enginePid(),
        expiresAt: sessionExpiresAt,
        token,
        getDoctorState: doctorState,
      });
    } catch {
      await fatal({ requestId: message.requestId, code: "rsp-server-failed" });
      return;
    }
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: message.requestId,
      type: "initialized",
      workspaceId: workspace.manifest.workspaceId,
      workspaceRoot: workspace.workspaceRoot,
    });
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: message.requestId,
      type: "doctor-state",
      doctor: doctorState(),
    });
  };

  const refreshPreviewCatalog = async (requestId: string) => {
    if (repositoryRoot === undefined) throw new Error("engine-not-initialized");
    try {
      catalog = await dependencies.buildPreviewCatalog({ repositoryRoot });
      catalogReadiness = PreviewCatalogReadinessSchema.parse({
        state: "ready",
        entryCount: catalog.entries.length,
        unavailableCount: catalog.unavailable.length,
        failureCode: null,
      });
    } catch {
      catalog = emptyCatalog();
      catalogReadiness = PreviewCatalogReadinessSchema.parse({
        state: "failed",
        entryCount: 0,
        unavailableCount: 0,
        failureCode: "preview-catalog-failed",
      });
      await fatal({ requestId, code: "preview-catalog-failed" });
      return;
    }
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type: "preview-catalog",
      catalog,
    });
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type: "doctor-state",
      doctor: doctorState(),
    });
  };

  const handleMessageEvent = async (event: EngineMessageEvent) => {
    if (terminal) return;
    let message: MainToEngineMessage;
    try {
      message = parseMainToEngineMessage(event.data);
    } catch {
      await fatal({
        requestId: requestIdFromUnknown(event.data),
        code: "engine-protocol-invalid",
      });
      return;
    }
    try {
      if (message.type === "initialize") {
        await initialize(message, event);
        return;
      }
      if (workspace === undefined || rspServer === undefined) {
        throw new Error("engine-not-initialized");
      }
      if (message.type === "refresh-preview-catalog") {
        await refreshPreviewCatalog(message.requestId);
        return;
      }
      terminal = true;
      await stopOwnedResources();
      post({
        protocolVersion: RSP_PROTOCOL_VERSION,
        requestId: message.requestId,
        type: "stopped",
      });
    } catch {
      await fatal({
        requestId: message.requestId,
        code:
          message.type === "initialize"
            ? "engine-initialization-failed"
            : "preview-catalog-failed",
      });
    }
  };

  return {
    handleMessageEvent,
    doctorState,
    stopOwnedResources,
    snapshotCatalog: () => catalog,
  };
};

if (process.parentPort !== undefined) {
  const controller = createEngineController({ parentPort: process.parentPort });
  let queue = Promise.resolve();
  process.parentPort.on("message", (event) => {
    queue = queue.then(() =>
      controller.handleMessageEvent({
        data: event.data,
        ports: event.ports as unknown as readonly TokenPort[],
      }),
    );
  });
}
