import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ProjectCreateInputSchema } from "@axmorf/studio/contracts";
import { inspectProjectCreateContext } from "../../scripts/projects/application/project-create-context";
import { describeCliFailure } from "../../packages/studio/src/cli/failure";
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
  const camera = context.capabilities.find(
    ({ descriptor }) => descriptor.id === "capability.camera",
  );
  assert.ok(camera);
  assert.ok(
    camera.descriptor.kind === "capability" && camera.descriptor.authoring,
  );
  assert.ok(camera.descriptor.authoring.exports.includes("ProducerCamera3D"));
  assert.match(camera.descriptor.authoring.example, /ProducerCamera2D/);
  assert.match(camera.descriptorFingerprint, /^sha256:/);
  assert.ok(
    context.example.resources.allowedResourceIds.some(
      (id) => id === "capability.camera",
    ),
  );
  assert.match(
    context.guidance.join(" "),
    /capabilit.*before.*self-authored/iu,
  );
  assert.equal(context.durationBudget.targetTotalSeconds, 30);
  assert.equal(context.durationBudget.actualTotalSeconds, null);
  assert.equal(
    context.durationBudget.availableNarratedSeconds,
    Math.max(
      0,
      context.durationBudget.targetTotalSeconds -
        context.durationBudget.boundarySeconds,
    ),
  );
  const example = ProjectCreateInputSchema.parse({
    ...context.example,
    production: {
      ...context.example.production,
      additionalRequirements:
        context.fieldExamples["production.additionalRequirements"],
    },
  });
  assert.equal(example.storyId, "fresh-video");
  assert.equal(example.publishing.collectionId, "ai-workflow");
  assert.ok(
    context.styleProfiles.some(
      (style) => style.styleProfileId === example.visualStyle.styleProfileId,
    ),
  );
  assert.equal(Object.hasOwn(example, "sceneTemplates"), false);
  assert.deepEqual(
    example.story.beats.map(({ meaningId }) => meaningId),
    ["stuck-goal", "next-step"],
  );
  assert.match(example.scenes[0].motionIntent, /光点.*回到原地.*旁白/u);
  assert.match(example.scenes[1].motionIntent, /旁白.*橙红线.*光点/u);
  assert.match(example.scenes[1].continuityBrief, /上一 Scene 的光点/u);
  assert.match(
    context.guidance.join(" "),
    /visible subject.*observable change.*resulting state/u,
  );
  assert.match(
    context.guidance.join(" "),
    /do not repeat the example's motif/u,
  );
  assert.doesNotMatch(
    JSON.stringify(context),
    /visible-editable-token|127\.0\.0\.1|referenceAudioPath/,
  );
  assert.equal(await readFile(configPath, "utf8"), before);
  assert.deepEqual(
    await readdir(join(fixture.rootDir, "src/projects")),
    entries,
  );
  const invalidInputPath = join(fixture.rootDir, "invalid.json");
  const { writeFile: writeInvalid } = await import("node:fs/promises");
  await writeInvalid(
    invalidInputPath,
    JSON.stringify({
      ...example,
      production: {
        ...example.production,
        additionalRequirements: ["keep the disclaimer"],
      },
    }),
  );
  await assert.rejects(
    () =>
      runProjectCreateCli(
        ["--project", "fresh-video", "--input", "invalid.json"],
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
      ),
    (error: unknown) =>
      describeCliFailure(error).code === "schema-validation-failed",
  );
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
