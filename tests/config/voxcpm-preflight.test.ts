import assert from "node:assert/strict";
import test from "node:test";

import {
  preflightVoxcpm,
  type VoxcpmProbe,
} from "../../settings/server/voxcpm-preflight";
import type { VoxcpmProfileMetadata } from "../../scripts/narration/adapters/private-config";

const metadata: VoxcpmProfileMetadata = {
  kind: "voxcpm",
  baseUrl: "http://100.90.69.117:8810",
  token: "private-test-token",
  timeoutMs: 5_000,
  mode: "high-fidelity-clone",
  denoise: false,
  profileMatched: true,
};

for (const baseUrl of [
  metadata.baseUrl,
  "http://localhost:8810",
  "http://[::1]:8810",
  "https://voice.example.test",
]) {
  test(`VoxCPM diagnostics probe the configured HTTP endpoint (${new URL(baseUrl).hostname})`, async () => {
    const calls: Parameters<VoxcpmProbe>[0][] = [];
    const result = await preflightVoxcpm({
      requirementsFingerprint: "test",
      metadata: { ...metadata, baseUrl },
      probe: async (input) => {
        calls.push(input);
        return input.route === "/health"
          ? { status: 200, body: { status: "ok" } }
          : { status: 200, body: { ready: true } };
      },
    });
    assert.equal(result.status, "pass");
    assert.deepEqual(
      calls.map(({ route }) => route),
      ["/health", "/ready"],
    );
    assert.ok(
      calls.every(
        (call) => call.baseUrl === baseUrl && call.token === metadata.token,
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /private-test-token|8810|example\.test/,
    );
  });
}

test("VoxCPM diagnostics reject invalid endpoints without probing", async () => {
  for (const baseUrl of [
    "file:///tmp/voice",
    "ftp://voice.example.test",
    "invalid",
  ]) {
    const result = await preflightVoxcpm({
      requirementsFingerprint: "test",
      metadata: { ...metadata, baseUrl },
      probe: async () => {
        throw new Error("must not probe");
      },
    });
    assert.equal(result.status, "failed");
    assert.match("summary" in result ? result.summary : "", /HTTP/);
  }
});

test("remote VoxCPM network failures stay redacted and do not retry", async () => {
  let calls = 0;
  const result = await preflightVoxcpm({
    requirementsFingerprint: "test",
    metadata,
    probe: async () => {
      calls += 1;
      throw new Error(`${metadata.baseUrl} ${metadata.token}`);
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-test-token|100\.90/);
});
