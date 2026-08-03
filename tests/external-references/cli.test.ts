import assert from "node:assert/strict";
import test from "node:test";

import { runExternalReferenceCli } from "../../scripts/external-references/cli";

const revision = "d4915443232e89527fdc9d7e79f132ba411fc440";

test("reference CLI accepts only fixed sync and localize positional flags", async () => {
  const calls: unknown[] = [];
  const context = {
    rootDir: "/unused",
    stdout: () => undefined,
    sync: async (input: unknown) => calls.push(["sync", input]),
    localize: async (input: unknown) => calls.push(["localize", input]),
  };
  await runExternalReferenceCli(
    [
      "sync",
      "--source",
      "video-shotcraft",
      "--revision",
      revision,
      "--card",
      "draw-svg-trace",
      "--style",
      "draw-svg-trace",
    ],
    context,
  );
  await runExternalReferenceCli(
    [
      "sync",
      "--source",
      "video-shotcraft",
      "--revision",
      revision,
      "--card",
      "panel-reveal",
      "--style",
      "vertical-comic",
    ],
    context,
  );
  await runExternalReferenceCli(
    [
      "localize",
      "--source",
      "video-shotcraft",
      "--revision",
      revision,
      "--card",
      "draw-svg-trace",
      "--style",
      "draw-svg-trace",
      "--project",
      "synthetic-proof",
      "--meaning",
      "meaning-one",
    ],
    context,
  );
  assert.equal(calls.length, 3);
  for (const args of [
    [],
    ["sync", "--source", "video-shotcraft", "--revision", "main"],
    [
      "localize",
      "--source",
      "video-shotcraft",
      "--revision",
      revision,
      "--card",
      "draw-svg-trace",
      "--style",
      "draw-svg-trace",
      "--meaning",
      "meaning-one",
      "--project",
      "synthetic-proof",
    ],
    ["sync", "--workspace", "/tmp/arbitrary"],
  ]) {
    await assert.rejects(() => runExternalReferenceCli(args, context));
  }
});
