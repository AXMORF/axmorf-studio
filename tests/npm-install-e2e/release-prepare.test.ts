import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyReleaseVersion,
  releaseDistTag,
} from "../../scripts/release/prepare-version";

const files = [
  "package.json",
  "package-lock.json",
  "packages/studio/package.json",
  "packages/create-axmorf-studio/package.json",
];

const copyRepositoryManifests = async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-release-prepare-"));
  for (const file of files) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await copyFile(file, join(root, file));
  }
  return root;
};

test("release:prepare sets one version on every manifest and lock entry", async () => {
  const root = await copyRepositoryManifests();
  try {
    const before = JSON.parse(
      await readFile(join(root, "package-lock.json"), "utf8"),
    );
    assert.deepEqual(await applyReleaseVersion(root, "9.8.7-rc.1"), {
      version: "9.8.7-rc.1",
      distTag: "next",
    });
    for (const file of files.filter((name) => name.endsWith("package.json"))) {
      const source = await readFile(join(root, file), "utf8");
      assert.equal(JSON.parse(source).version, "9.8.7-rc.1", file);
      assert.ok(source.endsWith("}\n"), `${file} keeps a trailing newline`);
    }
    const lock = JSON.parse(
      await readFile(join(root, "package-lock.json"), "utf8"),
    );
    assert.equal(lock.version, "9.8.7-rc.1");
    for (const key of [
      "",
      "packages/studio",
      "packages/create-axmorf-studio",
    ]) {
      assert.equal(lock.packages[key].version, "9.8.7-rc.1", key);
    }
    // Only version fields change; dependency resolution stays untouched.
    assert.deepEqual(
      Object.keys(lock.packages).sort(),
      Object.keys(before.packages).sort(),
    );
    assert.deepEqual(
      lock.packages[""].dependencies,
      before.packages[""].dependencies,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release:prepare rejects malformed versions before writing", async () => {
  const root = await copyRepositoryManifests();
  try {
    const original = await readFile(join(root, "package.json"), "utf8");
    for (const version of ["v1.2.3", "1.2", "1.2.3-", "latest"]) {
      await assert.rejects(
        applyReleaseVersion(root, version),
        /1\.2\.3-rc\.1/u,
      );
    }
    assert.equal(await readFile(join(root, "package.json"), "utf8"), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prerelease versions publish to next and stable versions to latest", () => {
  assert.equal(releaseDistTag("0.1.22-rc.1"), "next");
  assert.equal(releaseDistTag("0.1.22"), "latest");
});
