import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readLocalProjectRoot } from "../../scripts/projects/root";

const createRoot = () => mkdtemp(join(tmpdir(), "rsp-project-root-"));

test("missing local Projects root is an empty Project set", async () => {
  const rootDir = await createRoot();
  assert.deepEqual(await readLocalProjectRoot(rootDir), []);
});

test("local Projects root must be a real directory", async (context) => {
  const realRoot = await createRoot();
  context.after(() => rm(realRoot, { recursive: true, force: true }));
  const projectsRoot = join(realRoot, "src/projects");
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(join(projectsRoot, "zeta-story"));
  await mkdir(join(projectsRoot, "alpha-story"));

  assert.deepEqual(
    (await readLocalProjectRoot(realRoot)).map(({ name }) => name),
    ["alpha-story", "zeta-story"],
  );

  const symlinkRoot = await createRoot();
  context.after(() => rm(symlinkRoot, { recursive: true, force: true }));
  await mkdir(join(symlinkRoot, "src"), { recursive: true });
  await symlink(projectsRoot, join(symlinkRoot, "src/projects"));
  await assert.rejects(
    () => readLocalProjectRoot(symlinkRoot),
    /real directory/,
  );

  const fileRoot = await createRoot();
  context.after(() => rm(fileRoot, { recursive: true, force: true }));
  await mkdir(join(fileRoot, "src"), { recursive: true });
  await writeFile(join(fileRoot, "src/projects"), "not a directory\n");
  await assert.rejects(() => readLocalProjectRoot(fileRoot), /real directory/);
});
