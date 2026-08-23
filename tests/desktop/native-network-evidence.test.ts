import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNativeIdleNetworkEvidence,
  assertNativeNetworkEvidence,
  parseLsofListenerOutput,
  type NativeNetworkEvidenceSample,
} from "../../scripts/desktop/native-network-evidence";

const processIdentity = {
  pid: 42,
  parentPid: 41,
  command: "AXMORF Studio Engine",
  startedAt: "Sat Aug 23 12:00:00 2026",
};

const sample = (
  phase: NativeNetworkEvidenceSample["phase"],
  listeners: NativeNetworkEvidenceSample["listeners"] = [],
  capturedAt = "2026-08-23T04:00:00.000Z",
): NativeNetworkEvidenceSample => ({
  capturedAt,
  phase,
  processes: [processIdentity],
  listeners,
});

test("lsof listener parser retains the owning pid and exact bound address", () => {
  assert.deepEqual(
    parseLsofListenerOutput(
      [
        "p42",
        "cAXMORF Studio Engine",
        "f19",
        "n127.0.0.1:53123",
        "TST=LISTEN",
        "",
      ].join("\n"),
    ),
    [{ pid: 42, host: "127.0.0.1", port: 53123 }],
  );
});

test("native network evidence permits one build-scoped loopback endpoint", () => {
  const result = assertNativeNetworkEvidence({
    samples: [
      sample("idle-before"),
      sample("manual-delivery", [], "2026-08-23T04:00:01.000Z"),
      sample(
        "manual-delivery",
        [{ pid: 42, host: "127.0.0.1", port: 53123 }],
        "2026-08-23T04:00:02.000Z",
      ),
      sample(
        "manual-delivery",
        [{ pid: 42, host: "127.0.0.1", port: 53124 }],
        "2026-08-23T04:00:03.000Z",
      ),
      sample("idle-after-manual", [], "2026-08-23T04:00:04.000Z"),
      sample(
        "automatic-delivery",
        [{ pid: 42, host: "127.0.0.1", port: 54123 }],
        "2026-08-23T04:00:05.000Z",
      ),
      sample("idle-after-automatic", [], "2026-08-23T04:00:06.000Z"),
    ],
    requiredActivePhases: ["manual-delivery", "automatic-delivery"],
    ephemeralPortRange: { first: 49_152, last: 65_535 },
    expectedListenerEndpoints: [
      { host: "127.0.0.1", port: 53123 },
      { host: "127.0.0.1", port: 53124 },
      { host: "127.0.0.1", port: 54123 },
    ],
  });
  assert.deepEqual(result.listenerPorts, [53123, 53124, 54123]);
  assert.equal(result.persistentTcpListeners, false);
  assert.equal(result.expectedListenerCount, 3);
});

test("native network evidence permits simultaneous ephemeral runtime listeners only during Delivery", () => {
  const result = assertNativeNetworkEvidence({
    samples: [
      sample("idle-before"),
      sample(
        "manual-delivery",
        [
          { pid: 42, host: "127.0.0.1", port: 53_123 },
          { pid: 42, host: "127.0.0.1", port: 53_124 },
        ],
        "2026-08-23T04:00:01.000Z",
      ),
      sample("idle-after-manual", [], "2026-08-23T04:00:02.000Z"),
    ],
    requiredActivePhases: ["manual-delivery"],
    ephemeralPortRange: { first: 49_152, last: 65_535 },
    expectedListenerEndpoints: [
      { host: "127.0.0.1", port: 53_123 },
    ],
  });
  assert.deepEqual(result.listenerPorts, [53_123, 53_124]);
  assert.equal(result.expectedListenerCount, 1);
});

test("native network evidence rejects public, IPv6, fixed-range and out-of-scope listeners", () => {
  for (const listener of [
    { pid: 42, host: "0.0.0.0", port: 53123 },
    { pid: 42, host: "*", port: 53123 },
    { pid: 42, host: "::", port: 53123 },
    { pid: 42, host: "::1", port: 53123 },
    { pid: 42, host: "127.0.0.1", port: 3000 },
    { pid: 99, host: "127.0.0.1", port: 53123 },
  ]) {
    assert.throws(
      () =>
        assertNativeNetworkEvidence({
          samples: [sample("idle-before"), sample("manual-delivery", [listener])],
          requiredActivePhases: ["manual-delivery"],
          ephemeralPortRange: { first: 49_152, last: 65_535 },
        }),
      /native-network-evidence/u,
    );
  }
  assert.throws(
    () =>
      assertNativeNetworkEvidence({
        samples: [
          sample("idle-before", [
            { pid: 42, host: "127.0.0.1", port: 53123 },
          ]),
          sample("manual-delivery"),
        ],
        requiredActivePhases: ["manual-delivery"],
        ephemeralPortRange: { first: 49_152, last: 65_535 },
      }),
    /native-network-evidence/u,
  );
});

test("native network evidence requires an observed listener and terminal cleanup", () => {
  assert.throws(
    () =>
      assertNativeNetworkEvidence({
        samples: [sample("idle-before"), sample("manual-delivery")],
        requiredActivePhases: ["manual-delivery"],
        ephemeralPortRange: { first: 49_152, last: 65_535 },
      }),
    /native-network-evidence-active-listener-missing/u,
  );
  assert.throws(
    () =>
      assertNativeNetworkEvidence({
        samples: [
          sample("manual-delivery", [
            { pid: 42, host: "127.0.0.1", port: 53123 },
          ]),
        ],
        requiredActivePhases: ["manual-delivery"],
        ephemeralPortRange: { first: 49_152, last: 65_535 },
      }),
    /native-network-evidence-terminal-idle-missing/u,
  );
  assert.throws(
    () =>
      assertNativeNetworkEvidence({
        samples: [
          sample("manual-delivery", [
            { pid: 42, host: "127.0.0.1", port: 53123 },
          ]),
          sample("idle-after-manual", [], "2026-08-23T04:00:01.000Z"),
        ],
        requiredActivePhases: ["manual-delivery"],
        ephemeralPortRange: { first: 49_152, last: 65_535 },
        expectedListenerEndpoints: [
          { host: "127.0.0.1", port: 53124 },
        ],
      }),
    /native-network-evidence-listener-event-not-observed/u,
  );
});

test("idle-only evidence rejects any persistent listener", () => {
  assert.deepEqual(assertNativeIdleNetworkEvidence([sample("idle-before")]), {
    persistentTcpListeners: false,
    sampleCount: 1,
  });
  assert.throws(
    () =>
      assertNativeIdleNetworkEvidence([
        sample("idle-before", [
          { pid: 42, host: "127.0.0.1", port: 53123 },
        ]),
      ]),
    /native-network-evidence-persistent-listener-observed/u,
  );
});
