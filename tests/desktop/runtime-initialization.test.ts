import assert from "node:assert/strict";
import test from "node:test";

import {
  initializeDesktopRuntimeResources,
  initializeDesktopWindowResources,
} from "../../desktop/main/initialize-runtime";

test("window policy or load failure destroys the partial BrowserWindow", async () => {
  for (const failure of ["policy", "load"] as const) {
    const calls: string[] = [];
    const window = {
      destroyed: false,
      isDestroyed() {
        return this.destroyed;
      },
      destroy() {
        calls.push("window-destroy");
        this.destroyed = true;
      },
    };
    await assert.rejects(
      initializeDesktopWindowResources({
        window,
        installPolicies: () => {
          calls.push("policy");
          if (failure === "policy") throw new Error("policy-failed");
        },
        load: async () => {
          calls.push("load");
          if (failure === "load") throw new Error("load-failed");
        },
      }),
      new RegExp(`${failure}-failed`, "u"),
    );
    assert.equal(window.destroyed, true);
    assert.equal(calls.at(-1), "window-destroy");
  }
});

const createHarness = ({
  failWindow = false,
  failIpc = false,
  failShutdown = false,
} = {}) => {
  const calls: string[] = [];
  const window = {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      calls.push("window-destroy");
      this.destroyed = true;
    },
  };
  return {
    calls,
    window,
    initialize: () =>
      initializeDesktopRuntimeResources({
        bootstrapController: async () => {
          calls.push("controller-bootstrap");
        },
        shutdownController: async () => {
          calls.push("controller-shutdown");
          if (failShutdown) throw new Error("shutdown-failed");
        },
        createWindow: async () => {
          calls.push("window-create");
          if (failWindow) throw new Error("window-failed");
          return { window };
        },
        registerIpc: () => {
          calls.push("ipc-register");
          if (failIpc) throw new Error("ipc-failed");
          return () => calls.push("ipc-unregister");
        },
        unregisterMedia: () => calls.push("media-unregister"),
      }),
  };
};

test("runtime initialization cleans Engine-owned state when window creation fails", async () => {
  const harness = createHarness({ failWindow: true });
  await assert.rejects(harness.initialize(), /window-failed/u);
  assert.deepEqual(harness.calls, [
    "controller-bootstrap",
    "window-create",
    "controller-shutdown",
    "media-unregister",
  ]);
});

test("runtime initialization destroys a partial window and still cleans after IPC failure", async () => {
  const harness = createHarness({ failIpc: true, failShutdown: true });
  await assert.rejects(harness.initialize(), /ipc-failed/u);
  assert.deepEqual(harness.calls, [
    "controller-bootstrap",
    "window-create",
    "ipc-register",
    "window-destroy",
    "controller-shutdown",
    "media-unregister",
  ]);
});

test("successful runtime disposal is idempotent and leaves shutdown to lifecycle", async () => {
  const harness = createHarness();
  const initialized = await harness.initialize();
  initialized.dispose();
  initialized.dispose();
  assert.deepEqual(harness.calls, [
    "controller-bootstrap",
    "window-create",
    "ipc-register",
    "ipc-unregister",
    "media-unregister",
    "window-destroy",
  ]);
});
