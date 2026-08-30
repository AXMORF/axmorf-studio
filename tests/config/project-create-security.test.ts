import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createProject as createProjectApplication } from "../../scripts/projects/application/create-project";
import {
  prepareProjectCreateFixture,
  projectCreateRuntimeResources,
  validProjectCreateInput,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const createProject = (
  input: Omit<
    Parameters<typeof createProjectApplication>[0],
    "runtimeResources"
  >,
) =>
  createProjectApplication({
    ...input,
    runtimeResources: projectCreateRuntimeResources,
  });

const requestFor = (
  fixture: Awaited<ReturnType<typeof prepareProjectCreateFixture>>,
) => ({
  rootDir: fixture.rootDir,
  projectId: "story-example",
  inputPath: fixture.inputPath,
  env: { RSP_PRODUCER_CONFIG: fixture.configPath },
});

test("project:create rejects symlinked input and leaves its external target untouched", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const external = join(fixture.rootDir, "external-input.json");
  const linked = join(fixture.rootDir, "inputs/linked.json");
  await writeProjectCreateJson(external, validProjectCreateInput);
  await symlink(external, linked);
  const before = await readFile(external);

  await assert.rejects(
    createProject({ ...requestFor(fixture), inputPath: linked }),
    /regular non-symbolic file/iu,
  );
  assert.deepEqual(await readFile(external), before);
  await assert.rejects(
    stat(join(fixture.rootDir, "src/projects/story-example")),
    { code: "ENOENT" },
  );
});

test("project:create rejects symlinked parent and partial targets", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const outside = join(fixture.rootDir, "outside");
  await mkdir(outside);
  await symlink(outside, join(fixture.rootDir, "inputs-link"));
  const linkedInput = join(fixture.rootDir, "inputs-link/create.json");
  await writeProjectCreateJson(
    join(outside, "create.json"),
    validProjectCreateInput,
  );
  await assert.rejects(
    createProject({ ...requestFor(fixture), inputPath: linkedInput }),
    /directory chain is unsafe/iu,
  );

  await mkdir(join(fixture.rootDir, "src/projects/story-example"));
  await assert.rejects(createProject(requestFor(fixture)), /partial/iu);
  await assert.rejects(
    stat(join(fixture.rootDir, "public/projects/story-example")),
    { code: "ENOENT" },
  );
});

test("project:create rejects cross-story, unknown resource and unknown template without output", async (context) => {
  for (const [name, mutation, pattern] of [
    [
      "cross-story",
      { ...validProjectCreateInput, storyId: "other-story" },
      /one Story|identities differ/iu,
    ],
    [
      "unknown-resource",
      {
        ...validProjectCreateInput,
        resources: {
          ...validProjectCreateInput.resources,
          allowedResourceIds: ["capability.unknown"],
        },
      },
      /unavailable/iu,
    ],
    [
      "unknown-template",
      {
        ...validProjectCreateInput,
        sceneTemplates: {
          introSceneTemplateId: "unknown-template",
          outroSceneTemplateId: null,
        },
      },
      /invalid|unknown|template/iu,
    ],
  ] as const) {
    const fixture = await prepareProjectCreateFixture();
    context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
    await writeProjectCreateJson(fixture.inputPath, mutation);
    await assert.rejects(
      createProject(requestFor(fixture)),
      (error: unknown) => {
        assert.match(String(error), pattern, name);
        return true;
      },
    );
    await assert.rejects(
      stat(join(fixture.rootDir, "src/projects/story-example")),
      { code: "ENOENT" },
    );
    await assert.rejects(
      stat(join(fixture.rootDir, "public/projects/story-example")),
      { code: "ENOENT" },
    );
  }
});

test("project-create-current rejects a symlinked global Catalog without touching its target", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const request = requestFor(fixture);
  await createProject(request);
  const catalogPath = join(
    fixture.rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  const catalogBackup = `${catalogPath}.fixture-backup`;
  const externalCatalog = join(fixture.rootDir, "external-catalog.json");
  await rename(catalogPath, catalogBackup);
  await writeProjectCreateJson(externalCatalog, { external: true });
  await symlink(externalCatalog, catalogPath);
  const externalBefore = await readFile(externalCatalog);
  const sourceBefore = await stat(
    join(
      fixture.rootDir,
      "src/projects/story-example/production/project-create.json",
    ),
  );

  await assert.rejects(
    createProject(request),
    /ResourceCatalog.*regular non-symbolic file|ResourceCatalog.*unsafe/iu,
  );
  assert.deepEqual(await readFile(externalCatalog), externalBefore);
  assert.equal(
    (
      await stat(
        join(
          fixture.rootDir,
          "src/projects/story-example/production/project-create.json",
        ),
      )
    ).mtimeMs,
    sourceBefore.mtimeMs,
  );
});
