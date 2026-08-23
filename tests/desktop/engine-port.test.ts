import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_NETWORK_POLICY,
  RSP_PROTOCOL_VERSION,
} from "../../desktop/contracts/protocol";
import {
  UtilityProcessDesktopEnginePort,
  desktopEngineForkOptions,
  desktopEngineResponseTimeout,
  type DesktopMessageChannel,
  type DesktopUtilityProcess,
} from "../../desktop/main/engine-port";
import { desktopProducerConfigFixture } from "./producer-config-fixture";

test("Initialize, Delivery, and Catalog requests have separate bounded budgets", () => {
  assert.equal(desktopEngineResponseTimeout("initialize"), 60_000);
  assert.equal(desktopEngineResponseTimeout("shutdown"), 10_000);
  assert.equal(
    desktopEngineResponseTimeout("refresh-preview-catalog"),
    300_000,
  );
  assert.equal(desktopEngineResponseTimeout("build-delivery"), 3_600_000);
});

test("Electron utility Engine starts with an explicit empty environment", () => {
  const previousCredential = process.env.AXMORF_HOST_CREDENTIAL;
  const previousNodeOptions = process.env.NODE_OPTIONS;
  process.env.AXMORF_HOST_CREDENTIAL = "must-not-reach-engine";
  process.env.NODE_OPTIONS = "--inspect=9229";
  const options = desktopEngineForkOptions("/Applications/AXMORF.app/Contents/Resources");
  if (previousCredential === undefined) delete process.env.AXMORF_HOST_CREDENTIAL;
  else process.env.AXMORF_HOST_CREDENTIAL = previousCredential;
  if (previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = previousNodeOptions;

  assert.deepEqual(options, {
    cwd: "/Applications/AXMORF.app/Contents/Resources",
    env: {},
    execArgv: [],
    serviceName: "AXMORF Studio Engine",
    stdio: "ignore",
  });
  assert.equal("PATH" in options.env, false);
  assert.equal("AXMORF_HOST_CREDENTIAL" in options.env, false);
  assert.equal("NODE_OPTIONS" in options.env, false);
});

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";
const runtimePackId = `runtime-pack-${"a".repeat(64)}`;

class FakeUtilityProcess {
  pid: number | undefined = 42;
  readonly messages: unknown[] = [];
  readonly transfers: unknown[][] = [];
  killed = false;
  readonly #listeners = new Map<string, Set<(...args: never[]) => void>>();

  on = (event: string, listener: (...args: never[]) => void) => {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
  };

  off = (event: string, listener: (...args: never[]) => void) => {
    this.#listeners.get(event)?.delete(listener);
  };

  postMessage = (raw: unknown, transfer: readonly unknown[] = []) => {
    this.messages.push(raw);
    this.transfers.push([...transfer]);
    const message = raw as {
      readonly type: string;
      readonly requestId: string;
    };
    queueMicrotask(() => {
      if (message.type === "initialize") {
        this.#emit("message", {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId: message.requestId,
          type: "initialized",
          workspaceId,
          workspaceRoot: "/tmp/workspace",
        });
        this.#emit("message", this.#doctor(message.requestId, "not-loaded"));
      } else if (
        message.type === "refresh-preview-catalog" ||
        message.type === "build-delivery"
      ) {
        this.#emit("message", {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId: message.requestId,
          type: "preview-catalog",
          catalog: {
            schemaVersion: 1,
            contractVersion: "desktop-preview-catalog-v1",
            entries: [],
            unavailable: [],
          },
        });
        this.#emit("message", {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId: message.requestId,
          type: "workspace-projects",
          projects: [],
        });
        this.#emit("message", this.#doctor(message.requestId, "ready"));
      } else {
        this.#emit("message", {
          protocolVersion: RSP_PROTOCOL_VERSION,
          requestId: message.requestId,
          type: "stopped",
        });
      }
    });
  };

  kill = () => {
    this.killed = true;
    this.pid = undefined;
    queueMicrotask(() => this.#emit("exit", 0));
    return true;
  };

  asPort = (): DesktopUtilityProcess =>
    this as unknown as DesktopUtilityProcess;

  #emit = (event: string, ...args: unknown[]) => {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(...(args as never[]));
    }
  };

  #doctor = (requestId: string, state: "not-loaded" | "ready") => ({
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId,
    type: "doctor-state",
    doctor: {
      schemaVersion: 2,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId,
      adapterMode: "workspace",
      runtimePackMode: "embedded",
      previewCatalog: {
        state,
        entryCount: 0,
        unavailableCount: 0,
        failureCode: null,
      },
      network: DESKTOP_NETWORK_POLICY,
      productionAvailable: true,
      deliveryAvailable: false,
      deliveryBlocker: {
        code: "desktop-delivery-runtime-unavailable",
        message: "Embedded Delivery runtime is unavailable.",
      },
      distributionReady: false,
      runtimePackAvailable: true,
      runtimePack: { runtimePackId, architecture: "arm64" },
      provider: "ready",
      activeWork: null,
      process: { appPid: 41, enginePid: 42 },
      session: {
        active: true,
        expiresAt: "2026-08-23T00:00:00.000Z",
      },
    },
  });
}

test("Main injects explicit App roots and starts/stops utility Engine without exposing token", async () => {
  const child = new FakeUtilityProcess();
  const tokenMessages: unknown[] = [];
  let portClosed = false;
  const channel: DesktopMessageChannel = {
    port1: { identity: "transferred-token-port" },
    port2: {
      postMessage: (message) => tokenMessages.push(message),
      close: () => {
        portClosed = true;
      },
    },
  };
  const engine = new UtilityProcessDesktopEnginePort({
    appResourcesRoot: "/tmp/app/Resources",
    applicationSupportRoot: "/tmp/app-support",
    cacheRoot: "/tmp/cache",
    modulePath: "/tmp/app/engine.js",
    dependencies: {
      fork: () => child.asPort(),
      createMessageChannel: () => channel,
      now: () => Date.parse("2026-08-22T00:00:00.000Z"),
      token: () => new Uint8Array(32).fill(7),
      appPid: () => 41,
      loadProducerConfig: async () => ({
        config: desktopProducerConfigFixture,
        provider: "ready",
      }),
    },
  });

  const snapshot = await engine.start("/tmp/workspace");
  assert.equal(snapshot.previewCatalog.state, "ready");
  const initialize = child.messages[0] as Record<string, unknown>;
  assert.equal(initialize.appResourcesRoot, "/tmp/app/Resources");
  assert.equal(initialize.applicationSupportRoot, "/tmp/app-support");
  assert.equal(initialize.cacheRoot, "/tmp/cache");
  assert.equal("repositoryRoot" in initialize, false);
  assert.equal(child.transfers[0]?.[0], channel.port1);
  assert.equal(portClosed, true);
  const sessionMaterial = tokenMessages[0] as Readonly<{
    token: Uint8Array;
    producerConfig: unknown;
    provider: string;
  }>;
  assert.equal(sessionMaterial.token.byteLength, 32);
  assert.deepEqual(
    sessionMaterial.producerConfig,
    desktopProducerConfigFixture,
  );
  assert.equal(sessionMaterial.provider, "ready");
  assert.doesNotMatch(JSON.stringify(child.messages), /07070707|token|Bearer/u);
  assert.doesNotMatch(
    JSON.stringify(child.messages),
    /Xiaoxiao|producerConfig/u,
  );

  await engine.stop();
  assert.equal(child.killed, true);
});
