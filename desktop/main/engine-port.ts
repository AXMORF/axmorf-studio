import { randomBytes } from "node:crypto";

import {
  ProducerConfigSchema,
  StoryIdSchema,
  type ProducerConfig,
} from "../../src/contracts";
import {
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
  type DesktopProjectStatus,
  type PreviewCatalog,
  type PreviewCatalogReadiness,
} from "../contracts/preview";
import {
  RSP_PROTOCOL_VERSION,
  parseEngineToMainMessage,
  type DoctorResponse,
  type EngineToMainMessage,
  type MainToEngineMessage,
} from "../contracts/protocol";
import type {
  DesktopEnginePort,
  DesktopEngineSnapshot,
} from "./shell-controller";

const ENGINE_RESPONSE_TIMEOUT_MS = 10_000;
// Packaged initialization checksum-verifies the complete embedded Runtime Pack
// before it can advertise capabilities, so it has a separate cold-start budget.
const ENGINE_INITIALIZE_RESPONSE_TIMEOUT_MS = 60_000;
const PREVIEW_CATALOG_RESPONSE_TIMEOUT_MS = 5 * 60_000;
const DELIVERY_BUILD_RESPONSE_TIMEOUT_MS = 60 * 60_000;
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;

type EngineRequestType = MainToEngineMessage["type"];
type EngineResponseType = EngineToMainMessage["type"];

export const desktopEngineResponseTimeout = (type: EngineRequestType) =>
  type === "initialize"
    ? ENGINE_INITIALIZE_RESPONSE_TIMEOUT_MS
    : type === "refresh-preview-catalog"
      ? PREVIEW_CATALOG_RESPONSE_TIMEOUT_MS
      : type === "build-delivery"
        ? DELIVERY_BUILD_RESPONSE_TIMEOUT_MS
        : ENGINE_RESPONSE_TIMEOUT_MS;

export type DesktopUtilityProcess = Readonly<{
  pid: number | undefined;
  on: {
    (event: "spawn", listener: () => void): unknown;
    (event: "message", listener: (message: unknown) => void): unknown;
    (event: "exit", listener: (code: number) => void): unknown;
  };
  off: {
    (event: "spawn", listener: () => void): unknown;
    (event: "exit", listener: (code: number) => void): unknown;
  };
  postMessage: (message: unknown, transfer?: readonly unknown[]) => void;
  kill: () => boolean;
}>;

export type DesktopMessageChannel = Readonly<{
  port1: unknown;
  port2: Readonly<{
    postMessage: (message: unknown) => void;
    close: () => void;
  }>;
}>;

export type DesktopEngineProcessDependencies = Readonly<{
  fork: (modulePath: string) => DesktopUtilityProcess;
  createMessageChannel: () => DesktopMessageChannel;
  now: () => number;
  token: () => Uint8Array;
  appPid: () => number;
  loadProducerConfig: () => Promise<DesktopProducerConfigSession>;
}>;

export type DesktopProducerConfigSession = Readonly<{
  config: ProducerConfig | null;
  provider: "ready" | "not-configured" | "unavailable";
}>;

type PendingRequest = {
  readonly expected: Set<EngineResponseType>;
  readonly messages: EngineToMainMessage[];
  readonly resolve: (messages: readonly EngineToMainMessage[]) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
};

const waitForSpawn = (child: DesktopUtilityProcess) => {
  if (child.pid !== undefined) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("spawn", onSpawn);
      reject(new Error("desktop-engine-spawn-timeout"));
    }, ENGINE_RESPONSE_TIMEOUT_MS);
    const onSpawn = () => {
      clearTimeout(timer);
      child.off("spawn", onSpawn);
      resolve();
    };
    child.on("spawn", onSpawn);
  });
};

export class UtilityProcessDesktopEnginePort implements DesktopEnginePort {
  readonly #appResourcesRoot: string;
  readonly #applicationSupportRoot: string;
  readonly #cacheRoot: string;
  readonly #modulePath: string;
  readonly #dependencies: DesktopEngineProcessDependencies;
  readonly #listeners = new Set<(snapshot: DesktopEngineSnapshot) => void>();
  #child: DesktopUtilityProcess | undefined;
  #pending = new Map<string, PendingRequest>();
  #requestSequence = 0;
  #catalog: PreviewCatalog = PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [],
    unavailable: [],
  });
  #projects: readonly DesktopProjectStatus[] = [];
  #readiness: PreviewCatalogReadiness = PreviewCatalogReadinessSchema.parse({
    state: "not-loaded",
    entryCount: 0,
    unavailableCount: 0,
    failureCode: null,
  });
  #doctor: DoctorResponse | undefined;

  constructor({
    appResourcesRoot,
    applicationSupportRoot,
    cacheRoot,
    modulePath,
    dependencies,
  }: Readonly<{
    appResourcesRoot: string;
    applicationSupportRoot: string;
    cacheRoot: string;
    modulePath: string;
    dependencies: DesktopEngineProcessDependencies;
  }>) {
    this.#appResourcesRoot = appResourcesRoot;
    this.#applicationSupportRoot = applicationSupportRoot;
    this.#cacheRoot = cacheRoot;
    this.#modulePath = modulePath;
    this.#dependencies = dependencies;
  }

  start = async (workspaceRoot: string): Promise<DesktopEngineSnapshot> => {
    if (this.#child !== undefined) {
      throw new Error("desktop-engine-already-started");
    }
    const loaded = await this.#dependencies.loadProducerConfig();
    const producerConfig =
      loaded.config === null ? null : ProducerConfigSchema.parse(loaded.config);
    if ((loaded.provider === "ready") !== (producerConfig !== null)) {
      throw new Error("desktop-producer-config-state-invalid");
    }
    const child = this.#dependencies.fork(this.#modulePath);
    this.#child = child;
    child.on("message", this.#handleMessage);
    child.on("exit", this.#handleExit);
    try {
      await waitForSpawn(child);
      const enginePid = child.pid;
      if (enginePid === undefined || enginePid <= 0) {
        throw new Error("desktop-engine-pid-unavailable");
      }
      const channel = this.#dependencies.createMessageChannel();
      const expiresAt = new Date(
        this.#dependencies.now() + SESSION_LIFETIME_MS,
      ).toISOString();
      const requestId = this.#nextRequestId("initialize");
      const initialized = this.#waitFor(
        requestId,
        ["initialized", "doctor-state"],
        desktopEngineResponseTimeout("initialize"),
      );
      child.postMessage(
        {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId,
          type: "initialize",
          workspaceRoot,
          appResourcesRoot: this.#appResourcesRoot,
          applicationSupportRoot: this.#applicationSupportRoot,
          cacheRoot: this.#cacheRoot,
          appPid: this.#dependencies.appPid(),
          sessionExpiresAt: expiresAt,
        } satisfies MainToEngineMessage,
        [channel.port1],
      );
      channel.port2.postMessage({
        token: Uint8Array.from(this.#dependencies.token()),
        producerConfig,
        provider: loaded.provider,
      });
      channel.port2.close();
      await initialized;
      return this.refreshPreviewCatalog();
    } catch (error) {
      await this.#terminateChild();
      throw error;
    }
  };

  refreshPreviewCatalog = async (): Promise<DesktopEngineSnapshot> => {
    await this.#send({ type: "refresh-preview-catalog" }, [
      "preview-catalog",
      "workspace-projects",
      "doctor-state",
    ]);
    return this.#snapshot();
  };

  buildDelivery = async (
    rawStoryId: string,
  ): Promise<DesktopEngineSnapshot> => {
    const storyId = StoryIdSchema.parse(rawStoryId);
    await this.#send({ type: "build-delivery", storyId }, [
      "preview-catalog",
      "workspace-projects",
      "doctor-state",
    ]);
    const snapshot = this.#snapshot();
    if (
      snapshot.projects.find((project) => project.storyId === storyId)
        ?.delivery !== "current"
    ) {
      throw new Error("desktop-delivery-build-failed");
    }
    return snapshot;
  };

  subscribe = (listener: (snapshot: DesktopEngineSnapshot) => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  stop = async () => {
    if (this.#child === undefined) return;
    try {
      await this.#send({ type: "shutdown" }, ["stopped"]);
    } catch {
      // Termination below remains the mechanical cleanup authority.
    }
    await this.#terminateChild();
  };

  #snapshot = (): DesktopEngineSnapshot => {
    const doctor = this.#doctor;
    if (doctor === undefined) throw new Error("desktop-engine-doctor-missing");
    return {
      catalog: this.#catalog,
      previewCatalog: this.#readiness,
      projects: this.#projects,
      activeWork: doctor.activeWork,
      runtimePack: doctor.runtimePack,
      agentIntegration: "ready",
      provider: doctor.provider,
      deliveryAvailable: doctor.deliveryAvailable,
      deliveryBlocker: doctor.deliveryBlocker,
    };
  };

  #emitSnapshot = () => {
    if (this.#doctor === undefined) return;
    const snapshot = this.#snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  };

  #send = async (
    request:
      | Readonly<{ type: "refresh-preview-catalog" }>
      | Readonly<{
          type: "build-delivery";
          storyId: ReturnType<typeof StoryIdSchema.parse>;
        }>
      | Readonly<{ type: "shutdown" }>,
    expected: readonly EngineResponseType[],
  ) => {
    const child = this.#child;
    if (child === undefined) throw new Error("desktop-engine-not-started");
    const requestId = this.#nextRequestId(request.type);
    const response = this.#waitFor(
      requestId,
      expected,
      desktopEngineResponseTimeout(request.type),
    );
    child.postMessage({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      ...request,
    } satisfies MainToEngineMessage);
    return response;
  };

  #waitFor = (
    requestId: string,
    expected: readonly EngineResponseType[],
    timeoutMs: number,
  ) =>
    new Promise<readonly EngineToMainMessage[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error("desktop-engine-response-timeout"));
      }, timeoutMs);
      this.#pending.set(requestId, {
        expected: new Set(expected),
        messages: [],
        resolve,
        reject,
        timer,
      });
    });

  #handleMessage = (rawMessage: unknown) => {
    let message: EngineToMainMessage;
    try {
      message = parseEngineToMainMessage(rawMessage);
    } catch {
      this.#rejectPending(new Error("desktop-engine-response-invalid"));
      void this.#terminateChild();
      return;
    }
    if (message.type === "preview-catalog") this.#catalog = message.catalog;
    if (message.type === "workspace-projects")
      this.#projects = message.projects;
    if (message.type === "doctor-state") {
      this.#doctor = message.doctor;
      this.#readiness = message.doctor.previewCatalog;
    }
    if (message.type === "active-work-state" && this.#doctor !== undefined) {
      this.#doctor = { ...this.#doctor, activeWork: message.activeWork };
      this.#emitSnapshot();
    }
    if (message.type === "fatal") {
      this.#rejectPending(new Error(message.code));
      void this.#terminateChild();
      return;
    }
    const pending = this.#pending.get(message.requestId);
    if (pending === undefined) {
      if (message.type === "doctor-state") this.#emitSnapshot();
      return;
    }
    if (!pending.expected.has(message.type)) return;
    pending.messages.push(message);
    pending.expected.delete(message.type);
    if (pending.expected.size === 0) {
      clearTimeout(pending.timer);
      this.#pending.delete(message.requestId);
      pending.resolve(pending.messages);
      this.#emitSnapshot();
    }
  };

  #handleExit = () => {
    this.#child = undefined;
    this.#rejectPending(new Error("desktop-engine-exited"));
  };

  #rejectPending = (error: Error) => {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  };

  #terminateChild = async () => {
    const child = this.#child;
    if (child === undefined) return;
    const exited = new Promise<void>((resolve) => {
      const onExit = () => {
        child.off("exit", onExit);
        resolve();
      };
      child.on("exit", onExit);
    });
    child.kill();
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      exited,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, ENGINE_RESPONSE_TIMEOUT_MS);
      }),
    ]);
    if (timeout !== undefined) clearTimeout(timeout);
    this.#child = undefined;
    this.#doctor = undefined;
    this.#rejectPending(new Error("desktop-engine-stopped"));
  };

  #nextRequestId = (type: EngineRequestType) =>
    `main-${type}-${++this.#requestSequence}`;
}

export const createUtilityProcessDesktopEnginePort = ({
  appResourcesRoot,
  applicationSupportRoot,
  cacheRoot,
  modulePath,
  loadProducerConfig,
  utilityProcess,
  MessageChannelMain,
  appPid = () => process.pid,
}: Readonly<{
  appResourcesRoot: string;
  applicationSupportRoot: string;
  cacheRoot: string;
  modulePath: string;
  loadProducerConfig: () => Promise<DesktopProducerConfigSession>;
  utilityProcess: Readonly<{
    fork: (modulePath: string) => DesktopUtilityProcess;
  }>;
  MessageChannelMain: new () => DesktopMessageChannel;
  appPid?: () => number;
}>) =>
  new UtilityProcessDesktopEnginePort({
    appResourcesRoot,
    applicationSupportRoot,
    cacheRoot,
    modulePath,
    dependencies: {
      fork: utilityProcess.fork,
      createMessageChannel: () => new MessageChannelMain(),
      now: Date.now,
      token: () => randomBytes(32),
      appPid,
      loadProducerConfig,
    },
  });

export const desktopEngineForkOptions = (
  resourcesPath: string,
): Readonly<{
  cwd: string;
  env: Record<string, string>;
  execArgv: string[];
  serviceName: string;
  stdio: "ignore";
}> =>
  ({
    cwd: resourcesPath,
    env: {},
    execArgv: [],
    serviceName: "AXMORF Studio Engine",
    stdio: "ignore",
  });
