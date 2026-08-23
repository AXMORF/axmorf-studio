import assert from "node:assert/strict";
import test from "node:test";

import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";
import { runRendererRegistryCli } from "../../scripts/renderer-registry/cli";

test("renderer registry CLI accepts only fixed generate/check project forms", async () => {
  const calls: unknown[] = [];
  const context = {
    locations: createRepositoryProductionLocations({
      repositoryRoot: "/unused",
    }),
    stdout: () => undefined,
    generate: async (request: unknown) => calls.push(request),
  };
  await runRendererRegistryCli(
    ["generate", "--project", "synthetic-proof"],
    context,
  );
  await runRendererRegistryCli(
    ["check", "--project", "synthetic-proof"],
    context,
  );
  assert.equal(calls.length, 2);
  for (const args of [
    [],
    ["generate"],
    ["generate", "--project", "synthetic-proof", "--output", "x"],
    ["generate", "--meaning", "meaning-one"],
  ]) {
    await assert.rejects(() => runRendererRegistryCli(args, context));
  }
});
