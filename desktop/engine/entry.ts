import { homedir } from "node:os";
import { join } from "node:path";

import { buildWorkspacePreviewCatalog } from "../adapters/workspace-preview-catalog";
import {
  readWorkspaceActiveProduction,
  workspaceHasActiveProduction,
} from "../adapters/workspace-migration-filesystem";
import { resolveEmbeddedRuntimeExecutionResources } from "../adapters/runtime-execution-resources";
import { createWorkspaceDeliveryLifecycle } from "./workspace-delivery-lifecycle";
import {
  locateEmbeddedRuntimePack,
  readDesktopCompatibilityManifest,
  verifyRuntimePack,
} from "../adapters/runtime-pack-filesystem";
import {
  RspCommandFailure,
  startRspDoctorServer,
  type RspCommandAuthorizer,
  type RspCommandExecutor,
  type RspDoctorServerHandle,
} from "../adapters/rsp-socket";
import { initializeWorkspace } from "../application/initialize-workspace";
import {
  DESKTOP_PREVIEW_CATALOG_VERSION,
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
  type DesktopProjectStatus,
  type PreviewCatalog,
  type PreviewCatalogReadiness,
} from "../contracts/preview";
import {
  DESKTOP_NETWORK_POLICY,
  DoctorResponseSchema,
  RSP_PROTOCOL_VERSION,
  parseMainToEngineMessage,
  type DoctorResponse,
  type EngineToMainMessage,
  type MainToEngineMessage,
  type RspCommandRequest,
} from "../contracts/protocol";
import {
  assertDesktopRuntimeCompatibility,
  type RuntimePackManifest,
} from "../contracts/runtime-pack";
import { ProducerConfigSchema, type ProducerConfig } from "../../src/contracts";
import {
  createWorkspaceProductionLocations,
  type ProductionLocations,
  type RuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { createWorkspaceProductionController } from "../../scripts/project-production/application/workspace-production-controller";
import { createWorkspaceRemotionDeliveryRuntime } from "../../scripts/project-production/application/workspace-remotion-delivery";
import {
  createRuntimeDeliveryInspectionDependencies,
  inspectCurrentDelivery,
} from "../../scripts/project-production/adapters/current-delivery-inspection";
import { recordWorkspaceCommandFailure } from "./workspace-command-diagnostic-port";

export const DESKTOP_ENGINE_ENTRY_ID = "desktop-engine-phase-b-v1" as const;

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

export type WorkspaceCommandRuntime = Readonly<{
  executeCommand: RspCommandExecutor;
  shutdown: () => Promise<void>;
  activeWork: DoctorResponse["activeWork"];
  deliveryAvailable: boolean;
  deliveryBlocker: DoctorResponse["deliveryBlocker"];
}>;

export type EngineDependencies = Readonly<{
  initializeWorkspace: typeof initializeWorkspace;
  verifyRuntimePack: typeof verifyRuntimePack;
  readCompatibility: typeof readDesktopCompatibilityManifest;
  resolveRuntime: typeof resolveEmbeddedRuntimeExecutionResources;
  buildPreviewCatalog: typeof buildWorkspacePreviewCatalog;
  createCommandRuntime: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly workspaceId: string;
    readonly workspaceRoot: string;
    readonly config: ProducerConfig | null;
    readonly provider: DoctorResponse["provider"];
  }) => Promise<WorkspaceCommandRuntime>;
  startRspDoctorServer: typeof startRspDoctorServer;
  homeDirectory: () => string;
  enginePid: () => number;
  tokenTimeoutMs: number;
}>;

const createWorkspaceCommandRuntime: EngineDependencies["createCommandRuntime"] =
  async ({ locations, runtime, workspaceRoot, config, provider }) => {
    const delivery = createWorkspaceRemotionDeliveryRuntime({
      locations,
      runtime,
      lifecycle: createWorkspaceDeliveryLifecycle(),
    });
    try {
      const [controller, activeWork] = await Promise.all([
        createWorkspaceProductionController({
          locations,
          runtime,
          delivery,
          loadProducerConfig: async () => config,
          providerReadiness: provider,
        }),
        readWorkspaceActiveProduction(workspaceRoot),
      ]);
      return {
        executeCommand: (request) => controller.execute(request),
        shutdown: controller.shutdown,
        activeWork,
        deliveryAvailable: true,
        deliveryBlocker: null,
      };
    } catch (error) {
      await delivery.shutdown();
      throw error;
    }
  };

const defaultDependencies: EngineDependencies = {
  initializeWorkspace,
  verifyRuntimePack,
  readCompatibility: readDesktopCompatibilityManifest,
  resolveRuntime: resolveEmbeddedRuntimeExecutionResources,
  buildPreviewCatalog: buildWorkspacePreviewCatalog,
  createCommandRuntime: createWorkspaceCommandRuntime,
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

const receiveSessionMaterial = ({
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
  return new Promise<
    Readonly<{
      token: Uint8Array;
      config: ProducerConfig | null;
      provider: "ready" | "not-configured" | "unavailable";
    }>
  >((resolve, reject) => {
    let settled = false;
    const finish = (
      error: Error | null,
      material?: Readonly<{
        token: Uint8Array;
        config: ProducerConfig | null;
        provider: "ready" | "not-configured" | "unavailable";
      }>,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      port.off("message", onMessage);
      port.close();
      if (error === null && material !== undefined) resolve(material);
      else reject(error ?? new Error("engine-session-token-invalid"));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        !("token" in event.data) ||
        !(event.data.token instanceof Uint8Array) ||
        event.data.token.byteLength < 32 ||
        !("producerConfig" in event.data) ||
        !("provider" in event.data) ||
        (event.data.provider !== "ready" &&
          event.data.provider !== "not-configured" &&
          event.data.provider !== "unavailable")
      ) {
        finish(new Error("engine-session-token-invalid"));
        return;
      }
      try {
        const config =
          event.data.producerConfig === null
            ? null
            : ProducerConfigSchema.parse(event.data.producerConfig);
        if ((event.data.provider === "ready") !== (config !== null)) {
          throw new Error("engine-session-provider-state-invalid");
        }
        finish(null, {
          token: Uint8Array.from(event.data.token),
          config,
          provider: event.data.provider,
        });
      } catch {
        finish(new Error("engine-session-config-invalid"));
      }
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
    case "runtime-pack-invalid":
      return "Embedded Runtime Pack verification failed.";
    case "preview-catalog-failed":
      return "Desktop Preview Catalog refresh failed.";
    case "rsp-server-failed":
      return "Workspace rsp server failed.";
  }
};

const attemptIdFromResult = (value: unknown) => {
  if (
    value !== null &&
    typeof value === "object" &&
    "attemptId" in value &&
    typeof value.attemptId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.attemptId,
    )
  ) {
    return value.attemptId;
  }
  return null;
};

export const createEngineController = ({
  parentPort,
  dependencies = defaultDependencies,
}: {
  readonly parentPort: EngineParentPort;
  readonly dependencies?: EngineDependencies;
}) => {
  let workspace: Awaited<ReturnType<typeof initializeWorkspace>> | undefined;
  let locations: ProductionLocations | undefined;
  let runtime: RuntimeExecutionResources | undefined;
  let runtimePack: RuntimePackManifest | undefined;
  let appPid: number | undefined;
  let sessionExpiresAt: string | undefined;
  let rspServer: RspDoctorServerHandle | undefined;
  let catalog = emptyCatalog();
  let projects: readonly DesktopProjectStatus[] = [];
  let catalogReadiness = notLoaded();
  let activeWork: DoctorResponse["activeWork"] = null;
  let provider: DoctorResponse["provider"] = "not-configured";
  let deliveryAvailable = false;
  let deliveryBlocker: DoctorResponse["deliveryBlocker"] = {
    code: "delivery-runtime-not-verified",
    message: "Delivery runtime capability has not been verified.",
  };
  let rawExecuteCommand: RspCommandExecutor | undefined;
  let shutdownCommandRuntime: (() => Promise<void>) | undefined;
  let terminal = false;

  const post = (message: EngineToMainMessage) =>
    parentPort.postMessage(message);

  const doctorState = (): DoctorResponse => {
    if (
      workspace === undefined ||
      runtimePack === undefined ||
      rawExecuteCommand === undefined ||
      appPid === undefined ||
      sessionExpiresAt === undefined
    ) {
      throw new Error("engine-not-initialized");
    }
    return DoctorResponseSchema.parse({
      schemaVersion: 2,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId: workspace.manifest.workspaceId,
      adapterMode: "workspace",
      runtimePackMode: "embedded",
      previewCatalog: catalogReadiness,
      network: DESKTOP_NETWORK_POLICY,
      productionAvailable: true,
      deliveryAvailable,
      deliveryBlocker,
      distributionReady: false,
      runtimePackAvailable: true,
      runtimePack: {
        runtimePackId: runtimePack.runtimePackId,
        architecture: runtimePack.architecture,
      },
      provider,
      activeWork,
      process: { appPid, enginePid: dependencies.enginePid() },
      session: { active: true, expiresAt: sessionExpiresAt },
    });
  };

  const postActiveWork = (requestId: string) => {
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type: "active-work-state",
      activeWork,
    });
  };

  const stopOwnedResources = async () => {
    await shutdownCommandRuntime?.().catch(() => undefined);
    shutdownCommandRuntime = undefined;
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

  const refreshPreviewCatalog = async (requestId: string) => {
    if (locations === undefined || runtime === undefined) {
      throw new Error("engine-not-initialized");
    }
    const currentRuntime = runtime;
    try {
      const snapshot = await dependencies.buildPreviewCatalog({
        locations,
        rendererRuntimeFingerprint:
          currentRuntime.rendererRuntimeFingerprint,
        dependencies: {
          inspectDelivery: ({ locations, storyId }) =>
            inspectCurrentDelivery({
              locations,
              storyId,
              dependencies:
                createRuntimeDeliveryInspectionDependencies(currentRuntime),
            }),
        },
      });
      catalog = snapshot.catalog;
      projects = snapshot.projects;
      catalogReadiness = PreviewCatalogReadinessSchema.parse({
        state: "ready",
        entryCount: catalog.entries.length,
        unavailableCount: catalog.unavailable.length,
        failureCode: null,
      });
    } catch {
      catalog = emptyCatalog();
      projects = [];
      catalogReadiness = PreviewCatalogReadinessSchema.parse({
        state: "failed",
        entryCount: 0,
        unavailableCount: 0,
        failureCode: "preview-catalog-failed",
      });
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
      type: "workspace-projects",
      projects,
    });
    post({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type: "doctor-state",
      doctor: doctorState(),
    });
  };

  const authorizeCommand: RspCommandAuthorizer = (request) => {
    const readonlyDuringActive =
      request.command === "doctor" ||
      request.command === "context" ||
      request.command === "inspect" ||
      request.command === "task-check";
    const exactAttemptTerminal =
      (request.command === "task-commit" || request.command === "task-fail") &&
      activeWork?.kind === "production" &&
      activeWork.attemptId !== null &&
      request.attemptId === activeWork.attemptId;
    const exactContinuation =
      request.command === "continue" &&
      activeWork?.kind === "production" &&
      activeWork.attemptId !== null &&
      request.storyId === activeWork.storyId &&
      request.attemptId === activeWork.attemptId;
    const attemptCommand =
      request.command === "task-commit" ||
      request.command === "task-fail" ||
      request.command === "continue";
    if (
      (!readonlyDuringActive &&
        activeWork !== null &&
        !exactAttemptTerminal &&
        !exactContinuation) ||
      (attemptCommand && activeWork === null)
    ) {
      throw new RspCommandFailure(
        "rsp-conflict",
        "The command conflicts with the active Workspace operation.",
      );
    }
    if (
      !deliveryAvailable &&
      (request.command === "delivery-build" ||
        (request.command === "continue" &&
          request.deliveryPolicy === "automatic"))
    ) {
      throw new Error(
        deliveryBlocker?.code ?? "desktop-delivery-runtime-unavailable",
      );
    }
    if (request.command === "prepare") {
      activeWork = {
        storyId: request.storyId,
        kind: "production",
        attemptId: null,
        phase: "preparing-production",
      };
      postActiveWork(request.requestId);
    } else if (request.command === "delivery-build") {
      activeWork = {
        storyId: request.storyId,
        kind: "delivery",
        attemptId: null,
        phase: "building-delivery",
      };
      postActiveWork(request.requestId);
    } else if (exactContinuation && request.command === "continue") {
      activeWork = {
        storyId: request.storyId,
        kind: "production",
        attemptId: request.attemptId,
        phase: "continuing-production",
      };
      postActiveWork(request.requestId);
    }
  };

  const runCommand = async (request: RspCommandRequest) => {
    if (rawExecuteCommand === undefined)
      throw new Error("engine-not-initialized");
    const terminalCommand =
      request.command === "continue" || request.command === "delivery-build";
    const ownsPreparingState =
      request.command === "prepare" &&
      activeWork?.kind === "production" &&
      activeWork.storyId === request.storyId &&
      activeWork.attemptId === null &&
      activeWork.phase === "preparing-production";
    let prepareReachedAwaiting = false;
    try {
      const result = await rawExecuteCommand(request);
      if (request.command === "prepare") {
        const attemptId = attemptIdFromResult(result);
        if (attemptId !== null) {
          activeWork = {
            storyId: request.storyId,
            kind: "production",
            attemptId,
            phase: "awaiting-task-terminals",
          };
          prepareReachedAwaiting = true;
          postActiveWork(request.requestId);
        }
      }
      if (
        request.command === "project-create" ||
        request.command === "asset-import" ||
        request.command === "prepare"
      ) {
        await refreshPreviewCatalog(request.requestId);
      }
      return result;
    } catch (error) {
      if (workspace !== undefined) {
        // Gate-only evidence must never replace the public rsp failure or mask it.
        await recordWorkspaceCommandFailure({
          workspaceRoot: workspace.workspaceRoot,
          command: request.command,
          storyId: "storyId" in request ? request.storyId : null,
          error,
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      if (ownsPreparingState && !prepareReachedAwaiting) {
        activeWork = null;
        postActiveWork(request.requestId);
      }
      if (terminalCommand) {
        activeWork = null;
        postActiveWork(request.requestId);
        await refreshPreviewCatalog(request.requestId);
      }
    }
  };

  const initialize = async (
    message: Extract<MainToEngineMessage, { readonly type: "initialize" }>,
    event: EngineMessageEvent,
  ) => {
    if (workspace !== undefined) throw new Error("engine-already-initialized");
    const sessionMaterial = await receiveSessionMaterial({
      ports: event.ports,
      timeoutMs: dependencies.tokenTimeoutMs,
    });
    const runtimePackRoot = locateEmbeddedRuntimePack(message.appResourcesRoot);
    try {
      runtimePack = await dependencies.verifyRuntimePack({
        runtimePackRoot,
        expectedResourcesRoot: message.appResourcesRoot,
      });
      assertDesktopRuntimeCompatibility({
        compatibility: await dependencies.readCompatibility(
          message.appResourcesRoot,
        ),
        runtimePack,
      });
      runtime = await dependencies.resolveRuntime({ runtimePackRoot });
    } catch {
      await fatal({
        requestId: message.requestId,
        code: "runtime-pack-invalid",
      });
      return;
    }
    workspace = await dependencies.initializeWorkspace({
      workspaceRoot: message.workspaceRoot,
      homeDirectory: dependencies.homeDirectory(),
      integrationResourcesRoot: join(
        message.appResourcesRoot,
        "workspace-integration",
      ),
      rspExecutable: {
        path: join(runtimePackRoot, runtimePack.rspClient.relativePath),
        sha256: runtimePack.rspClient.sha256,
      },
      forbiddenRoots: [
        message.appResourcesRoot,
        message.applicationSupportRoot,
        message.cacheRoot,
      ],
      activeWork: () => workspaceHasActiveProduction(message.workspaceRoot),
    });
    locations = createWorkspaceProductionLocations({
      workspaceRoot: workspace.workspaceRoot,
      applicationSupportRoot: message.applicationSupportRoot,
      runtimeResources: runtimePackRoot,
      cacheRoot: message.cacheRoot,
    });
    const commandRuntime = await dependencies.createCommandRuntime({
      locations,
      runtime,
      workspaceId: workspace.manifest.workspaceId,
      workspaceRoot: workspace.workspaceRoot,
      config: sessionMaterial.config,
      provider: sessionMaterial.provider,
    });
    rawExecuteCommand = commandRuntime.executeCommand;
    shutdownCommandRuntime = commandRuntime.shutdown;
    activeWork = commandRuntime.activeWork;
    deliveryAvailable = commandRuntime.deliveryAvailable;
    deliveryBlocker = commandRuntime.deliveryBlocker;
    provider = sessionMaterial.provider;
    appPid = message.appPid;
    sessionExpiresAt = message.sessionExpiresAt;
    try {
      rspServer = await dependencies.startRspDoctorServer({
        workspaceRoot: workspace.workspaceRoot,
        workspaceId: workspace.manifest.workspaceId,
        appPid,
        enginePid: dependencies.enginePid(),
        expiresAt: sessionExpiresAt,
        token: sessionMaterial.token,
        getDoctorState: doctorState,
        authorizeCommand,
        executeCommand: runCommand,
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

  const buildDelivery = async (
    message: Extract<MainToEngineMessage, { readonly type: "build-delivery" }>,
  ) => {
    if (workspace === undefined) throw new Error("engine-not-initialized");
    await runCommand({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: message.requestId,
      workspaceId: workspace.manifest.workspaceId,
      command: "delivery-build",
      storyId: message.storyId,
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
      if (message.type === "build-delivery") {
        await buildDelivery(message).catch(() => undefined);
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
    snapshotProjects: () => projects,
  };
};

if (process.parentPort !== undefined) {
  const controller = createEngineController({ parentPort: process.parentPort });
  let queue = Promise.resolve();
  process.parentPort.on("message", (event) => {
    const incoming = {
      data: event.data,
      ports: event.ports as unknown as readonly TokenPort[],
    };
    if (
      typeof event.data === "object" &&
      event.data !== null &&
      "type" in event.data &&
      event.data.type === "shutdown"
    ) {
      void controller.handleMessageEvent(incoming);
      return;
    }
    queue = queue.then(() => controller.handleMessageEvent(incoming));
  });
}
