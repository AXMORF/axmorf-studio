import assert from "node:assert/strict";
import { lstat, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadExecutionPreferences,
  writeExecutionPreferences,
} from "../../scripts/config/execution-preferences";
import {
  DEFAULT_EXECUTION_PREFERENCES,
  resolveAgentExecution,
} from "../../settings/contracts/execution-preferences";

test("execution preferences default, persist privately, and reject symlinks", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-execution-preferences-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const preferencesPath = join(rootDir, "private/execution-preferences.json");

  assert.deepEqual(DEFAULT_EXECUTION_PREFERENCES, {
    schemaVersion: 1,
    contractVersion: "execution-preferences-v1",
    creativeTaskExecution: { mode: "inline" },
  });
  assert.deepEqual(await loadExecutionPreferences({ preferencesPath }), {
    preferences: DEFAULT_EXECUTION_PREFERENCES,
    source: "builtin-default",
  });

  const inline = {
    schemaVersion: 1,
    contractVersion: "execution-preferences-v1",
    creativeTaskExecution: { mode: "inline" },
  } as const;
  await writeExecutionPreferences({ preferencesPath, value: inline });
  assert.deepEqual(await loadExecutionPreferences({ preferencesPath }), {
    preferences: inline,
    source: "settings",
  });
  assert.equal((await lstat(preferencesPath)).mode & 0o777, 0o600);

  const linkPath = join(rootDir, "private/execution-link.json");
  await symlink(preferencesPath, linkPath);
  await assert.rejects(
    loadExecutionPreferences({ preferencesPath: linkPath }),
    /regular file/u,
  );
});

test("user execution fields override settings and runtime capacity clamps safely", () => {
  const settings = {
    schemaVersion: 1,
    contractVersion: "execution-preferences-v1",
    creativeTaskExecution: { mode: "subagents", maxConcurrency: 3 },
  } as const;

  assert.deepEqual(
    resolveAgentExecution({ preferences: settings, preferenceSource: "settings" }),
    {
      status: "ready",
      mode: "subagents",
      requestedMaxConcurrency: 3,
      effectiveMaxConcurrency: 1,
      requireExactConcurrency: false,
      source: { mode: "settings", maxConcurrency: "settings" },
      limitedBy: ["runtime-unknown-default"],
      persistence: "current-production-only",
    },
  );

  const inline = resolveAgentExecution({
    preferences: settings,
    preferenceSource: "settings",
    override: { mode: "inline" },
    runtimeMaxConcurrency: 20,
  });
  assert.equal(inline.mode, "inline");
  assert.equal(inline.source.mode, "user-prompt");
  assert.equal(inline.effectiveMaxConcurrency, 0);

  const clamped = resolveAgentExecution({
    preferences: settings,
    preferenceSource: "settings",
    override: { mode: "subagents", maxConcurrency: 8 },
    runtimeMaxConcurrency: 6,
  });
  assert.equal(clamped.status, "ready");
  assert.equal(clamped.effectiveMaxConcurrency, 4);
  assert.deepEqual(clamped.limitedBy, ["repository-safety-ceiling"]);

  const exact = resolveAgentExecution({
    preferences: settings,
    preferenceSource: "settings",
    override: {
      mode: "subagents",
      maxConcurrency: 8,
      requireExactConcurrency: true,
    },
    runtimeMaxConcurrency: 6,
  });
  assert.equal(exact.status, "blocked");
  assert.equal(exact.effectiveMaxConcurrency, 4);

  const unavailable = resolveAgentExecution({
    preferences: settings,
    preferenceSource: "settings",
    runtimeMaxConcurrency: 0,
  });
  assert.equal(unavailable.status, "blocked");
  assert.equal(unavailable.effectiveMaxConcurrency, 0);
  assert.deepEqual(unavailable.limitedBy, ["runtime-capacity"]);
});
