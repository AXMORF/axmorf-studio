import assert from "node:assert/strict";
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { resolvePackageBinCommand } from "../../packages/studio/src/process/resolve-package-bin";
import {
  resolveRemotionCliInvocation,
  resolveRemotionCommand,
} from "../../scripts/shared/remotion-command";
import { createTemporaryDirectory } from "./support";

const createPackageBin = async ({
  rootDir,
  packageName = "@remotion/cli",
  bin = { remotion: "remotion-cli.js" } as string | Record<string, string>,
}: {
  readonly rootDir: string;
  readonly packageName?: string;
  readonly bin?: string | Record<string, string>;
}) => {
  const packageRoot = join(rootDir, "node_modules", ...packageName.split("/"));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: packageName, version: "1.0.0", bin })}\n`,
  );
  await writeFile(join(packageRoot, "remotion-cli.js"), "console.log('ok');\n");
  await chmod(join(packageRoot, "remotion-cli.js"), 0o644);
  return packageRoot;
};

test("Remotion resolves the Workspace-local JS bin through process.execPath", async (context) => {
  const rootDir = await createTemporaryDirectory(context, "remotion-command-");
  await writeFile(join(rootDir, "package.json"), "{}\n");
  const packageRoot = await createPackageBin({ rootDir });

  assert.deepEqual(await resolveRemotionCliInvocation(rootDir), {
    command: process.execPath,
    argsPrefix: [join(packageRoot, "remotion-cli.js")],
  });
  assert.equal(
    resolveRemotionCommand(rootDir),
    join(rootDir, "node_modules", ".bin", "remotion"),
  );
});

test("package bin resolution rejects missing malformed escaping and symlink bins", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "package-bin-invalid-",
  );
  await writeFile(join(rootDir, "package.json"), "{}\n");
  await assert.rejects(
    resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    }),
    /is not installed in the Workspace/u,
  );

  const packageRoot = await createPackageBin({ rootDir, bin: {} });
  await assert.rejects(
    resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    }),
    /does not declare the remotion bin/u,
  );

  await writeFile(join(packageRoot, "package.json"), "{broken");
  await assert.rejects(
    resolveRemotionCliInvocation(rootDir),
    /package manifest is not valid JSON/u,
  );

  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({
      name: "@remotion/cli",
      version: "1.0.0",
      bin: { remotion: "../../../outside.js" },
    })}\n`,
  );
  await assert.rejects(
    resolveRemotionCliInvocation(rootDir),
    /must stay inside its package root/u,
  );

  await writeFile(join(rootDir, "outside.js"), "console.log('outside');\n");
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({
      name: "@remotion/cli",
      version: "1.0.0",
      bin: { remotion: "remotion-cli.js" },
    })}\n`,
  );
  await symlink(
    join(rootDir, "outside.js"),
    join(packageRoot, "linked-cli.js"),
  );
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({
      name: "@remotion/cli",
      version: "1.0.0",
      bin: { remotion: "linked-cli.js" },
    })}\n`,
  );
  await assert.rejects(
    resolveRemotionCliInvocation(rootDir),
    /cannot be a symbolic link/u,
  );
});
