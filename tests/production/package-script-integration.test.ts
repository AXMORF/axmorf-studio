import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package scripts reserve submit/fail for the detached watcher", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["production:global-visual:check"],
    "node --import tsx scripts/production/cli.ts global-visual-check",
  );
  assert.equal(
    packageJson.scripts["production:global-visual:submit"],
    undefined,
  );
  assert.equal(packageJson.scripts["production:global-visual:fail"], undefined);
  assert.equal(packageJson.scripts["delivery:cover:submit"], undefined);
  assert.equal(
    packageJson.scripts["production:watch:start"],
    "node --import tsx scripts/production/cli.ts watch-start",
  );
  assert.equal(
    packageJson.scripts.test,
    "node --import tsx scripts/tests/project-tests.ts",
  );
  assert.equal(packageJson.scripts.dev, "node --import tsx scripts/dev/cli.ts");
  assert.equal(
    packageJson.scripts["dev:lan"],
    "node --import tsx scripts/dev/cli.ts --lan",
  );
  assert.equal(
    packageJson.scripts["config:migrate"],
    "node --import tsx scripts/config/migrate.ts",
  );
  assert.equal(
    packageJson.scripts["config:build"],
    "vite build --config settings/vite.config.ts",
  );
  assert.equal(
    packageJson.scripts["scene-template-audio:generate"],
    "node --import tsx scripts/scene-templates/cli.ts generate",
  );
  assert.equal(
    packageJson.scripts["scene-template-audio:check"],
    "node --import tsx scripts/scene-templates/cli.ts check",
  );
  assert.match(
    packageJson.scripts["check:static"],
    /npm run scene-template-audio:check/u,
  );
  assert.match(
    await readFile("scripts/tests/project-tests.ts", "utf8"),
    /"tests\/production"/u,
  );
});
