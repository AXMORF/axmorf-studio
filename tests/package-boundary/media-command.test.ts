import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";

import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";

const workspaceRoot = process.cwd();
const workspaceRequire = createRequire(join(workspaceRoot, "package.json"));
const expectedCliEntry = join(
  dirname(workspaceRequire.resolve("@remotion/cli/package.json")),
  "remotion-cli.js",
);

for (const tool of ["ffmpeg", "ffprobe"] as const) {
  test(`${tool} resolves through the Workspace-local Remotion CLI`, async () => {
    const invocation = await resolveMediaToolCommand({
      rootDir: workspaceRoot,
      tool,
      args: ["-version"],
    });

    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, [expectedCliEntry, tool, "-version"]);
    assert.equal(
      invocation.args.some((arg) => arg.includes(".bin")),
      false,
    );
  });
}
