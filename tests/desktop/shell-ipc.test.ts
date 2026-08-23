import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_SHELL_IPC_CHANNELS } from "../../desktop/contracts/shell";
import { registerDesktopShellIpc } from "../../desktop/main/register-ipc";
import { DesktopShellController } from "../../desktop/main/shell-controller";

const controller = new DesktopShellController({
  defaultWorkspaceRoot: "/tmp/default",
  workspace: {
    loadSelectedRoot: async () => null,
    chooseInitialRoot: async () => null,
    initializeInitialRoot: async (root) => root,
    chooseMigrationTarget: async () => null,
    migrateRoot: async () => {
      throw new Error("not used");
    },
    showInFileManager: async () => undefined,
  },
  providerSettings: {
    get: async () => ({
      schemaVersion: 1,
      status: "not-configured",
      defaultProviderId: null,
      providers: [],
    }),
    save: async () => {
      throw new Error("not used");
    },
  },
  engine: {
    start: async () => {
      throw new Error("not used");
    },
    refreshPreviewCatalog: async () => {
      throw new Error("not used");
    },
    buildDelivery: async () => {
      throw new Error("not used");
    },
    subscribe: () => () => undefined,
    stop: async () => undefined,
  },
  media: {
    selectWorkspace: async () => undefined,
    replaceCatalog: async () => undefined,
    close: async () => undefined,
  },
});

test("IPC validates exact main-frame sender, argument count, and argument type", async () => {
  const handlers = new Map<
    string,
    (
      event: {
        sender: { id: number; mainFrame: unknown };
        senderFrame: { url: string } | null;
      },
      ...args: readonly unknown[]
    ) => unknown
  >();
  const removed: string[] = [];
  const dispose = registerDesktopShellIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => removed.push(channel),
    },
    trustedSenderRules: new Map([
      [41, { shellDocumentUrl: "file:///app/index.html" }],
    ]),
    controller,
  });
  assert.deepEqual(
    [...handlers.keys()],
    Object.values(DESKTOP_SHELL_IPC_CHANNELS),
  );

  const getState = handlers.get(DESKTOP_SHELL_IPC_CHANNELS.getAppState);
  const selectPreview = handlers.get(DESKTOP_SHELL_IPC_CHANNELS.selectPreview);
  const migrateWorkspace = handlers.get(
    DESKTOP_SHELL_IPC_CHANNELS.migrateWorkspace,
  );
  const getProviderSettings = handlers.get(
    DESKTOP_SHELL_IPC_CHANNELS.getProviderSettings,
  );
  const saveProviderSettings = handlers.get(
    DESKTOP_SHELL_IPC_CHANNELS.saveProviderSettings,
  );
  assert.ok(getState !== undefined);
  assert.ok(selectPreview !== undefined);
  assert.ok(migrateWorkspace !== undefined);
  assert.ok(getProviderSettings !== undefined);
  assert.ok(saveProviderSettings !== undefined);
  const shellFrame = { url: "file:///app/index.html" };
  const maliciousFrame = { url: "https://evil.test/" };
  assert.rejects(() =>
    Promise.resolve(
      getState({
        sender: { id: 999, mainFrame: maliciousFrame },
        senderFrame: maliciousFrame,
      }),
    ),
  );
  assert.rejects(() =>
    Promise.resolve(
      saveProviderSettings(
        { sender: { id: 41, mainFrame: shellFrame }, senderFrame: shellFrame },
        { token: "must-not-cross-unvalidated" },
      ),
    ),
  );
  const providerSummary = await getProviderSettings({
    sender: { id: 41, mainFrame: shellFrame },
    senderFrame: shellFrame,
  });
  assert.deepEqual(providerSummary, {
    schemaVersion: 1,
    status: "not-configured",
    defaultProviderId: null,
    providers: [],
  });
  assert.rejects(() =>
    Promise.resolve(
      getState({
        sender: { id: 41, mainFrame: maliciousFrame },
        senderFrame: { url: "file:///app/index.html" },
      }),
    ),
  );
  assert.rejects(() =>
    Promise.resolve(
      getState(
        { sender: { id: 41, mainFrame: shellFrame }, senderFrame: shellFrame },
        "unexpected",
      ),
    ),
  );
  assert.rejects(() =>
    Promise.resolve(
      selectPreview(
        { sender: { id: 41, mainFrame: shellFrame }, senderFrame: shellFrame },
        { storyId: "story-one" },
      ),
    ),
  );
  assert.rejects(() =>
    Promise.resolve(
      migrateWorkspace(
        { sender: { id: 41, mainFrame: shellFrame }, senderFrame: shellFrame },
        "/tmp/renderer-controlled-path",
      ),
    ),
  );
  const state = await getState({
    sender: { id: 41, mainFrame: shellFrame },
    senderFrame: shellFrame,
  });
  assert.equal(
    (state as { status: string }).status,
    "workspace-selection-required",
  );

  dispose();
  dispose();
  assert.deepEqual(
    removed,
    [...Object.values(DESKTOP_SHELL_IPC_CHANNELS)].reverse(),
  );
});

test("IPC registration rolls back only handlers installed before a setup failure", () => {
  const registered: string[] = [];
  const removed: string[] = [];
  assert.throws(
    () =>
      registerDesktopShellIpc({
        ipcMain: {
          handle: (channel) => {
            if (registered.length === 3) throw new Error("ipc-setup-failed");
            registered.push(channel);
          },
          removeHandler: (channel) => removed.push(channel),
        },
        trustedSenderRules: new Map(),
        controller,
      }),
    /ipc-setup-failed/u,
  );
  assert.deepEqual(removed, [...registered].reverse());
  assert.equal(
    removed.includes(DESKTOP_SHELL_IPC_CHANNELS.refreshPreviewCatalog),
    false,
  );
});
