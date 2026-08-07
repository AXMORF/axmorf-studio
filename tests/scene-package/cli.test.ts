import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { runScenePackageCli } from "../../scripts/scene-package/cli";

const repositoryRoot = join(import.meta.dirname, "../..");

test("scene package CLI accepts only exact package and coverage write/check forms", async () => {
  const calls: unknown[] = [];
  const context = {
    rootDir: repositoryRoot,
    stdout: () => undefined,
    generatePackage: async (input: unknown) => calls.push(input),
    generateCoverage: async (input: unknown) => calls.push(input),
  };
  await runScenePackageCli(
    [
      "package",
      "--project",
      "synthetic-proof",
      "--meaning",
      "meaning-one",
      "--write",
    ],
    context,
  );
  await runScenePackageCli(
    ["coverage", "--project", "synthetic-proof", "--check"],
    context,
  );
  assert.equal(calls.length, 2);
  for (const args of [
    [],
    ["package", "--project", "synthetic-proof", "--write"],
    [
      "coverage",
      "--project",
      "synthetic-proof",
      "--meaning",
      "meaning-one",
      "--write",
    ],
    [
      "package",
      "--meaning",
      "meaning-one",
      "--project",
      "synthetic-proof",
      "--write",
    ],
  ]) {
    await assert.rejects(() => runScenePackageCli(args, context));
  }
});
