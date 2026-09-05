import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArguments } from "../src/arguments.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

assert.equal(manifest.name, "create-axmorf-studio");
assert.equal(manifest.private, undefined);
assert.equal(manifest.license, "Apache-2.0");
assert.deepEqual(manifest.publishConfig, { access: "public" });
assert.deepEqual(manifest.bin, {
  "create-axmorf-studio": "bin/create-axmorf-studio.js",
});
assert.deepEqual(manifest.files, [
  "bin/",
  "src/",
  "template/",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]);
assert.equal(manifest.dependencies, undefined);
assert.equal(manifest.bundleDependencies, undefined);
assert.equal(manifest.bundledDependencies, undefined);
assert.equal(
  parseArguments(["release-check"]).runtimePackage,
  manifest.version,
  "The creator default runtime must match the creator release version.",
);

for (const relativePath of [
  "bin/create-axmorf-studio.js",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "template/.narration-work/.gitkeep",
  "template/.producer-artifacts/.gitkeep",
  "template/.producer-attempts/.gitkeep",
  "template/.producer-work/.gitkeep",
  "template/deliveries/.gitkeep",
  "template/out/.gitkeep",
  "template/src/generated-json.d.ts",
  "template/src/index.ts",
]) {
  const metadata = await lstat(resolve(packageRoot, relativePath));
  assert.equal(metadata.isFile(), true, `${relativePath} must be a file.`);
  assert.equal(
    metadata.isSymbolicLink(),
    false,
    `${relativePath} cannot be a symbolic link.`,
  );
}

const templateEntry = await readFile(
  resolve(packageRoot, "template/src/index.ts"),
  "utf8",
);
assert.match(
  templateEntry,
  /scene-template-audio\.generated\.json/u,
  "The generated Workspace root must load its Workspace-local Scene template audio projection.",
);
assert.match(
  templateEntry,
  /createRemotionRoot\(projectRegistry, \{ sceneTemplateAudioProjection \}\)/u,
  "The generated Workspace root must pass its local audio projection to the runtime root.",
);

assert.notEqual(
  (await lstat(resolve(packageRoot, "bin/create-axmorf-studio.js"))).mode &
    0o111,
  0,
  "Creator CLI must be executable.",
);
assert.equal(
  await readFile(resolve(packageRoot, "LICENSE"), "utf8"),
  await readFile(resolve(packageRoot, "..", "..", "LICENSE"), "utf8"),
  "The packed creator license must match the repository Apache-2.0 license.",
);

process.stdout.write(
  `${JSON.stringify({ status: "package-local-ready", publicRelease: "ready" })}\n`,
);
