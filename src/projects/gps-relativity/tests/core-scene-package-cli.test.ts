import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { SceneCoverageMapSchema } from "../../../contracts/scene-package";
import { runScenePackageCli } from "../../../../scripts/scene-package/cli";

const repositoryRoot = process.cwd();

test("gps-relativity missing Scene inputs fails without changing narrative artifacts", async () => {
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

test("GPS coverage CLI has a real file-backed default implementation", async () => {
  assert.ok(
    await runScenePackageCli([
      "coverage",
      "--project",
      "gps-relativity",
      "--check",
    ]),
  );
});

test("gps-relativity file-backed coverage is all-ready in Story order", async () => {
  const coverage = SceneCoverageMapSchema.parse(
    JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "src/projects/gps-relativity/generated/scene-coverage.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(coverage.storyBeatOrder, [
    "position-is-time",
    "two-relativistic-effects",
    "net-drift",
    "error-accumulation",
    "practical-conclusion",
  ]);
  assert.ok(coverage.entries.every(({ status }) => status === "ready"));
});
