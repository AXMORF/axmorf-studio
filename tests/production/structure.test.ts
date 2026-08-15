import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("production tooling keeps entrypoint, use cases, domain, and adapters separated", async () => {
  const productionRoot = path.join(process.cwd(), "scripts", "production");
  const entries = (await readdir(productionRoot, { withFileTypes: true }))
    .map((entry) => `${entry.isDirectory() ? "dir" : "file"}:${entry.name}`)
    .sort();

  assert.deepEqual(entries, [
    "dir:adapters",
    "dir:application",
    "dir:domain",
    "file:README.md",
    "file:cli.ts",
  ]);
});

test("top-level tooling uses stable responsibilities instead of milestone directories", async () => {
  const scriptsRoot = path.join(process.cwd(), "scripts");
  const entries = await readdir(scriptsRoot, { withFileTypes: true });
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );

  const retiredDirectories = [
    ["m", 6, "-proof"].join(""),
    ["m", 7, "-gps"].join(""),
    ["m", 8, "-gps"].join(""),
    ["m", 9, "-product"].join(""),
  ];
  for (const obsolete of retiredDirectories) {
    assert.equal(
      directories.has(obsolete),
      false,
      `${obsolete} makes a historical milestone part of the current architecture`,
    );
  }
  for (const required of [
    "delivery",
    "project-validation",
    "proofs",
    "production",
  ]) {
    assert.equal(
      directories.has(required),
      true,
      `${required} is a governed tooling responsibility`,
    );
  }

  await Promise.all([
    access(path.join(scriptsRoot, "proofs", "scene-runtime")),
  ]);
});
