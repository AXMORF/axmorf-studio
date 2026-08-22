import assert from "node:assert/strict";
import test from "node:test";

import { RSP_PROTOCOL_VERSION } from "../../desktop/contracts/protocol";
import {
  UtilityProcessDesktopEnginePort,
  desktopEngineResponseTimeout,
  type DesktopMessageChannel,
  type DesktopUtilityProcess,
} from "../../desktop/main/engine-port";

test("Preview Catalog validation has a separate bounded response budget", () => {
  assert.equal(desktopEngineResponseTimeout("initialize"), 10_000);
  assert.equal(desktopEngineResponseTimeout("shutdown"), 10_000);
  assert.equal(desktopEngineResponseTimeout("refresh-preview-catalog"), 300_000);
});

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";

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
      } else if (message.type === "refresh-preview-catalog") {
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
      schemaVersion: 1,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId,
      adapterMode: "repository",
      repositoryMode: "build-time-checkout",
      runtimePackMode: "host-node-prototype",
      previewCatalog: {
        state,
        entryCount: 0,
        unavailableCount: 0,
        failureCode: null,
      },
      desktopTcpListeners: false,
      productionAvailable: false,
      deliveryAvailable: false,
      distributionReady: false,
      runtimePackAvailable: false,
      activeWork: false,
      process: { appPid: 41, enginePid: 42 },
      session: {
        active: true,
        expiresAt: "2026-08-23T00:00:00.000Z",
      },
    },
  });
}

test("Main starts, refreshes, and stops the utility Engine without putting token in messages", async () => {
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
    repositoryRoot: "/tmp/repository",
    modulePath: "/tmp/app/engine.js",
    dependencies: {
      fork: (modulePath) => {
        assert.equal(modulePath, "/tmp/app/engine.js");
        return child.asPort();
      },
      createMessageChannel: () => channel,
      now: () => Date.parse("2026-08-22T00:00:00.000Z"),
      token: () => new Uint8Array(32).fill(7),
      appPid: () => 41,
    },
  });

  const snapshot = await engine.start("/tmp/workspace");
  assert.equal(snapshot.previewCatalog.state, "ready");
  assert.equal(snapshot.catalog.entries.length, 0);
  assert.equal(child.transfers[0]?.[0], channel.port1);
  assert.equal(portClosed, true);
  assert.equal((tokenMessages[0] as Uint8Array).byteLength, 32);
  assert.doesNotMatch(JSON.stringify(child.messages), /07070707|token|Bearer/u);

  await engine.stop();
  assert.equal(child.killed, true);
  assert.deepEqual(
    child.messages.map((message) => (message as { type: string }).type),
    ["initialize", "refresh-preview-catalog", "shutdown"],
  );
});
