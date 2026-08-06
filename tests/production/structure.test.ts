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

  for (const obsolete of ["m6-proof", "m7-gps", "m8-gps", "m9-product"]) {
    assert.equal(
      directories.has(obsolete),
      false,
      `${obsolete} makes a historical milestone part of the current architecture`,
    );
  }
  for (const required of [
    "compatibility",
    "project-tools",
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
    access(path.join(scriptsRoot, "project-tools", "gps-relativity")),
    access(path.join(scriptsRoot, "project-tools", "product-comic-vertical")),
  ]);
});
