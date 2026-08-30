import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildRuntimePolicyManifest,
  parseRuntimePolicyManifest,
  serializeRuntimePolicyManifest,
} from "../../packages/studio/src/runtime/policy-manifest";
import {
  snapshotPolicyRoots,
  snapshotTaskPolicyFingerprints,
  snapshotWorkspaceConfiguration,
} from "../../scripts/project-production/adapters/project-input-snapshot";

const bytes = (value: string) => Buffer.from(value, "utf8");

const manifest = (sceneBytes = "scene") =>
  buildRuntimePolicyManifest({
    packageVersion: "0.1.0",
    files: [
      {
        logicalPath: "dist/contracts.js",
        bytes: bytes("contracts"),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
      {
        logicalPath: "dist/remotion.js",
        bytes: bytes(sceneBytes),
        scopes: ["composition", "global-visual", "scene"],
      },
      {
        logicalPath: "dist/delivery.js",
        bytes: bytes("delivery"),
        scopes: ["delivery"],
      },
    ],
  });

test("runtime policy manifest is canonical and contains no host identity", () => {
  const first = manifest();
  const second = buildRuntimePolicyManifest({
    packageVersion: "0.1.0",
    files: [
      {
        logicalPath: "dist/delivery.js",
        bytes: bytes("delivery"),
        scopes: ["delivery"],
      },
      {
        logicalPath: "dist/remotion.js",
        bytes: bytes("scene"),
        scopes: ["scene", "composition", "global-visual"],
      },
      {
        logicalPath: "dist/contracts.js",
        bytes: bytes("contracts"),
        scopes: ["scene", "delivery", "global-visual", "composition"],
      },
    ],
  });
  assert.deepEqual(first, second);
  const serialized = serializeRuntimePolicyManifest(first);
  assert.doesNotMatch(serialized, /cwd|timestamp|pid|absolutePath/u);
  assert.deepEqual(parseRuntimePolicyManifest(JSON.parse(serialized)), first);
});

test("runtime policy and Workspace configuration have separate fingerprints", async (context) => {
  const firstRoot = await mkdtemp(join(tmpdir(), "rsp-policy-workspace-a-"));
  const secondRoot = await mkdtemp(join(tmpdir(), "rsp-policy-workspace-b-"));
  context.after(() =>
    Promise.all([
      rm(firstRoot, { recursive: true, force: true }),
      rm(secondRoot, { recursive: true, force: true }),
    ]),
  );
  for (const [rootDir, packageName] of [
    [firstRoot, "workspace-a"],
    [secondRoot, "workspace-b"],
  ] as const) {
    for (const [path, content] of [
      ["package.json", JSON.stringify({ name: packageName })],
      ["package-lock.json", JSON.stringify({ name: packageName })],
      [
        "remotion.config.ts",
        `export const workspace = ${JSON.stringify(packageName)};`,
      ],
    ] as const) {
      await mkdir(dirname(join(rootDir, path)), { recursive: true });
      await writeFile(join(rootDir, path), content);
    }
  }

  const runtimeManifest = manifest();
  assert.equal(
    await snapshotPolicyRoots({
      rootDir: firstRoot,
      runtimePolicyManifest: runtimeManifest,
    }),
    await snapshotPolicyRoots({
      rootDir: secondRoot,
      runtimePolicyManifest: runtimeManifest,
    }),
  );
  assert.notEqual(
    await snapshotWorkspaceConfiguration({ rootDir: firstRoot }),
    await snapshotWorkspaceConfiguration({ rootDir: secondRoot }),
  );
});

test("task policy fingerprints invalidate only scopes containing changed files", async () => {
  const before = await snapshotTaskPolicyFingerprints({
    rootDir: "/unused",
    runtimePolicyManifest: manifest(),
  });
  const after = await snapshotTaskPolicyFingerprints({
    rootDir: "/unused",
    runtimePolicyManifest: manifest("changed scene runtime"),
  });
  assert.notEqual(before.scene, after.scene);
  assert.notEqual(before.globalVisual, after.globalVisual);
  assert.notEqual(before.composition, after.composition);
  assert.equal(before.delivery, after.delivery);
});
