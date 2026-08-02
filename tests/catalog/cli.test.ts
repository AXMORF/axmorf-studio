import assert from "node:assert/strict";
import test from "node:test";

import { runCatalogCli } from "../../scripts/catalog/cli";
import { buildResourceCatalog } from "../../scripts/catalog/domain";

test("catalog CLI accepts only fixed generate check and read-only query forms", async () => {
  const calls: string[] = [];
  const stdout: string[] = [];
  const catalog = buildResourceCatalog([]);
  const context = {
    rootDir: "/unused",
    stdout: (line: string) => stdout.push(line),
    generate: async (mode: "write" | "check") => {
      calls.push(mode);
      return {
        mode,
        entryCount: 0,
        destination: "src/remotion/catalog/resource-catalog.generated.json",
      };
    },
    readCatalog: async () => catalog,
  };

  await runCatalogCli(["generate"], context);
  await runCatalogCli(["check"], context);
  await runCatalogCli(
    ["query", "--kind", "style-profile", "--text", "cinematic"],
    context,
  );
  assert.deepEqual(calls, ["write", "check"]);
  assert.equal(stdout.at(-1), "[]");

  for (const args of [
    [],
    ["query"],
    ["query", "--kind", "unknown"],
    ["query", "--kind", "asset", "--output", "file.json"],
    ["query", "--text", "proof", "--kind", "asset"],
    ["generate", "--write"],
  ]) {
    await assert.rejects(() => runCatalogCli(args, context));
  }
});
