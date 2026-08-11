import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDeliveryCli } from "../../scripts/delivery/cli";

const deliveryId = `delivery-${"a".repeat(64)}`;

test("delivery CLI accepts only exact build and check forms", async () => {
  const output: string[] = [];
  const builds: string[] = [];
  const checks: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    build: async ({ projectId }: { readonly projectId: string }) => {
      builds.push(projectId);
      return { projectId, deliveryId, status: "delivery-render-started", noOp: false } as const;
    },
    check: async ({ projectId }: { readonly projectId: string }) => {
      checks.push(projectId);
      return {
        projectId,
        deliveryId,
        status: "delivery-render-started",
      } as const;
    },
  };

  await runDeliveryCli(["build", "--project", "delivery-proof"], context);
  await runDeliveryCli(["check", "--project", "delivery-proof"], context);
  assert.deepEqual(builds, ["delivery-proof"]);
  assert.deepEqual(checks, ["delivery-proof"]);
  assert.deepEqual(
    output.map((line) => JSON.parse(line)),
    [
      { projectId: "delivery-proof", deliveryId, status: "delivery-render-started", noOp: false },
      { projectId: "delivery-proof", deliveryId, status: "delivery-render-started" },
    ],
  );

  for (const args of [
    [],
    ["build"],
    ["build", "--project"],
    ["build", "--project", "delivery-proof", "extra"],
    ["build", "--output", "/tmp/release"],
    ["check", "--project"],
    ["check", "--project", "delivery-proof", "extra"],
    ["check", "--project", "delivery-proof", "--delivery", "../escape"],
    ["check", "--delivery", deliveryId, "--project", "delivery-proof"],
    ["check", "--project", "delivery-proof", "--delivery", `/tmp/${deliveryId}`],
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
    packageJson.scripts["production:render-ready:check"],
    "node --import tsx scripts/production/cli.ts render-ready-check",
  );
});
