import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CliUsageError,
  routeCliCommand,
  type CliCommandRunner,
} from "../../packages/studio/src/cli/router";
import { runCli } from "../../packages/studio/src/cli/main";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTemporaryDirectory } from "./support";

const createRunner =
  (
    calls: Array<{ name: string; rootDir: string; args: readonly string[] }>,
    name: string,
  ): CliCommandRunner =>
  async ({ rootDir, args }) => {
    calls.push({ name, rootDir, args });
  };

test("the public CLI maps grouped commands exactly without leaking routing arguments", async () => {
  const calls: Array<{
    name: string;
    rootDir: string;
    args: readonly string[];
  }> = [];
  const runners = {
    bootstrap: createRunner(calls, "bootstrap"),
    doctor: createRunner(calls, "doctor"),
    web: createRunner(calls, "web"),
    preview: createRunner(calls, "preview"),
    dev: createRunner(calls, "dev"),
    projectCreate: createRunner(calls, "projectCreate"),
    projectDelete: createRunner(calls, "projectDelete"),
    projectAssetImport: createRunner(calls, "projectAssetImport"),
    projectCheck: createRunner(calls, "projectCheck"),
    projectProduction: createRunner(calls, "projectProduction"),
    catalog: createRunner(calls, "catalog"),
    registry: createRunner(calls, "registry"),
    renderer: createRunner(calls, "renderer"),
    scene: createRunner(calls, "scene"),
    narration: createRunner(calls, "narration"),
  };
  const rootDir = "/canonical/workspace";
  const cases: readonly [readonly string[], string, readonly string[]][] = [
    [["bootstrap"], "bootstrap", []],
    [["doctor"], "doctor", []],
    [["web", "--port", "3110"], "web", ["--port", "3110"]],
    [["preview"], "preview", []],
    [["dev"], "dev", []],
    [
      ["project", "create", "--project", "story"],
      "projectCreate",
      ["--project", "story"],
    ],
    [
      ["project", "delete", "--project", "story", "--confirm-delete"],
      "projectDelete",
      ["--project", "story", "--confirm-delete"],
    ],
    [
      ["project", "asset", "import", "--project", "story"],
      "projectAssetImport",
      ["--project", "story"],
    ],
    [
      ["project", "check", "--project", "story"],
      "projectCheck",
      ["--project", "story"],
    ],
    [
      ["project", "execution", "resolve", "--mode", "inline"],
      "projectProduction",
      ["execution-resolve", "--mode", "inline"],
    ],
    [
      ["project", "produce", "inspect", "--project", "story"],
      "projectProduction",
      ["inspect", "--project", "story"],
    ],
    [
      ["project", "produce", "prepare", "--project", "story"],
      "projectProduction",
      ["prepare", "--project", "story"],
    ],
    [
      ["project", "produce", "continue", "--attempt", "attempt"],
      "projectProduction",
      ["continue", "--attempt", "attempt"],
    ],
    [
      ["project", "task", "check", "--task", "task"],
      "projectProduction",
      ["task-check", "--task", "task"],
    ],
    [
      ["project", "task", "commit", "--task", "task"],
      "projectProduction",
      ["task-commit", "--task", "task"],
    ],
    [
      ["project", "task", "fail", "--task", "task"],
      "projectProduction",
      ["task-fail", "--task", "task"],
    ],
    [
      ["catalog", "query", "--kind", "style"],
      "catalog",
      ["query", "--kind", "style"],
    ],
    [["registry", "check"], "registry", ["check"]],
    [
      ["renderer", "check", "--project", "story"],
      "renderer",
      ["check", "--project", "story"],
    ],
    [
      ["scene", "coverage", "--project", "story", "--check"],
      "scene",
      ["coverage", "--project", "story", "--check"],
    ],
    [
      ["narration", "check", "--project", "story"],
      "narration",
      ["check", "--project", "story"],
    ],
  ];
  for (const [args, name, forwarded] of cases) {
    await routeCliCommand({ rootDir, args, runners });
    assert.deepEqual(calls.at(-1), { name, rootDir, args: forwarded });
  }
});

test("the router rejects aliases partial commands and arguments on fixed commands", async () => {
  const noOp: CliCommandRunner = async () => undefined;
  const runners = {
    bootstrap: noOp,
    doctor: noOp,
    web: noOp,
    preview: noOp,
    dev: noOp,
    projectCreate: noOp,
    projectDelete: noOp,
    projectAssetImport: noOp,
    projectCheck: noOp,
    projectProduction: noOp,
    catalog: noOp,
    registry: noOp,
    renderer: noOp,
    scene: noOp,
    narration: noOp,
  };
  for (const args of [
    [],
    ["bootstrap", "extra"],
    ["project:create"],
    ["project"],
    ["project", "produce"],
    ["project", "produce", "unknown"],
    ["project", "asset", "unknown"],
    ["project", "verify"],
    ["unknown"],
  ]) {
    await assert.rejects(
      routeCliCommand({ rootDir: "/workspace", args, runners }),
      CliUsageError,
    );
  }
});

test("CLI composition resolves Workspace before invoking any command runner", async (context) => {
  const rootDir = await createTemporaryDirectory(context, "cli-workspace-");
  const nested = join(rootDir, "src", "projects");
  await mkdir(nested, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    `${JSON.stringify({
      axmorf: { workspaceVersion: 1 },
    })}\n`,
  );
  const calls: string[] = [];
  const runner: CliCommandRunner = async ({ rootDir: resolvedRoot }) => {
    calls.push(resolvedRoot);
  };
  const runners = {
    bootstrap: runner,
    doctor: runner,
    web: runner,
    preview: runner,
    dev: runner,
    projectCreate: runner,
    projectDelete: runner,
    projectAssetImport: runner,
    projectCheck: runner,
    projectProduction: runner,
    catalog: runner,
    registry: runner,
    renderer: runner,
    scene: runner,
    narration: runner,
  };
  await runCli({ cwd: nested, args: ["doctor"], runners });
  assert.deepEqual(calls, [rootDir]);

  const outside = await createTemporaryDirectory(context, "cli-outside-");
  await assert.rejects(runCli({ cwd: outside, args: ["doctor"], runners }));
  assert.deepEqual(calls, [rootDir]);
});
