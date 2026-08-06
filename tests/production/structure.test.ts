import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
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
