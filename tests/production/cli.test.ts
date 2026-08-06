import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runProductionCli } from "../../scripts/production/cli";

const startResult = {
  runId: "story-example-run-001",
  status: "initialized",
  statePath: ".producer-runs/story-example-run-001/state.generated.json",
  requirementsFingerprint: `sha256:${"a".repeat(64)}`,
} as const;

test("production CLI accepts only exact start and status forms", async () => {
  const output: string[] = [];
  const starts: string[] = [];
  const preflights: string[] = [];
  const statuses: string[] = [];
  const sceneChecks: string[] = [];
  const globalVisualChecks: string[] = [];
  const globalVisualSubmits: string[] = [];
  const globalVisualFailures: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    preflight: async ({ projectId }: { readonly projectId: string }) => {
      preflights.push(projectId);
      return { status: "pass", projectId };
    },
    start: async ({ projectId }: { readonly projectId: string }) => {
      starts.push(projectId);
      return startResult;
    },
    status: async ({ runId }: { readonly runId: string }) => {
      statuses.push(runId);
      return { ...startResult, runId, lastSequence: 1 };
    },
    sceneCheck: async ({
      runId,
      meaningId,
    }: {
      readonly runId: string;
      readonly meaningId: string;
    }) => {
      sceneChecks.push(`${runId}:${meaningId}`);
      return { runId, meaningId, status: "ready-to-submit" };
    },
    globalVisualCheck: async ({ runId }: { readonly runId: string }) => {
      globalVisualChecks.push(runId);
      return { runId, status: "ready-to-submit" };
    },
    globalVisualSubmit: async ({ runId }: { readonly runId: string }) => {
      globalVisualSubmits.push(runId);
      return { runId, status: "success" };
    },
    globalVisualFail: async ({
      runId,
      code,
      description,
    }: {
      readonly runId: string;
      readonly code: string;
      readonly description: string;
    }) => {
      globalVisualFailures.push(`${runId}:${code}:${description}`);
      return { runId, status: "failure" };
    },
  };

  await runProductionCli(["preflight", "--project", "story-example"], context);
  await runProductionCli(["start", "--project", "story-example"], context);
  await runProductionCli(["status", "--run", "story-example-run-001"], context);
  await runProductionCli(
    ["scene-check", "--run", "story-example-run-001", "--scene", "opening"],
    context,
  );
  await runProductionCli(
    ["global-visual-check", "--run", "story-example-run-001"],
    context,
  );
  await runProductionCli(
    ["global-visual-submit", "--run", "story-example-run-001"],
    context,
  );
  await runProductionCli(
    [
      "global-visual-fail",
      "--run",
      "story-example-run-001",
      "--code",
      "GLOBAL_VISUAL_BLOCKED",
      "--description",
      "Blocked.",
    ],
    context,
  );
  assert.deepEqual(starts, ["story-example"]);
  assert.deepEqual(preflights, ["story-example"]);
  assert.deepEqual(statuses, ["story-example-run-001"]);
  assert.deepEqual(sceneChecks, ["story-example-run-001:opening"]);
  assert.deepEqual(globalVisualChecks, ["story-example-run-001"]);
  assert.deepEqual(globalVisualSubmits, ["story-example-run-001"]);
  assert.deepEqual(globalVisualFailures, [
    "story-example-run-001:GLOBAL_VISUAL_BLOCKED:Blocked.",
  ]);
  assert.deepEqual(
    output.map((line) => JSON.parse(line)),
    [
      { status: "pass", projectId: "story-example" },
      startResult,
      { ...startResult, lastSequence: 1 },
      {
        runId: "story-example-run-001",
        meaningId: "opening",
        status: "ready-to-submit",
      },
      {
        runId: "story-example-run-001",
        status: "ready-to-submit",
      },
      { runId: "story-example-run-001", status: "success" },
      { runId: "story-example-run-001", status: "failure" },
    ],
  );

  for (const args of [
    [],
    ["start"],
    ["start", "--project"],
    ["start", "--project", "story-example", "extra"],
    ["start", "--project", "story-example", "--project", "other"],
    ["start", "story-example"],
    ["start", "--run", "story-example"],
    ["status", "--project", "story-example"],
    ["status", "--run", "Bad_Run"],
    ["scene-check", "--run", "story-example-run-001"],
    ["scene-check", "--run", "story-example-run-001", "--scene", "Bad_ID"],
    ["global-visual-check", "--run"],
    ["global-visual-check", "--run", "story-example-run-001", "extra"],
    ["global-visual-submit", "--run"],
    ["global-visual-fail", "--run", "story-example-run-001"],
    [
      "global-visual-fail",
      "--run",
      "story-example-run-001",
      "--description",
      "Blocked.",
      "--code",
      "GLOBAL_VISUAL_BLOCKED",
    ],
    ["unknown", "--project", "story-example"],
  ]) {
    await assert.rejects(() => runProductionCli(args, context));
  }
});

test("package scripts expose production commands and include production tests by default", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["production:preflight"],
    "node --import tsx scripts/production/cli.ts preflight",
  );
  assert.equal(
    packageJson.scripts["production:start"],
    "node --import tsx scripts/production/cli.ts start",
  );
  assert.equal(
    packageJson.scripts["production:status"],
    "node --import tsx scripts/production/cli.ts status",
  );
  assert.equal(
    packageJson.scripts["production:scene:check"],
    "node --import tsx scripts/production/cli.ts scene-check",
  );
  assert.match(packageJson.scripts.test, /tests\/production\/\*\.test\.ts/u);
});
