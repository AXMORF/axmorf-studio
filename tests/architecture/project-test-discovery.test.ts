import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  discoverRepositoryTests,
  PROJECT_TEST_RUNNER_ID,
} from "../../scripts/tests/project-tests";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-tests-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const write = async (rootDir: string, path: string) => {
  const destination = join(rootDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, "export {};\n");
};

test("test discovery combines fixed core roots with current Project-owned tests", async (context) => {
  const rootDir = await createRoot(context);
  await write(rootDir, "tests/contracts/core.test.ts");
  await write(rootDir, "tests/contracts/helper.ts");
  await write(rootDir, "src/projects/zeta-story/tests/zeta.test.tsx");
  await write(rootDir, "src/projects/alpha-story/tests/alpha.test.ts");
  await write(rootDir, "src/projects/alpha-story/tests/final-evidence.test.ts");
  await write(rootDir, "src/projects/alpha-story/tests/approval.test.ts");
  await write(rootDir, "src/projects/alpha-story/tests/review.media.test.ts");

  assert.equal(PROJECT_TEST_RUNNER_ID, "project-test-runner-v2");
  assert.deepEqual(await discoverRepositoryTests(rootDir), [
    "tests/contracts/core.test.ts",
    "src/projects/alpha-story/tests/alpha.test.ts",
    "src/projects/zeta-story/tests/zeta.test.tsx",
  ]);
  assert.deepEqual(await discoverRepositoryTests(rootDir, "media"), [
    "src/projects/alpha-story/tests/approval.test.ts",
    "src/projects/alpha-story/tests/final-evidence.test.ts",
    "src/projects/alpha-story/tests/review.media.test.ts",
  ]);
  assert.deepEqual(await discoverRepositoryTests(rootDir, "all"), [
    "tests/contracts/core.test.ts",
    "src/projects/alpha-story/tests/alpha.test.ts",
    "src/projects/alpha-story/tests/approval.test.ts",
    "src/projects/alpha-story/tests/final-evidence.test.ts",
    "src/projects/alpha-story/tests/review.media.test.ts",
    "src/projects/zeta-story/tests/zeta.test.tsx",
  ]);
});

test("zero Project test directories are valid", async (context) => {
  const rootDir = await createRoot(context);
  await write(rootDir, "tests/runtime/core.test.tsx");
  assert.deepEqual(await discoverRepositoryTests(rootDir), [
    "tests/runtime/core.test.tsx",
  ]);
});
