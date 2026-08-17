import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  const finalizes: string[] = [];
  const ownerReceipts: string[] = [];
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
    finalize: async ({ runId }: { readonly runId: string }) => {
      finalizes.push(runId);
      return { runId, status: "delivery-render-started" as const };
    },
    ownerReceipt: async (request: {
      readonly runId: string;
      readonly ownerKind: string;
      readonly meaningId: string | null;
      readonly status: string;
      readonly code?: string;
      readonly description?: string;
    }) => {
      ownerReceipts.push(
        `${request.status}:${request.ownerKind}:${request.meaningId ?? "story"}:${request.code ?? "ready"}:${request.description ?? "ready"}`,
      );
      return { runId: request.runId, status: request.status };
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
    ["finalize", "--run", "story-example-run-001"],
    context,
  );
  await runProductionCli(
    [
      "owner-failed",
      "--run",
      "story-example-run-001",
      "--owner",
      "global-visual",
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
  assert.deepEqual(finalizes, ["story-example-run-001"]);
  assert.deepEqual(ownerReceipts, [
    "owner-failed:global-visual:story:GLOBAL_VISUAL_BLOCKED:Blocked.",
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
      { runId: "story-example-run-001", status: "delivery-render-started" },
      { runId: "story-example-run-001", status: "owner-failed" },
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
    ["scene-submit", "--run", "story-example-run-001", "--scene", "opening"],
    ["global-visual-submit", "--run", "story-example-run-001"],
    ["global-visual-fail", "--run", "story-example-run-001", "--code", "X", "--description", "X"],
    [
      "owner-failed",
      "--run",
      "story-example-run-001",
      "--description",
      "Blocked.",
      "--owner",
      "global-visual",
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
  assert.equal(
    packageJson.scripts["production:finalize"],
    "node --import tsx scripts/production/cli.ts finalize",
  );
  assert.equal(
    packageJson.scripts["production:owner:ready"],
    "node --import tsx scripts/production/cli.ts owner-ready",
  );
  assert.equal(packageJson.scripts["production:scene:submit"], undefined);
  assert.equal(
    packageJson.scripts.test,
    "node --import tsx scripts/tests/project-tests.ts",
  );
  assert.match(
    await readFile("scripts/tests/project-tests.ts", "utf8"),
    /"tests\/production"/u,
  );
});

test("production narrative accepts one exact supersede fingerprint", async () => {
  const output: string[] = [];
  const requests: unknown[] = [];
  const fingerprint = `sha256:${"e".repeat(64)}`;
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    narrative: async (request: unknown) => {
      requests.push(request);
      return { status: "baseline-ready" };
    },
  };

  await runProductionCli(
    [
      "narrative",
      "--run",
      "story-example-run-001",
      "--supersede",
      fingerprint,
    ],
    context,
  );

  assert.deepEqual(requests, [
    {
      rootDir: process.cwd(),
      runId: "story-example-run-001",
      supersedeFingerprint: fingerprint,
    },
  ]);
  await assert.rejects(() =>
    runProductionCli(
      [
        "narrative",
        "--run",
        "story-example-run-001",
        "--supersede",
        "not-a-fingerprint",
      ],
      context,
    ),
  );
});

test("production finalize CLI uses exit 0, expected exit 2, and unexpected exit 1", async () => {
  const exitCodes: number[] = [];
  const output: string[] = [];
  await runProductionCli(["finalize", "--run", "story-example-run-001"], {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    exitCode: (code) => exitCodes.push(code),
    finalize: async () => ({
      status: "owner-receipts-incomplete" as const,
      missingOwnerAssignments: [],
    }),
  });
  await runProductionCli(["finalize", "--run", "story-example-run-001"], {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    exitCode: (code) => exitCodes.push(code),
    finalize: async () => ({ status: "delivery-render-started" as const }),
  });
  assert.deepEqual(exitCodes, [2]);

  const unexpected = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/production/cli.ts", "unknown"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(unexpected.status, 1);
  assert.equal(unexpected.stdout, "");
  assert.match(unexpected.stderr, /documented production command form/iu);
});
