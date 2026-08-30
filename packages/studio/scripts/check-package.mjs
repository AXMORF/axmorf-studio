import assert from "node:assert/strict";
import { lstat, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

const allowedFiles = new Set([
  "dist",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]);
const releaseDocuments = ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];

assert.equal(manifest.name, "@axmorf/studio");
assert.equal(manifest.type, "module");
assert.equal(manifest.private, undefined);
assert.equal(manifest.license, "Apache-2.0");
assert.deepEqual(manifest.publishConfig, { access: "public" });
assert.equal(manifest.bundleDependencies, undefined);
assert.equal(manifest.bundledDependencies, undefined);
assert.deepEqual(new Set(manifest.files), allowedFiles);
assert.equal(manifest.bin["axmorf"], "dist/cli/main.js");
assert.notEqual(
  (await stat(resolve(packageRoot, "dist/cli/main.js"))).mode & 0o111,
  0,
  "Runtime CLI must be executable.",
);

for (const target of Object.values(manifest.exports).flatMap((entry) =>
  Object.values(entry),
)) {
  assert.match(target, /^\.\/dist\//u);
  assert.doesNotMatch(
    target,
    /(?:private|projects|desktop|settings|tests|proofs)/iu,
  );
}

const missingReleaseDocuments = [];
for (const document of releaseDocuments) {
  try {
    const metadata = await lstat(resolve(packageRoot, document));
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      missingReleaseDocuments.push(document);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      missingReleaseDocuments.push(document);
      continue;
    }
    throw error;
  }
}

assert.equal(
  await readFile(resolve(packageRoot, "LICENSE"), "utf8"),
  await readFile(resolve(packageRoot, "..", "..", "LICENSE"), "utf8"),
  "The packed runtime license must match the repository Apache-2.0 license.",
);

assert.deepEqual(missingReleaseDocuments, []);

process.stdout.write(
  `${JSON.stringify({
    status: "package-local-ready",
    publicRelease: "ready",
    reasons: [],
  })}\n`,
);
