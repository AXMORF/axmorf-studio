import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionStartPreflightSchema,
  buildProductionStartPreflightFailure,
  buildProductionStartPreflightPass,
} from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("builds bounded transient preflight pass and failure contracts", () => {
  const pass = buildProductionStartPreflightPass({
    requirementsFingerprint: sha("1"),
    voxcpmServiceState: "cold-auto-load-on-first-tts",
  });
  assert.equal(ProductionStartPreflightSchema.parse(pass).status, "pass");

  const failure = buildProductionStartPreflightFailure({
    domain: "voxcpm",
    kind: "external-blocker",
    code: "VOXCPM_MODEL_LOAD_FAILED",
    summary: "The speech model reported a load failure.",
    remediation: "Restore the local speech service before starting production.",
    requirementsFingerprint: sha("1"),
  });
  assert.equal(ProductionStartPreflightSchema.parse(failure).status, "failed");
  assert.doesNotMatch(JSON.stringify(failure), /https?:|\/home\/|\/data\/|token/i);
});

test("rejects private diagnostics from preflight contracts", () => {
  assert.throws(() =>
    buildProductionStartPreflightFailure({
      domain: "voxcpm",
      kind: "external-blocker",
      code: "VOXCPM_SERVICE_UNREACHABLE",
      summary: "Failed at http://127.0.0.1:9999 with token secret.",
      remediation: "Inspect /data/private/config.json.",
      requirementsFingerprint: sha("1"),
    }),
  );
});
