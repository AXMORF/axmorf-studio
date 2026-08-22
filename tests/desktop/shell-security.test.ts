import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { TRUSTED_SHELL_WEB_PREFERENCES } from "../../desktop/contracts/security-policy";
import {
  DESKTOP_PRELOAD_METHODS,
  DESKTOP_SHELL_IPC_CHANNELS,
} from "../../desktop/contracts/shell";

test("trusted preload exposes exactly the six frozen preview methods", async () => {
  assert.deepEqual(DESKTOP_PRELOAD_METHODS, [
    "getAppState",
    "chooseInitialWorkspace",
    "showWorkspaceInFinder",
    "refreshPreviewCatalog",
    "selectPreview",
    "retryEngine",
  ]);
  const preload = await readFile(
    join(process.cwd(), "desktop/preload/shell.ts"),
    "utf8",
  );
  for (const channel of Object.values(DESKTOP_SHELL_IPC_CHANNELS)) {
    assert.doesNotMatch(preload, new RegExp(JSON.stringify(channel), "u"));
  }
  assert.match(preload, /DESKTOP_SHELL_IPC_CHANNELS/u);
  assert.doesNotMatch(
    preload,
    /sendSync|ipcRenderer\.send\(|ipcRenderer\.on\(/u,
  );
});

test("bundled shell is sandboxed and no WebContentsView or remote service remains", async () => {
  assert.deepEqual(TRUSTED_SHELL_WEB_PREFERENCES, {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  });

  const sources = await Promise.all(
    ["create-window.ts", "navigation-policy.ts"].map((file) =>
      readFile(join(process.cwd(), "desktop/main", file), "utf8"),
    ),
  );
  const source = sources.join("\n");
  assert.match(source, /new BrowserWindow\(/u);
  assert.doesNotMatch(
    source,
    /WebContentsView|127\.0\.0\.1|localhost|3100|3101/u,
  );
  assert.doesNotMatch(source, /nodeIntegration:\s*true|webSecurity:\s*false/u);
});
