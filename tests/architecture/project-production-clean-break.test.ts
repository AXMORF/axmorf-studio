import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const OLD_SCRIPTS = [
  "project:build",
  "delivery:build",
  "delivery:check",
  "delivery:cover:freeze",
  "delivery:cover:check",
  "production:preflight",
  "production:start",
  "production:status",
  "production:narrative",
  "production:scene:freeze",
  "production:scene:check",
  "production:global-visual:check",
  "production:owner:ready",
  "production:owner:failed",
  "production:finalize",
  "production:render-ready:check",
] as const;

test("package exposes only the Revision and Artifact production workflow", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.deepEqual(
    Object.keys(packageJson.scripts)
      .filter((name) =>
        OLD_SCRIPTS.includes(name as (typeof OLD_SCRIPTS)[number]),
      )
      .sort(),
    [],
  );
  assert.deepEqual(
    [
      "project:produce:plan",
      "project:task:check",
      "project:task:commit",
      "project:produce:converge",
    ].filter((name) => packageJson.scripts[name] === undefined),
    [],
  );
});

test("settings contract contains no audited ProductionRun fields", async () => {
  const source = await readFile("settings/contracts/api.ts", "utf8");
  assert.doesNotMatch(source, /ProductionRunProgress|auditedRun/);
});

test("removed workflow roots and contracts cannot become a second authority", async () => {
  for (const path of [
    "scripts/production",
    "scripts/delivery",
    "scripts/project-build",
    "src/contracts/production-run.ts",
    "src/contracts/production-owner.ts",
    "src/contracts/production-render.ts",
    "src/contracts/production-agent-write-boundary.ts",
  ]) {
    await assert.rejects(access(join(process.cwd(), path)), { code: "ENOENT" });
  }

  const exports = await readFile("src/contracts/index.ts", "utf8");
  assert.doesNotMatch(
    exports,
    /production-(?:run|owner|render|agent-write-boundary)|delivery-launch|project-build/u,
  );
});
