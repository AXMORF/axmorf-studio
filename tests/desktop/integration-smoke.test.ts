import assert from "node:assert/strict";
import test from "node:test";

import { runDesktopIntegrationSmoke } from "../../scripts/desktop/integration-smoke";

test("Workspace Agent discovers the managed Skill and calls self-contained rsp-local-v2 doctor", async () => {
  const result = await runDesktopIntegrationSmoke();
  assert.equal(result.evidenceClass, "host-functional-fixture");
  assert.equal(result.nativeProductionEvidence, false);
  assert.equal(result.workspaceInitialized, true);
  assert.equal(result.managedDiscovery, "codex-compatible");
  assert.equal(result.rspPackaging, "self-contained-sea");
  assert.equal(result.rspExitCode, 0);
  assert.equal(result.doctor.previewCatalog.state, "not-loaded");
  assert.equal(
    result.doctor.network.controlPlane,
    "authenticated-unix-domain-socket-only",
  );
  assert.equal(result.doctor.network.persistentTcpListeners, false);
  assert.equal(result.doctor.network.deliveryBuildListener.host, "127.0.0.1");
  assert.equal(result.doctor.adapterMode, "workspace");
  assert.equal(result.doctor.runtimePackMode, "embedded");
  assert.equal(result.doctor.productionAvailable, true);
  assert.equal(result.doctor.deliveryAvailable, true);
  assert.equal(result.doctor.deliveryBlocker, null);
  assert.equal(result.doctor.distributionReady, false);
  assert.ok(
    result.hermes.code === "hermes-cli-unavailable" ||
      result.hermes.code === "hermes-cli-invocation-failed" ||
      result.hermes.code === "hermes-cli-invoked-workspace-proof-pending",
  );
  assert.equal(result.sessionCleaned, true);
});
