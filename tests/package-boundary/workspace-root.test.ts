import assert from "node:assert/strict";
import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import {
  parseWorkspaceArguments,
  resolveWorkspaceRoot,
} from "../../packages/studio/src/workspace/resolve-workspace";
import { bootstrapWorkspace } from "../../packages/studio/src/bootstrap/workspace-bootstrap";
import { createTemporaryDirectory } from "./support";

const writeWorkspaceMarker = async (rootDir: string, version: unknown = 1) => {
  await mkdir(rootDir, { recursive: true });
  await writeFile(
    join(rootDir, "package.json"),
    `${JSON.stringify({
      name: "fixture-workspace",
      private: true,
      axmorf: { workspaceVersion: version },
    })}\n`,
  );
};

const createWorkspaceSeed = async (context: TestContext) => {
  const seedRoot = await createTemporaryDirectory(context, "workspace-seed-");
  await mkdir(join(seedRoot, "public/assets/axmorf-shared"), {
    recursive: true,
  });
  await writeFile(
    join(seedRoot, "public/assets/axmorf-shared/shared.txt"),
    "shared\n",
  );
  return seedRoot;
};

test("workspace resolution finds one canonical v1 marker from a nested cwd", async (context) => {
  const rootDir = await createTemporaryDirectory(context, "workspace-root-");
  const nested = join(rootDir, "src", "projects");
  await writeWorkspaceMarker(rootDir);
  await mkdir(nested, { recursive: true });

  assert.deepEqual(await resolveWorkspaceRoot({ cwd: nested }), {
    rootDir,
    packageJsonPath: join(rootDir, "package.json"),
    workspaceVersion: 1,
  });
});

test("an explicit workspace is exact and does not guess an ancestor", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "workspace-explicit-",
  );
  const nested = join(rootDir, "nested");
  await writeWorkspaceMarker(rootDir);
  await mkdir(nested);

  await assert.rejects(
    resolveWorkspaceRoot({ cwd: rootDir, explicitWorkspace: nested }),
    /does not contain a AXMORF Studio workspace marker/u,
  );
  assert.equal(
    (await resolveWorkspaceRoot({ cwd: nested, explicitWorkspace: ".." }))
      .rootDir,
    rootDir,
  );
});

test("workspace resolution rejects missing malformed unsupported and multiple markers", async (context) => {
  const fixture = await createTemporaryDirectory(context, "workspace-invalid-");
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: fixture }),
    /No AXMORF Studio workspace marker/u,
  );

  await writeFile(join(fixture, "package.json"), "{broken");
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: fixture }),
    /package.json is not valid JSON/u,
  );

  await writeWorkspaceMarker(fixture, 2);
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: fixture }),
    /Unsupported AXMORF Studio workspace marker/u,
  );

  const outer = await createTemporaryDirectory(context, "workspace-multiple-");
  const inner = join(outer, "inner");
  await writeWorkspaceMarker(outer);
  await writeWorkspaceMarker(inner);
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: inner }),
    /Multiple AXMORF Studio workspace markers/u,
  );
});

test("workspace resolution rejects symlink roots markers and non-regular markers", async (context) => {
  const fixture = await createTemporaryDirectory(context, "workspace-safety-");
  const realRoot = join(fixture, "real");
  const linkedRoot = join(
    tmpdir(),
    `rsp-workspace-link-${process.pid}-${Date.now()}`,
  );
  await writeWorkspaceMarker(realRoot);
  await symlink(realRoot, linkedRoot, "dir");
  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(linkedRoot, { force: true });
  });
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: fixture, explicitWorkspace: linkedRoot }),
    /symbolic links/u,
  );

  const markerLinkRoot = join(fixture, "marker-link");
  await mkdir(markerLinkRoot);
  await symlink(
    join(realRoot, "package.json"),
    join(markerLinkRoot, "package.json"),
  );
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: markerLinkRoot }),
    /marker must be a regular file and cannot be a symbolic link/u,
  );

  const markerDirectoryRoot = join(fixture, "marker-directory");
  await mkdir(join(markerDirectoryRoot, "package.json"), { recursive: true });
  await assert.rejects(
    resolveWorkspaceRoot({ cwd: markerDirectoryRoot }),
    /marker must be a regular file and cannot be a symbolic link/u,
  );
});

test("global workspace arguments have one canonical position", () => {
  assert.deepEqual(parseWorkspaceArguments(["project", "create"]), {
    commandArgs: ["project", "create"],
  });
  assert.deepEqual(
    parseWorkspaceArguments(["--workspace", "../video", "project", "create"]),
    { explicitWorkspace: "../video", commandArgs: ["project", "create"] },
  );
  for (const args of [
    ["--workspace"],
    ["--workspace", "one", "--workspace", "two", "doctor"],
    ["doctor", "--workspace", "one"],
  ]) {
    assert.throws(() => parseWorkspaceArguments(args), /--workspace/u);
  }
});

test("workspace bootstrap projects immutable shared resources and is idempotent", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "workspace-bootstrap-",
  );
  const workspaceSeedRoot = await createWorkspaceSeed(context);
  await writeWorkspaceMarker(rootDir);
  const first = await bootstrapWorkspace({ rootDir, workspaceSeedRoot });
  const second = await bootstrapWorkspace({ rootDir, workspaceSeedRoot });
  assert.deepEqual(second, first);
  assert.equal(first.status, "workspace-bootstrapped");
  for (const relativePath of first.directories) {
    assert.equal(
      (await lstat(join(rootDir, relativePath))).isDirectory(),
      true,
    );
  }
  assert.deepEqual(first.sharedResourceFiles, [
    "public/assets/axmorf-shared/shared.txt",
  ]);
  assert.equal(
    await readFile(
      join(rootDir, "public/assets/axmorf-shared/shared.txt"),
      "utf8",
    ),
    "shared\n",
  );
});

test("workspace bootstrap refuses to overwrite a changed shared resource", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "workspace-bootstrap-conflict-",
  );
  const workspaceSeedRoot = await createWorkspaceSeed(context);
  await writeWorkspaceMarker(rootDir);
  await mkdir(join(rootDir, "public/assets/axmorf-shared"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, "public/assets/axmorf-shared/shared.txt"),
    "user bytes\n",
  );

  await assert.rejects(
    bootstrapWorkspace({ rootDir, workspaceSeedRoot }),
    /conflicts with package bytes/u,
  );
  assert.equal(
    await readFile(
      join(rootDir, "public/assets/axmorf-shared/shared.txt"),
      "utf8",
    ),
    "user bytes\n",
  );
});

test("workspace bootstrap rejects a symlink in a managed directory chain", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "workspace-bootstrap-link-",
  );
  const workspaceSeedRoot = await createWorkspaceSeed(context);
  const outside = await createTemporaryDirectory(
    context,
    "workspace-bootstrap-outside-",
  );
  await writeWorkspaceMarker(rootDir);
  await symlink(outside, join(rootDir, "public"), "dir");
  await assert.rejects(
    bootstrapWorkspace({ rootDir, workspaceSeedRoot }),
    /cannot be a symbolic link/u,
  );
});
