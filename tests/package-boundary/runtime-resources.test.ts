import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  resolveRuntimeResource,
  resolveRuntimeResources,
  loadRuntimePolicyManifest,
} from "../../packages/studio/src/runtime/runtime-resources";
import { createTemporaryDirectory } from "./support";

const createRuntimePackage = async (rootDir: string) => {
  await mkdir(join(rootDir, "dist", "cli"), { recursive: true });
  await mkdir(join(rootDir, "dist", "web"), { recursive: true });
  await mkdir(join(rootDir, "dist", "assets", "policy"), { recursive: true });
  await mkdir(join(rootDir, "dist", "assets", "scene-templates"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, "package.json"),
    `${JSON.stringify({
      name: "@axmorf/studio",
      version: "0.1.0",
    })}\n`,
  );
  await writeFile(
    join(rootDir, "dist", "assets", "policy", "runtime-policy.json"),
    "{}\n",
  );
  await writeFile(
    join(rootDir, "dist", "assets", "scene-templates", "template.txt"),
    "template\n",
  );
  await writeFile(
    join(rootDir, "dist", "web", "index.html"),
    "<!doctype html>\n",
  );
  await writeFile(
    join(rootDir, "dist", "remotion-preflight.js"),
    "export {};\n",
  );
};

test("runtime resources resolve package-owned immutable roots from module URL", async (context) => {
  const packageRoot = await createTemporaryDirectory(
    context,
    "runtime-resources-",
  );
  await createRuntimePackage(packageRoot);

  const resources = await resolveRuntimeResources({
    moduleUrl: pathToFileURL(join(packageRoot, "dist", "cli", "main.js")).href,
  });
  assert.deepEqual(resources, {
    packageRoot,
    packageVersion: "0.1.0",
    assetsRoot: join(packageRoot, "dist", "assets"),
    policyManifestPath: join(
      packageRoot,
      "dist",
      "assets",
      "policy",
      "runtime-policy.json",
    ),
    remotionPreflightEntry: join(packageRoot, "dist", "remotion-preflight.js"),
    sceneTemplatesRoot: join(packageRoot, "dist", "assets", "scene-templates"),
    webRoot: join(packageRoot, "dist", "web"),
  });
  assert.equal(
    await resolveRuntimeResource(resources, "scene-templates/template.txt"),
    join(packageRoot, "dist", "assets", "scene-templates", "template.txt"),
  );
});

test("runtime resource resolution rejects missing paths traversal and symlinks", async (context) => {
  const packageRoot = await createTemporaryDirectory(
    context,
    "runtime-invalid-",
  );
  await createRuntimePackage(packageRoot);
  const resources = await resolveRuntimeResources({ packageRoot });

  await assert.rejects(
    resolveRuntimeResource(resources, "../package.json"),
    /inside the package assets root/u,
  );
  await assert.rejects(
    resolveRuntimeResource(resources, "missing.txt"),
    /must be a regular file/u,
  );
  await symlink(
    resolve(packageRoot, "package.json"),
    join(packageRoot, "dist", "assets", "linked-package.json"),
  );
  await assert.rejects(
    resolveRuntimeResource(resources, "linked-package.json"),
    /cannot be a symbolic link/u,
  );
});

test("runtime policy loading verifies every package-owned file checksum", async (context) => {
  const packageRoot = await createTemporaryDirectory(
    context,
    "runtime-policy-files-",
  );
  await createRuntimePackage(packageRoot);
  const resources = await resolveRuntimeResources({ packageRoot });
  const logicalPath = "assets/scene-templates/template.txt";
  const bytes = Buffer.from("template\n");
  await writeFile(
    resources.policyManifestPath,
    `${JSON.stringify({
      schemaVersion: 1,
      policyVersion: "npm-runtime-policy-v1",
      packageName: "@axmorf/studio",
      packageVersion: "0.1.0",
      publicExports: ["./contracts", "./remotion"],
      files: [
        {
          logicalPath,
          checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          sizeBytes: bytes.byteLength,
          scopes: ["scene"],
        },
      ],
    })}\n`,
  );
  assert.equal((await loadRuntimePolicyManifest(resources)).files.length, 1);
  await writeFile(
    join(resources.sceneTemplatesRoot, "template.txt"),
    "tampered\n",
  );
  await assert.rejects(
    loadRuntimePolicyManifest(resources),
    /checksum is stale/u,
  );
});
