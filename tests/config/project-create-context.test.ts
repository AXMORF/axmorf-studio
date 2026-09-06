import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ProjectCreateInputSchema } from "@axmorf/studio/contracts";
import { inspectProjectCreateContext } from "../../scripts/projects/application/project-create-context";
import { runProjectCreateCli } from "../../scripts/projects/create";
import {
  prepareProjectCreateFixture,
  projectCreateRuntimeResources,
} from "../fixtures/project-create";

test("create context supplies a usable example from current public choices without private data or writes", async (t) => {
  const fixture = await prepareProjectCreateFixture();
  t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const configPath = fixture.configPath;
  const env = { RSP_PRODUCER_CONFIG: configPath };
  const before = await readFile(configPath, "utf8");
  const entries = await readdir(join(fixture.rootDir, "src/projects"));
  const context = await inspectProjectCreateContext({
    rootDir: fixture.rootDir,
    storyId: "fresh-video",
    env,
  });
  assert.equal(context.status, "project-create-context");
  const example = ProjectCreateInputSchema.parse(context.example);
  assert.equal(example.storyId, "fresh-video");
  assert.equal(example.publishing.collectionId, "ai-workflow");
  assert.ok(
    context.styleProfiles.some(
      (style) => style.styleProfileId === example.visualStyle.styleProfileId,
    ),
  );
  assert.equal(Object.hasOwn(example, "sceneTemplates"), false);
  assert.doesNotMatch(
    JSON.stringify(context),
    /visible-editable-token|127\.0\.0\.1|referenceAudioPath/,
  );
  assert.equal(await readFile(configPath, "utf8"), before);
  assert.deepEqual(
    await readdir(join(fixture.rootDir, "src/projects")),
    entries,
  );
  const inputPath = join(fixture.rootDir, "input.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(inputPath, JSON.stringify(example));
  const result = await runProjectCreateCli(
    ["--project", "fresh-video", "--input", "input.json"],
    {
      rootDir: fixture.rootDir,
      env,
      stdout: () => undefined,
      runtimeResources: {
        ...projectCreateRuntimeResources,
        packageRoot: "unused",
        packageVersion: "0.0.0-test",
        assetsRoot: "unused",
        policyManifestPath: "unused",
        remotionPreflightEntry: "unused",
        workspaceSeedRoot: "unused",
        webRoot: "unused",
      },
    },
  );
  assert.equal(result.status, "project-created");
});

test("create help and input schema are read-only and require no configured provider", async () => {
  const output: string[] = [];
  const context = {
    rootDir: "/missing-workspace",
    env: {},
    stdout: (line: string) => output.push(line),
    runtimeResources: {
      ...projectCreateRuntimeResources,
      packageRoot: "unused",
      packageVersion: "0.0.0-test",
      assetsRoot: "unused",
      policyManifestPath: "unused",
      remotionPreflightEntry: "unused",
      workspaceSeedRoot: "unused",
      webRoot: "unused",
    },
  };
  await runProjectCreateCli(["--help"], context);
  assert.match(output.pop() ?? "", /project:create:context/);
  await runProjectCreateCli(["--schema"], context);
  const schema = JSON.parse(output.pop() ?? "");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("story"));
});
