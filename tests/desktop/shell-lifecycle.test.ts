import assert from "node:assert/strict";
import test from "node:test";

import { startDesktopLifecycle } from "../../desktop/main/lifecycle";
import { DesktopShellController } from "../../desktop/main/shell-controller";

const createController = (events: string[]) =>
  new DesktopShellController({
    defaultWorkspaceRoot: "/tmp/default",
    workspace: {
      loadSelectedRoot: async () => "/tmp/workspace",
      chooseInitialRoot: async () => null,
      initializeInitialRoot: async (root) => root,
      showInFileManager: async () => undefined,
    },
    engine: {
      start: async () => {
        events.push("engine-start");
        return {
          catalog: {
            schemaVersion: 1,
            contractVersion: "desktop-preview-catalog-v1",
            entries: [],
            unavailable: [],
          },
          previewCatalog: {
            state: "ready",
            entryCount: 0,
            unavailableCount: 0,
            failureCode: null,
          },
          activeWork: false,
        } as const;
      },
      refreshPreviewCatalog: async () => {
        throw new Error("not used");
      },
      stop: async () => {
        events.push("engine-stop");
      },
    },
    media: {
      replaceCatalog: async () => undefined,
      close: async () => {
        events.push("media-close");
      },
    },
  });

test("Main creates Engine and views only after app ready", async () => {
  const events: string[] = [];
  const listeners = new Map<string, (...args: never[]) => void>();
  let releaseReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve;
  });
  const windowListeners = new Map<
    string,
    (event: { preventDefault: () => void }) => void
  >();
  const app = {
    requestSingleInstanceLock: () => true,
    whenReady: async () => {
      events.push("waiting-ready");
      await ready;
      events.push("ready");
    },
    quit: () => events.push("app-quit"),
    on: (event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
    },
  };
  const start = startDesktopLifecycle({
    app,
    createRuntime: async () => {
      events.push("create-runtime");
      return {
        window: {
          isDestroyed: () => false,
          isVisible: () => true,
          show: () => events.push("window-show"),
          focus: () => events.push("window-focus"),
          hide: () => events.push("window-hide"),
          on: (
            event: "close",
            listener: (event: { preventDefault: () => void }) => void,
          ) => {
            windowListeners.set(event, listener);
          },
        },
        controller: createController(events),
        confirmQuit: async () => true,
        dispose: () => events.push("dispose"),
      };
    },
  });
  await Promise.resolve();
  assert.deepEqual(events, ["waiting-ready"]);
  const markReady = releaseReady as unknown as () => void;
  markReady();
  await start;
  assert.deepEqual(events.slice(0, 4), [
    "waiting-ready",
    "ready",
    "create-runtime",
    "engine-start",
  ]);
  assert.equal(windowListeners.has("close"), true);
});

test("second instance only focuses the existing window", async () => {
  const events: string[] = [];
  const listeners = new Map<string, () => void>();
  await startDesktopLifecycle({
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: async () => undefined,
      quit: () => events.push("quit"),
      on: (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    } as unknown as Parameters<typeof startDesktopLifecycle>[0]["app"],
    createRuntime: async () => ({
      window: {
        isDestroyed: () => false,
        isVisible: () => false,
        show: () => events.push("show"),
        focus: () => events.push("focus"),
        hide: () => events.push("hide"),
        on: () => undefined,
      },
      controller: createController(events),
      confirmQuit: async () => true,
      dispose: () => events.push("dispose"),
    }),
  });
  listeners.get("second-instance")?.();
  assert.deepEqual(events.slice(-2), ["show", "focus"]);
});

test("window close stops Engine before disposing and quitting", async () => {
  const events: string[] = [];
  let closeListener: ((event: { preventDefault: () => void }) => void) | null =
    null;
  await startDesktopLifecycle({
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: async () => undefined,
      quit: () => events.push("app-quit"),
      on: () => undefined,
    },
    createRuntime: async () => ({
      window: {
        isDestroyed: () => false,
        isVisible: () => true,
        show: () => undefined,
        focus: () => undefined,
        hide: () => undefined,
        on: (_event, listener) => {
          closeListener = listener;
        },
      },
      controller: createController(events),
      confirmQuit: async () => true,
      dispose: () => events.push("dispose"),
    }),
  });
  let prevented = false;
  const close = closeListener as unknown as (event: {
    preventDefault: () => void;
  }) => void;
  close({
    preventDefault: () => {
      prevented = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.deepEqual(events.slice(-4), [
    "engine-stop",
    "media-close",
    "dispose",
    "app-quit",
  ]);
});

test("failed single-instance lock quits without creating runtime", async () => {
  let created = false;
  let quit = false;
  const result = await startDesktopLifecycle({
    app: {
      requestSingleInstanceLock: () => false,
      whenReady: async () => undefined,
      quit: () => {
        quit = true;
      },
      on: () => undefined,
    },
    createRuntime: async () => {
      created = true;
      throw new Error("must not run");
    },
  });
  assert.equal(result, null);
  assert.equal(quit, true);
  assert.equal(created, false);
});
