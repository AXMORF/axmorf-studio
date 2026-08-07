import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package scripts expose GlobalVisual production commands in the default gate", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["production:global-visual:check"],
    "node --import tsx scripts/production/cli.ts global-visual-check",
  );
  assert.equal(
    packageJson.scripts["production:global-visual:submit"],
    "node --import tsx scripts/production/cli.ts global-visual-submit",
  );
  assert.equal(
    packageJson.scripts["production:global-visual:fail"],
    "node --import tsx scripts/production/cli.ts global-visual-fail",
  );
  assert.equal(
    packageJson.scripts.test,
    "node --import tsx scripts/tests/project-tests.ts",
  );
  assert.match(
    await readFile("scripts/tests/project-tests.ts", "utf8"),
    /"tests\/production"/u,
  );
});
