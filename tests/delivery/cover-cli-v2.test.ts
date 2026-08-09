import assert from "node:assert/strict";
import test from "node:test";

import { runDeliveryCoverCli } from "../../scripts/delivery/cover-cli";

test("Cover CLI exposes freeze and diagnostic check while watcher owns submit", async () => {
  const calls: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: () => undefined,
    freeze: async ({ projectId }: { readonly projectId: string }) => calls.push(`freeze:${projectId}`),
    check: async ({ projectId }: { readonly projectId: string }) => calls.push(`check:${projectId}`),
  };
  await runDeliveryCoverCli(["freeze", "--project", "cover-proof"], context);
  await runDeliveryCoverCli(["check", "--project", "cover-proof"], context);
  assert.deepEqual(calls, ["freeze:cover-proof", "check:cover-proof"]);
  for (const args of [
    [],
    ["freeze"],
    ["freeze", "--project", "cover-proof", "extra"],
    ["check", "--output", "/tmp/cover"],
    ["submit", "--project", "cover-proof"],
    ["unknown", "--project", "cover-proof"],
  ]) {
    await assert.rejects(() => runDeliveryCoverCli(args, context));
  }
});
