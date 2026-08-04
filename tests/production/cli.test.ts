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
  const statuses: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    start: async ({ projectId }: { readonly projectId: string }) => {
      starts.push(projectId);
      return startResult;
    },
    status: async ({ runId }: { readonly runId: string }) => {
      statuses.push(runId);
      return { ...startResult, runId, lastSequence: 1 };
    },
  };

  await runProductionCli(["start", "--project", "story-example"], context);
  await runProductionCli(["status", "--run", "story-example-run-001"], context);
  assert.deepEqual(starts, ["story-example"]);
  assert.deepEqual(statuses, ["story-example-run-001"]);
  assert.deepEqual(
    output.map((line) => JSON.parse(line)),
    [startResult, { ...startResult, lastSequence: 1 }],
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
    ["unknown", "--project", "story-example"],
  ]) {
    await assert.rejects(() => runProductionCli(args, context));
  }
});

test("package scripts expose only the implemented production start/status commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["production:start"],
    "node --import tsx scripts/production/cli.ts start",
  );
  assert.equal(
    packageJson.scripts["production:status"],
    "node --import tsx scripts/production/cli.ts status",
  );
});
