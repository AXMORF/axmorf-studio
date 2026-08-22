import { randomBytes } from "node:crypto";

import {
  PreviewCatalogReadinessSchema,
  PreviewCatalogSchema,
  type PreviewCatalog,
  type PreviewCatalogReadiness,
} from "../contracts/preview";
import {
  RSP_PROTOCOL_VERSION,
  parseEngineToMainMessage,
  type EngineToMainMessage,
  type MainToEngineMessage,
} from "../contracts/protocol";
import type {
  DesktopEnginePort,
  DesktopEngineSnapshot,
} from "./shell-controller";

const ENGINE_RESPONSE_TIMEOUT_MS = 10_000;
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;

type EngineRequestType = MainToEngineMessage["type"];
type EngineResponseType = EngineToMainMessage["type"];

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
  readonly #repositoryRoot: string;
  readonly #modulePath: string;
  readonly #dependencies: DesktopEngineProcessDependencies;
  #child: DesktopUtilityProcess | undefined;
  #pending = new Map<string, PendingRequest>();
  #requestSequence = 0;
  #catalog: PreviewCatalog = PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [],
    unavailable: [],
  });
  #readiness: PreviewCatalogReadiness = PreviewCatalogReadinessSchema.parse({
    state: "not-loaded",
    entryCount: 0,
    unavailableCount: 0,
    failureCode: null,
  });

  constructor({
    repositoryRoot,
    modulePath,
    dependencies,
  }: Readonly<{
    repositoryRoot: string;
    modulePath: string;
    dependencies: DesktopEngineProcessDependencies;
  }>) {
    this.#repositoryRoot = repositoryRoot;
    this.#modulePath = modulePath;
    this.#dependencies = dependencies;
  }

  start = async (workspaceRoot: string): Promise<DesktopEngineSnapshot> => {
    if (this.#child !== undefined) {
      throw new Error("desktop-engine-already-started");
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
      const initialized = this.#waitFor(requestId, [
        "initialized",
        "doctor-state",
      ]);
      child.postMessage(
        {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId,
          type: "initialize",
          workspaceRoot,
          repositoryRoot: this.#repositoryRoot,
          appPid: this.#dependencies.appPid(),
          sessionExpiresAt: expiresAt,
        } satisfies MainToEngineMessage,
        [channel.port1],
      );
      channel.port2.postMessage(Uint8Array.from(this.#dependencies.token()));
      channel.port2.close();
      await initialized;
      return this.refreshPreviewCatalog();
    } catch (error) {
      await this.#terminateChild();
      throw error;
    }
  };

  refreshPreviewCatalog = async (): Promise<DesktopEngineSnapshot> => {
    await this.#send("refresh-preview-catalog", [
      "preview-catalog",
      "doctor-state",
    ]);
    return {
      catalog: this.#catalog,
      previewCatalog: this.#readiness,
      activeWork: false,
    };
  };

  stop = async () => {
    if (this.#child === undefined) return;
    try {
      await this.#send("shutdown", ["stopped"]);
    } catch {
      // Termination below remains the mechanical cleanup authority.
    }
    await this.#terminateChild();
  };

  #send = async (
    type: Exclude<EngineRequestType, "initialize">,
    expected: readonly EngineResponseType[],
  ) => {
    const child = this.#child;
    if (child === undefined) throw new Error("desktop-engine-not-started");
    const requestId = this.#nextRequestId(type);
    const response = this.#waitFor(requestId, expected);
    child.postMessage({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      type,
    } satisfies MainToEngineMessage);
    return response;
  };

  #waitFor = (requestId: string, expected: readonly EngineResponseType[]) =>
    new Promise<readonly EngineToMainMessage[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error("desktop-engine-response-timeout"));
      }, ENGINE_RESPONSE_TIMEOUT_MS);
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
    if (message.type === "doctor-state") {
      this.#readiness = message.doctor.previewCatalog;
    }
    if (message.type === "fatal") {
      this.#rejectPending(new Error(message.code));
      void this.#terminateChild();
      return;
    }
    const pending = this.#pending.get(message.requestId);
    if (pending === undefined || !pending.expected.has(message.type)) return;
    pending.messages.push(message);
    pending.expected.delete(message.type);
    if (pending.expected.size === 0) {
      clearTimeout(pending.timer);
      this.#pending.delete(message.requestId);
      pending.resolve(pending.messages);
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
    this.#rejectPending(new Error("desktop-engine-stopped"));
  };

  #nextRequestId = (type: EngineRequestType) =>
    `main-${type}-${++this.#requestSequence}`;
}

export const createUtilityProcessDesktopEnginePort = ({
  repositoryRoot,
  modulePath,
  utilityProcess,
  MessageChannelMain,
  appPid = () => process.pid,
}: Readonly<{
  repositoryRoot: string;
  modulePath: string;
  utilityProcess: Readonly<{
    fork: (modulePath: string) => DesktopUtilityProcess;
  }>;
  MessageChannelMain: new () => DesktopMessageChannel;
  appPid?: () => number;
}>) =>
  new UtilityProcessDesktopEnginePort({
    repositoryRoot,
    modulePath,
    dependencies: {
      fork: utilityProcess.fork,
      createMessageChannel: () => new MessageChannelMain(),
      now: Date.now,
      token: () => randomBytes(32),
      appPid,
    },
  });
