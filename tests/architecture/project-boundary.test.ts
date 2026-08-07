import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  collectDefaultCheckScripts,
  findCentralProjectOwnershipViolations,
  findCoreProjectImportViolations,
  findDefaultCheckArtifactViolations,
} from "../../scripts/architecture/project-boundary";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const write = async (rootDir: string, path: string, source = "") => {
  const destination = join(rootDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, source);
};

test("core import analysis rejects concrete Project and project-tool dependencies", async (context) => {
  const rootDir = await createRoot(context);
  await write(
    rootDir,
    "src/contracts/bad.ts",
    'import "../projects/alpha-story/Composition";\n',
  );
  await write(
    rootDir,
    "scripts/production/bad.ts",
    'import "../project-tools/alpha-story/check";\n',
  );

  assert.deepEqual(await findCoreProjectImportViolations(rootDir), [
    "scripts/production/bad.ts -> scripts/project-tools/alpha-story/check",
    "src/contracts/bad.ts -> src/projects/alpha-story/Composition",
  ]);
});

test("default check graph rejects concrete IDs and media-only artifacts", () => {
  const scripts = {
    check: "npm run check:static && npm run check:host",
    "check:static": "npm test && npm run registry:check",
    "check:host":
      "npm run compositions && node verify.ts --project alpha-story && npm run media:evidence",
    "media:evidence": "node evidence.ts out/alpha-story/review.mp4",
  };

  assert.deepEqual(collectDefaultCheckScripts(scripts), [
    "check",
    "check:host",
    "check:static",
    "compositions",
    "media:evidence",
    "registry:check",
    "test",
  ]);
  assert.deepEqual(findDefaultCheckArtifactViolations(scripts), [
    "check:host: concrete --project argument",
    "media:evidence: media/evidence dependency",
  ]);
});

test("central project-owned tests and tools are structural violations", async (context) => {
  const rootDir = await createRoot(context);
  await write(rootDir, "scripts/project-tools/alpha-story/check.ts");
  await write(rootDir, "tests/alpha-story/render.test.ts");
  await write(rootDir, "src/projects/alpha-story/tests/render.test.ts");
  await write(rootDir, "src/projects/alpha-story/tools/verification/check.ts");

  assert.deepEqual(await findCentralProjectOwnershipViolations(rootDir), [
    "scripts/project-tools/alpha-story/check.ts",
    "tests/alpha-story/render.test.ts",
  ]);
});
