import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertIsolatedMatrixRoot,
  selectDeletionTarget,
} from "../../scripts/architecture/project-deletion-matrix";

test("deletion matrix rejects repository and broad roots", () => {
  for (const unsafe of ["/", tmpdir(), process.cwd()]) {
    assert.throws(() => assertIsolatedMatrixRoot(unsafe));
  }
  assert.doesNotThrow(() =>
    assertIsolatedMatrixRoot(
      join(tmpdir(), "rsp-project-deletion-case-a-123456"),
    ),
  );
});

test("deletion target is discovered from current Project contracts", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-project-deletion-selection-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  for (const projectId of ["zeta-story", "alpha-story"]) {
    const projectRoot = join(rootDir, "src/projects", projectId);
    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      join(projectRoot, "Composition.tsx"),
      "export default 1;\n",
    );
  }
  await writeFile(
    join(rootDir, "src/projects/zeta-story/verification.profile.json"),
    "{}\n",
  );
  assert.equal(await selectDeletionTarget(rootDir), "zeta-story");
});
