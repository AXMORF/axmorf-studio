import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import { resolveProjectVerificationInvocation } from "../../scripts/project-validation/adapters";
import {
  loadProjectVerificationProfiles,
  parseProjectValidationArgs,
  parseProjectVerificationProfile,
  resolveProfileSteps,
} from "../../scripts/project-validation/profiles";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-profiles-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  return rootDir;
};

const writeProfile = async ({
  rootDir,
  projectId,
  steps,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly steps: readonly string[];
}) => {
  const path = join(
    rootDir,
    "src/projects",
    projectId,
    "verification.profile.json",
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileVersion: "project-verification-v2",
        steps,
      },
      null,
      2,
    )}\n`,
  );
  return dirname(path);
};

test("verification profiles are Project-owned, sorted, and removable", async (context) => {
  const rootDir = await createRoot(context);
  await writeProfile({
    rootDir,
    projectId: "zeta-story",
    steps: ["narrative", "final"],
  });
  const alpha = await writeProfile({
    rootDir,
    projectId: "alpha-story",
    steps: ["narrative", "scene-audio", "final"],
  });

  const profiles = await loadProjectVerificationProfiles(rootDir);
  assert.deepEqual(
    profiles.projects.map(({ projectId }) => projectId),
    ["alpha-story", "zeta-story"],
  );
  assert.deepEqual(resolveProfileSteps(profiles, "alpha-story", "source"), [
    "narrative",
    "scene-audio",
    "final",
  ]);
  assert.deepEqual(resolveProfileSteps(profiles, "alpha-story", "evidence"), [
    "narrative",
  ]);

  await rm(alpha, { recursive: true });
  assert.deepEqual(
    (await loadProjectVerificationProfiles(rootDir)).projects.map(
      ({ projectId }) => projectId,
    ),
    ["zeta-story"],
  );
});

test("zero Project verification profiles are valid", async (context) => {
  const rootDir = await createRoot(context);
  assert.deepEqual(await loadProjectVerificationProfiles(rootDir), {
    profileVersion: "project-verification-v2",
    projects: [],
  });
});

test("profile data permits fixed step IDs but rejects paths and commands", () => {
  assert.deepEqual(
    parseProjectVerificationProfile({
      schemaVersion: 1,
      profileVersion: "project-verification-v2",
      steps: ["narrative", "final"],
    }).steps,
    ["narrative", "final"],
  );
  for (const forbidden of [
    { script: "./check.ts" },
    { command: "node check.ts" },
    { modulePath: "./check.ts" },
  ]) {
    assert.throws(() =>
      parseProjectVerificationProfile({
        schemaVersion: 1,
        profileVersion: "project-verification-v2",
        steps: ["narrative", "final"],
        ...forbidden,
      }),
    );
  }
});

test("project validation CLI accepts explicit source scope", () => {
  assert.deepEqual(parseProjectValidationArgs(["--all", "--scope", "source"]), {
    target: "all",
    scope: "source",
  });
  assert.deepEqual(
    parseProjectValidationArgs(["evidence", "--project", "alpha-story"]),
    { target: "alpha-story", scope: "evidence" },
  );
  assert.throws(() =>
    parseProjectValidationArgs([
      "--project",
      "alpha-story",
      "--scope",
      "repair",
    ]),
  );
});

test("project-specific adapters resolve only inside the requested Project", () => {
  const projectId = "alpha-story";
  const invocation = resolveProjectVerificationInvocation({
    projectId,
    step: "scene-audio",
  });
  assert.equal(
    invocation.script,
    "src/projects/alpha-story/tools/verification/scene-audio.ts",
  );

  const common = resolveProjectVerificationInvocation({
    projectId: "synthetic-story",
    step: "narrative",
    scope: "source",
  });
  assert.equal(common.script, "scripts/project-check/cli.ts");
  assert.deepEqual(common.args, [
    "--project",
    "synthetic-story",
    "--level",
    "narrative",
    "--scope",
    "source",
  ]);
});
