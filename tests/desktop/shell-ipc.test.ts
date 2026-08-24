import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_SHELL_IPC_CHANNELS } from "../../desktop/contracts/shell";
import {
  DesktopSettingsSecureStoreError,
  createDesktopSettingsSnapshot,
} from "../../desktop/application/manage-settings";
import { DesktopSettingsSaveRequestSchema } from "../../desktop/contracts/settings";
import {
  mapDesktopSettingsFailure,
  registerDesktopShellIpc,
} from "../../desktop/main/register-ipc";
import {
  DesktopSettingsEngineRestartError,
  DesktopShellController,
} from "../../desktop/main/shell-controller";

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
  settings: {
    get: async () => createDesktopSettingsSnapshot({ privateConfig: null }),
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
  const getSettings = handlers.get(
    DESKTOP_SHELL_IPC_CHANNELS.getSettings,
  );
  const saveSettings = handlers.get(
    DESKTOP_SHELL_IPC_CHANNELS.saveSettings,
  );
  assert.ok(getState !== undefined);
  assert.ok(selectPreview !== undefined);
  assert.ok(migrateWorkspace !== undefined);
  assert.ok(getSettings !== undefined);
  assert.ok(saveSettings !== undefined);
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
  const invalidSettings = await saveSettings(
    { sender: { id: 41, mainFrame: shellFrame }, senderFrame: shellFrame },
    { token: "must-not-cross-unvalidated" },
  );
  assert.deepEqual(
    (invalidSettings as { ok: boolean; error: { code: string } }).error.code,
    "desktop-settings-validation-failed",
  );
  assert.doesNotMatch(JSON.stringify(invalidSettings), /must-not-cross/u);
  const settings = await getSettings({
    sender: { id: 41, mainFrame: shellFrame },
    senderFrame: shellFrame,
  });
  assert.deepEqual(
    settings,
    createDesktopSettingsSnapshot({ privateConfig: null }),
  );
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

test("Desktop Settings errors distinguish validation, secure storage, and Engine restart", () => {
  const validation = DesktopSettingsSaveRequestSchema.safeParse({
    schemaVersion: 1,
    config: { privateValue: "must-not-echo" },
  });
  assert.equal(validation.success, false);
  if (validation.success) return;
  const validationError = mapDesktopSettingsFailure(validation.error);
  assert.equal(validationError.code, "desktop-settings-validation-failed");
  assert.ok(validationError.issues.length > 0);
  assert.doesNotMatch(JSON.stringify(validationError), /must-not-echo/u);

  const storageError = mapDesktopSettingsFailure(
    new Error("Desktop credential encryption is unavailable: secret-detail"),
  );
  assert.equal(
    storageError.code,
    "desktop-settings-encryption-unavailable",
  );
  assert.doesNotMatch(JSON.stringify(storageError), /secret-detail/u);

  const restartError = mapDesktopSettingsFailure(
    new DesktopSettingsEngineRestartError({
      cause: new Error("provider endpoint private detail"),
    }),
  );
  assert.equal(
    restartError.code,
    "desktop-settings-engine-restart-failed",
  );
  assert.match(restartError.message, /已安全保存/u);
  assert.doesNotMatch(JSON.stringify(restartError), /private detail/u);

  const storeError = mapDesktopSettingsFailure(
    new DesktopSettingsSecureStoreError("read", {
      cause: new Error("private path and credential detail"),
    }),
  );
  assert.equal(storeError.code, "desktop-settings-secure-store-read-failed");
  assert.match(storeError.message, /没有覆盖/u);
  assert.doesNotMatch(
    JSON.stringify(storeError),
    /private path|credential detail/u,
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
