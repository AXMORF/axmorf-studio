import assert from "node:assert/strict";
import test from "node:test";

import { runDesktopIntegrationSmoke } from "../../scripts/desktop/integration-smoke";

test("simulated Workspace Agent discovers the managed Skill and calls real rsp doctor", async () => {
  const result = await runDesktopIntegrationSmoke();
  assert.equal(result.workspaceInitialized, true);
  assert.equal(result.discoveryFilesReadable, true);
  assert.equal(result.rspExitCode, 0);
  assert.equal(result.doctor.previewCatalog.state, "not-loaded");
  assert.equal(result.doctor.desktopTcpListeners, false);
  assert.equal(result.sessionCleaned, true);
});
