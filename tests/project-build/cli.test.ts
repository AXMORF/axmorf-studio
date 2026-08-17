import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runProjectBuildCli } from "../../scripts/project-build/cli";

test("project:build CLI accepts only the exact Project form", async () => {
  const output: string[] = [];
  const calls: string[] = [];
  const context = {
    rootDir: process.cwd(),
    stdout: output.push.bind(output),
    build: async ({ projectId }: { readonly projectId: string }) => {
      calls.push(projectId);
      return {
        projectId,
        buildId: `build-${"a".repeat(64)}`,
        status: "project-build-complete",
        noOp: false,
      } as const;
    },
  };

  await runProjectBuildCli(["--project", "story-example"], context);
  assert.deepEqual(calls, ["story-example"]);
  assert.equal(JSON.parse(output[0] ?? "null").projectId, "story-example");

  for (const args of [
    [],
    ["--project"],
    ["--project", "story-example", "extra"],
    ["--run", "run-example"],
    ["--project", "../escape"],
  ]) {
    await assert.rejects(() => runProjectBuildCli(args, context));
  }
});

test("package scripts expose build-centric Project delivery", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts["project:build"],
    "node --import tsx scripts/project-build/cli.ts",
  );
});
