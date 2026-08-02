import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("gps-relativity missing Scene inputs fails without creating files or changing narrative artifacts", async () => {
  const narrativePath = join(
    repositoryRoot,
    "src/projects/gps-relativity/generated/narrative-auto-check.generated.json",
  );
  const before = await readFile(narrativePath);
  await assert.rejects(() =>
    runScenePackageCli([
      "package",
      "--project",
      "gps-relativity",
      "--meaning",
      "satellite-setup",
      "--write",
    ]),
  );
  await assert.rejects(() =>
    access(
      join(
        repositoryRoot,
        "src/projects/gps-relativity/scenes/satellite-setup/generated/scene-package.generated.json",
      ),
    ),
  );
  assert.deepEqual(await readFile(narrativePath), before);
});
