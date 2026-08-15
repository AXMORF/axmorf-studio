import assert from "node:assert/strict";
import test from "node:test";

import { runSceneTemplateAudioCli } from "../../scripts/scene-templates/cli";

test("Scene template audio CLI exposes only exact generate and check commands", async () => {
  const calls: Array<{ rootDir: string; mode: "write" | "check" }> = [];
  const output: string[] = [];
  const context = {
    rootDir: "/repository",
    stdout: (line: string) => output.push(line),
    generate: async (request: { rootDir: string; mode: "write" | "check" }) => {
      calls.push(request);
      return {
        ...request,
        projection: { schemaVersion: 1 as const, intro: null, outro: null },
        written: request.mode === "write",
      };
    },
  };

  await runSceneTemplateAudioCli(["generate"], context);
  await runSceneTemplateAudioCli(["check"], context);
  assert.deepEqual(calls, [
    { rootDir: "/repository", mode: "write" },
    { rootDir: "/repository", mode: "check" },
  ]);
  assert.deepEqual(output, [
    "Scene template audio projection generated.",
    "Scene template audio projection is current.",
  ]);
  for (const args of [[], ["write"], ["check", "extra"]]) {
    await assert.rejects(
      runSceneTemplateAudioCli(args, context),
      /Expected exactly generate or check\./u,
    );
  }
});
