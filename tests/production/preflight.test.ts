import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionStartPreflightSchema,
  buildProductionStartPreflightFailure,
  buildProductionStartPreflightPass,
} from "../../src/contracts";
import { preflightVoxcpm } from "../../scripts/production/adapters/voxcpm-preflight";

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

test("accepts liveness plus resident or cold readiness without TTS", async () => {
  for (const ready of [
    { status: 200, body: { ready: true } },
    { status: 503, body: { detail: { ready: false, status: "loading" } } },
  ]) {
    const routes: string[] = [];
    const result = await preflightVoxcpm({
      requirementsFingerprint: sha("1"),
      metadata: {
        baseUrl: "http://127.0.0.1:9880",
        token: "private-token",
        timeoutMs: 1000,
        mode: "controllable-clone",
        profileMatched: true,
      },
      probe: async ({ route }) => {
        routes.push(route);
        return route === "/health"
          ? { status: 200, body: { status: "ok" } }
          : ready;
      },
    });
    assert.deepEqual(routes, ["/health", "/ready"]);
    assert.equal(result.status, "pass");
  }
});

test("classifies readiness 500 without exposing response body", async () => {
  const result = await preflightVoxcpm({
    requirementsFingerprint: sha("1"),
    metadata: {
      baseUrl: "http://127.0.0.1:9880",
      token: "private-token",
      timeoutMs: 1000,
      mode: "controllable-clone",
      profileMatched: true,
    },
    probe: async ({ route }) =>
      route === "/health"
        ? { status: 200, body: { status: "ok" } }
        : { status: 500, body: { trace: "/data/private/model.py", token: "bad" } },
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.code, "VOXCPM_MODEL_LOAD_FAILED");
    assert.doesNotMatch(JSON.stringify(result), /\/data\/|private-token|trace/);
  }
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
