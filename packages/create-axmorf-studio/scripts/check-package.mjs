import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

for (const relativePath of [
  "bin/create-axmorf-studio.js",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]) {
  const metadata = await lstat(resolve(packageRoot, relativePath));
  assert.equal(metadata.isFile(), true, `${relativePath} must be a file.`);
  assert.equal(
    metadata.isSymbolicLink(),
    false,
    `${relativePath} cannot be a symbolic link.`,
  );
}

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
