import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const REMOTION_VERSION = "4.0.489";

test("Remotion and React stay exact external peers of the runtime package", async () => {
  const manifest = JSON.parse(
    await readFile(
      join(process.cwd(), "packages/studio/package.json"),
      "utf8",
    ),
  ) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    bundleDependencies?: unknown;
    bundledDependencies?: unknown;
  };
  const peers = manifest.peerDependencies ?? {};
  const remotionPeers = Object.entries(peers).filter(
    ([name]) => name === "remotion" || name.startsWith("@remotion/"),
  );

  assert.ok(remotionPeers.length > 1);
  for (const [name, version] of remotionPeers) {
    assert.equal(version, REMOTION_VERSION, name);
    assert.equal(manifest.dependencies?.[name], undefined, name);
  }
  assert.equal(peers.react, "19.2.3");
  assert.equal(peers["react-dom"], "19.2.3");
  assert.equal(manifest.bundleDependencies, undefined);
  assert.equal(manifest.bundledDependencies, undefined);
});

test("runtime-only libraries are declared instead of relying on workspace hoisting", async () => {
  const manifest = JSON.parse(
    await readFile(
      join(process.cwd(), "packages/studio/package.json"),
      "utf8",
    ),
  ) as { dependencies?: Record<string, string> };

  assert.deepEqual(manifest.dependencies, {
    "@speech-sdk/core": "0.27.0",
    "lottie-web": "5.13.0",
    "node-edge-tts": "1.2.10",
    ogl: "1.0.11",
    typescript: "5.9.3",
    zod: "4.3.6",
  });
});
