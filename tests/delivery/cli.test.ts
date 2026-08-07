import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeliveryCli } from "../../scripts/delivery/cli";

const releaseId = `release-${"a".repeat(64)}`;

test("delivery CLI accepts only exact build and check forms", async () => {
  const output: string[] = [];
  const builds: string[] = [];
  const checks: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    build: async ({ projectId }: { readonly projectId: string }) => {
      builds.push(projectId);
      return { projectId, releaseId, status: "built", noOp: false } as const;
    },
    check: async ({
      projectId,
      releaseId: requestedRelease,
    }: {
      readonly projectId: string;
      readonly releaseId: string;
    }) => {
      checks.push(`${projectId}:${requestedRelease}`);
      return {
        projectId,
        releaseId: requestedRelease,
        status: "current",
      } as const;
    },
  };

  await runDeliveryCli(["build", "--project", "delivery-proof"], context);
  await runDeliveryCli(
    ["check", "--project", "delivery-proof", "--release", releaseId],
    context,
  );
  assert.deepEqual(builds, ["delivery-proof"]);
  assert.deepEqual(checks, [`delivery-proof:${releaseId}`]);
  assert.deepEqual(
    output.map((line) => JSON.parse(line)),
    [
      { projectId: "delivery-proof", releaseId, status: "built", noOp: false },
      { projectId: "delivery-proof", releaseId, status: "current" },
    ],
  );

  for (const args of [
    [],
    ["build"],
    ["build", "--project"],
    ["build", "--project", "delivery-proof", "extra"],
    ["build", "--output", "/tmp/release"],
    ["check", "--project", "delivery-proof"],
    ["check", "--project", "delivery-proof", "--release", "../escape"],
    ["check", "--release", releaseId, "--project", "delivery-proof"],
    ["check", "--project", "delivery-proof", "--release", `/tmp/${releaseId}`],
    ["unknown", "--project", "delivery-proof"],
  ]) {
    await assert.rejects(() => runDeliveryCli(args, context));
  }
});

test("package scripts expose delivery without extending production commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["delivery:build"],
    "node --import tsx scripts/delivery/cli.ts build",
  );
  assert.equal(
    packageJson.scripts["delivery:check"],
    "node --import tsx scripts/delivery/cli.ts check",
  );
  assert.equal(
    packageJson.scripts["production:preview:check"],
    "node --import tsx scripts/production/cli.ts preview-check",
  );
});
