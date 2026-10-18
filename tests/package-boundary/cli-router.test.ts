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

test("public help works outside a Workspace and routes Agents to the film Skill", async () => {
  const output: string[] = [];
  await runCli({
    cwd: "/workspace-does-not-exist",
    args: ["film", "new", "--help"],
    output: {
      stdout: (line) => output.push(line),
      stderr: () => assert.fail("help must not fail"),
    },
  });
  const help = JSON.parse(output.join(""));
  assert.equal(help.status, "help");
  for (const command of [
    "new",
    "voice",
    "music",
    "review",
    "check",
    "deliver",
  ]) {
    assert.ok(
      help.commands.some((value: string) => value.includes(`film:${command}`)),
      command,
    );
  }
  assert.doesNotMatch(JSON.stringify(help), /project:|axmorf-video/u);
  assert.match(help.guidance.join("\n"), /axmorf-film\/SKILL\.md/u);
});

test("the public CLI maps commands exactly without leaking routing arguments", async () => {
  const calls: Array<{
    name: string;
    rootDir: string;
    args: readonly string[];
  }> = [];
  const runners = {
    bootstrap: createRunner(calls, "bootstrap"),
    doctor: createRunner(calls, "doctor"),
    browserPrepare: createRunner(calls, "browserPrepare"),
    web: createRunner(calls, "web"),
    preview: createRunner(calls, "preview"),
    dev: createRunner(calls, "dev"),
    film: createRunner(calls, "film"),
  };
  const rootDir = "/canonical/workspace";
  const cases: readonly [readonly string[], string, readonly string[]][] = [
    [["bootstrap"], "bootstrap", []],
    [["doctor"], "doctor", []],
    [["browser", "prepare"], "browserPrepare", []],
    [["web", "--port", "3110"], "web", ["--port", "3110"]],
    [["preview"], "preview", []],
    [["dev"], "dev", []],
    [
      ["film", "voice", "--film", "story"],
      "film",
      ["voice", "--film", "story"],
    ],
    [["film", "list"], "film", ["list"]],
  ];
  for (const [args, name, forwarded] of cases) {
    await routeCliCommand({ rootDir, args, runners });
    assert.deepEqual(calls.at(-1), { name, rootDir, args: forwarded });
  }
});

test("the router rejects removed, partial and extra-argument commands", async () => {
  const noOp: CliCommandRunner = async () => undefined;
  const runners = {
    bootstrap: noOp,
    doctor: noOp,
    browserPrepare: noOp,
    web: noOp,
    preview: noOp,
    dev: noOp,
    film: noOp,
  };
  for (const args of [
    [],
    ["bootstrap", "extra"],
    ["doctor", "extra"],
    ["browser"],
    ["film"],
    ["film:new"],
    ["unknown"],
    ["catalog", "query"],
    ["reference", "analyze"],
    ["narration", "generate"],
  ]) {
    await assert.rejects(
      routeCliCommand({ rootDir: "/workspace", args, runners }),
      CliUsageError,
    );
  }
  await assert.rejects(
    routeCliCommand({
      rootDir: "/workspace",
      args: ["project", "task", "bind"],
      runners,
    }),
    /removed in 0\.3\.0[\s\S]*axmorf-film/u,
  );
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
    browserPrepare: runner,
    web: runner,
    preview: runner,
    dev: runner,
    film: runner,
  };
  await runCli({ cwd: nested, args: ["doctor"], runners });
  assert.deepEqual(calls, [rootDir]);

  const outside = await createTemporaryDirectory(context, "cli-outside-");
  await assert.rejects(runCli({ cwd: outside, args: ["doctor"], runners }));
  assert.deepEqual(calls, [rootDir]);
});
