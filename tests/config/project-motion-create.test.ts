import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  AuthoringRequirementsSchema,
  SCENE_MOTION_REQUIREMENT_ID,
} from "@axmorf/studio/contracts";
import { createProject } from "../../scripts/projects/application/create-project";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
} from "../fixtures/project-create";

test("A fresh Project freezes the reusable motion requirement, remains idempotent and exposes the state API", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const args = {
    rootDir: fixture.rootDir,
    projectId: validProjectCreateInput.storyId,
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    runtimeResources: fixture.runtimeResources,
  };
  const created = await createProject(args);
  assert.equal(created.status, "project-created");
  const requirementsPath = join(
    fixture.rootDir,
    "src/projects",
    validProjectCreateInput.storyId,
    "production/requirements.json",
  );
  const before = await readFile(requirementsPath, "utf8");
  const requirements = AuthoringRequirementsSchema.parse(JSON.parse(before));
  const rule = requirements.additionalRequirements.find(
    (r) => r.requirementId === SCENE_MOTION_REQUIREMENT_ID,
  );
  assert.equal(rule?.owner, "scene-agent");
  assert.equal(rule?.severity, "error");
  const facade = await readFile(
    join(fixture.rootDir, "src/runtime/capabilities.ts"),
    "utf8",
  );
  assert.match(facade, /ProducerMotionObject/u);
  assert.match(facade, /resolveSceneMotionObjectState/u);
  const current = await createProject(args);
  assert.equal(current.status, "project-create-current");
  assert.equal(await readFile(requirementsPath, "utf8"), before);
});
