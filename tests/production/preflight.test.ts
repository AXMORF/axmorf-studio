import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionStartPreflightSchema,
  buildProductionStartPreflightFailure,
  buildProductionStartPreflightPass,
} from "../../src/contracts";
import { preflightVoxcpm } from "../../scripts/production/adapters/voxcpm-preflight";
import {
  buildProductionBrowserPreflightArgs,
  buildProductionCompositionsArgs,
  preflightRemotionBrowser,
  resolveProductionRemotionCommand,
} from "../../scripts/production/adapters/remotion-process";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("builds bounded transient preflight pass and failure contracts", () => {
  const pass = buildProductionStartPreflightPass({
    requirementsFingerprint: sha("1"),
    voxcpmServiceState: "offloaded-auto-reload-on-first-generation",
  });
  assert.equal(pass.schemaVersion, 2);
  assert.equal(pass.contractVersion, "production-start-preflight-v2");
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

test("uses a Project-independent Remotion probe and classifies sandbox denial", async () => {
  assert.equal(
    resolveProductionRemotionCommand("/repo"),
    "/repo/node_modules/.bin/remotion",
  );
  assert.deepEqual(buildProductionCompositionsArgs(), [
    "compositions",
    "src/index.ts",
  ]);
  assert.deepEqual(buildProductionBrowserPreflightArgs(), [
    "compositions",
    "src/remotion/preflight/index.tsx",
  ]);
  const calls: Array<readonly [string, readonly string[]]> = [];
  const result = await preflightRemotionBrowser({
    rootDir: "/repo",
    requirementsFingerprint: sha("1"),
    runProcess: async (command, args) => {
      calls.push([command, args]);
      return {
        status: 1,
        stdout: "",
        stderr: "sandbox_host_linux.cc: Operation not permitted /data/private",
      };
    },
  });
  assert.deepEqual(calls, [[
    "/repo/node_modules/.bin/remotion",
    ["compositions", "src/remotion/preflight/index.tsx"],
  ]]);
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.code, "REMOTION_BROWSER_SANDBOX_DENIED");
    assert.doesNotMatch(JSON.stringify(result), /sandbox_host|\/data\//);
  }
  assert.equal(calls[0][1].includes("--no-sandbox"), false);
  assert.equal(calls[0][1].includes("--disable-web-security"), false);
});

test("recognizes resident loading and offloaded readiness without generation", async () => {
  for (const ready of [
    { status: 200, body: { ready: true, denoiser_ready: false } },
    { status: 503, body: { detail: { ready: false, status: "loading" } } },
    { status: 503, body: { detail: { ready: false, status: "offloaded" } } },
  ]) {
    const routes: string[] = [];
    const result = await preflightVoxcpm({
      requirementsFingerprint: sha("1"),
      metadata: {
        baseUrl: "http://127.0.0.1:9880",
        token: "private-token",
        timeoutMs: 1000,
        mode: "controllable-clone",
        denoise: false,
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
    assert.equal(routes.some((route) => /tts|generate|warm/iu.test(route)), false);
    assert.equal(result.status, "pass");
    if (result.status === "pass") {
      assert.equal(
        result.serviceState,
        ready.status === 200
          ? "resident-ready"
          : (ready.body as { detail: { status: string } }).detail.status === "loading"
            ? "loading"
            : "offloaded-auto-reload-on-first-generation",
      );
    }
  }
});

test("distinguishes host permission denial from a real VoxCPM outage", async () => {
  const permissionError = Object.assign(new Error("fetch failed"), {
    cause: Object.assign(new Error("Operation not permitted"), { code: "EPERM" }),
  });
  const result = await preflightVoxcpm({
    requirementsFingerprint: sha("1"),
    metadata: {
      baseUrl: "http://127.0.0.1:9880",
      timeoutMs: 1000,
      mode: "controllable-clone",
      denoise: false,
      profileMatched: true,
    },
    probe: async () => {
      throw permissionError;
    },
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.code, "VOXCPM_ENVIRONMENT_PERMISSION_DENIED");
    assert.doesNotMatch(JSON.stringify(result), /EPERM|Operation not permitted/u);
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
      denoise: false,
      profileMatched: true,
    },
    probe: async ({ route }) =>
      route === "/health"
        ? { status: 200, body: { status: "ok" } }
        : {
            status: 500,
            body: {
              detail: {
                ready: false,
                error: "model_load_failed",
                trace: "/data/private/model.py",
                token: "bad",
              },
            },
          },
  });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.code, "VOXCPM_MODEL_LOAD_FAILED");
    assert.doesNotMatch(JSON.stringify(result), /\/data\/|private-token|trace/);
  }
});

test("denoise requires a resident or configured denoiser before generation", async () => {
  for (const ready of [
    { status: 200, body: { ready: true, denoiser_ready: false } },
    { status: 503, body: { detail: { ready: false, status: "offloaded" } } },
  ]) {
    const routes: string[] = [];
    const result = await preflightVoxcpm({
      requirementsFingerprint: sha("1"),
      metadata: {
        baseUrl: "http://127.0.0.1:9880",
        timeoutMs: 1000,
        mode: "high-fidelity-clone",
        denoise: true,
        profileMatched: true,
      },
      probe: async ({ route }) => {
        routes.push(route);
        if (route === "/health") return { status: 200, body: { status: "ok" } };
        if (route === "/ready") return ready;
        return { status: 200, body: { load_denoiser: false } };
      },
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.code, "VOXCPM_DENOISER_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(result), /https?:|\/data\/|token/i);
    }
    assert.equal(routes.some((route) => /tts|clone|generate|warm/iu.test(route)), false);
  }

  const offloaded = await preflightVoxcpm({
    requirementsFingerprint: sha("1"),
    metadata: {
      baseUrl: "http://127.0.0.1:9880",
      timeoutMs: 1000,
      mode: "high-fidelity-clone",
      denoise: true,
      profileMatched: true,
    },
    probe: async ({ route }) => {
      if (route === "/health") return { status: 200, body: { status: "ok" } };
      if (route === "/ready") {
        return { status: 503, body: { detail: { ready: false, status: "offloaded" } } };
      }
      return { status: 200, body: { load_denoiser: true } };
    },
  });
  assert.equal(offloaded.status, "pass");
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
