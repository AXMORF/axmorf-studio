import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProjectAgentExecution } from "../../scripts/project-production/application/resolve-agent-execution";
import {
  DEFAULT_EXECUTION_PREFERENCES,
  resolveAgentExecution,
} from "../../settings/contracts/execution-preferences";

test("blocked execution resolution gives public capability guidance without mutating the workspace", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-execution-guidance-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  const result = await resolveProjectAgentExecution({ rootDir });
  assert.equal(result.status, "blocked");
  assert.ok("nextSteps" in result);
  assert.equal(
    result.nextSteps.reference,
    ".agents/skills/axmorf-video/references/execution-capabilities.md",
  );
  const guidance = result.nextSteps.actions.join("\n");
  assert.match(guidance, /native child transport probe/u);
  assert.match(guidance, /--worker-transport/u);
  assert.match(guidance, /--runtime-max-concurrency/u);
  assert.match(guidance, /not the configured or requested concurrency/u);
  assert.match(guidance, /Do not prepare production or fall back to inline/u);
  assert.deepEqual(result, {
    ...resolveAgentExecution({
      preferences: DEFAULT_EXECUTION_PREFERENCES,
      preferenceSource: "builtin-default",
    }),
    nextSteps: result.nextSteps,
  });
  assert.deepEqual(await readdir(rootDir), []);
});

test("capacity blockers retain guidance while ready modes keep their original response", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-execution-capacity-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  for (const runtime of [
    {},
    { runtimeMaxConcurrency: 0 },
    {
      runtimeMaxConcurrency: 2,
      override: {
        mode: "subagents",
        maxConcurrency: 4,
        requireExactConcurrency: true,
      } as const,
    },
  ]) {
    const result = await resolveProjectAgentExecution({
      rootDir,
      runtimeWorkerTransport: "shared-workspace",
      ...runtime,
    });
    assert.equal(result.status, "blocked");
    assert.ok("nextSteps" in result);
    assert.match(result.nextSteps.actions.join("\n"), /zero capacity/u);
  }

  for (const runtime of [
    { override: { mode: "inline" } as const },
    {
      runtimeWorkerTransport: "shared-workspace" as const,
      runtimeMaxConcurrency: 4,
    },
    {
      runtimeWorkerTransport: "shared-workspace" as const,
      runtimeMaxConcurrency: 1,
    },
  ]) {
    const result = await resolveProjectAgentExecution({ rootDir, ...runtime });
    assert.equal(result.status, "ready");
    assert.equal("nextSteps" in result, false);
  }
  assert.deepEqual(await readdir(rootDir), []);
});

test("unknown capacity gives a bounded probe matching the requested policy", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-execution-probe-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  for (const [requested, bounded] of [[1, 1], [3, 3], [8, 4]]) {
    const result = await resolveProjectAgentExecution({
      rootDir,
      override: { mode: "subagents", maxConcurrency: requested },
      runtimeWorkerTransport: "shared-workspace",
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.effectiveMaxConcurrency, 0);
    assert.deepEqual(result.limitedBy, ["runtime-capacity-unverified"]);
    assert.ok("nextSteps" in result);
    assert.ok(result.nextSteps.actions.some((action) =>
      action.includes(`up to ${bounded} separate native children`) &&
      action.includes("dispatch the batch before waiting")));
  }
  assert.deepEqual(await readdir(rootDir), []);
});
