import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ProjectCreateInputSchema,
  VISUAL_THEME_PRESETS,
} from "@axmorf/studio/contracts";
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
  assert.deepEqual(
    context.example.visualStyle.theme,
    VISUAL_THEME_PRESETS.dark,
  );
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
    context.agentHandoff.nextAction,
    "report-to-user-before-project-create",
  );
  assert.match(context.agentHandoff.summary, /exampleTarget=30s/u);
  assert.match(context.agentHandoff.summary, /availableNarrated=/u);
  assert.match(
    context.agentHandoff.instruction,
    /Before running project:create/u,
  );
  assert.match(
    context.agentHandoff.instruction,
    /intermediate progress message/u,
  );
  assert.match(context.agentHandoff.instruction, /not a final answer/u);
  assert.match(
    context.agentHandoff.instruction,
    /same turn[\s\S]*nextCommand/u,
  );
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
  assert.equal(Object.hasOwn(example.render, "width"), false);
  assert.deepEqual(context.fieldExamples.render, {
    ...example.render,
    width: 1920,
    height: 1080,
  });
  const landscapeInput = ProjectCreateInputSchema.parse({
    ...example,
    render: context.fieldExamples.render,
  });
  assert.equal(landscapeInput.render.width, 1920);
  assert.match(context.agentHandoff.instruction, /render\.width/u);
  assert.doesNotMatch(example.brief.deliveryConstraints.join(" "), /竖屏/u);
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
  await writeFile(inputPath, JSON.stringify(landscapeInput));
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
  assert.ok("render" in result);
  assert.equal(result.render.width, 1920);
  assert.equal(result.render.height, 1080);
  assert.equal(result.render.fps, context.renderDefaults.fps);
  assert.match(result.agentHandoff.instruction, /before.*provider/iu);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(fixture.rootDir, "src/projects/fresh-video/render.json"),
        "utf8",
      ),
    ),
    result.render,
  );
  assert.equal(await readFile(configPath, "utf8"), before);
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

test("create context includes a complete visual-first example with authored frame and boundary budgeting", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const configBefore = await readFile(fixture.configPath);
  const result = await inspectProjectCreateContext({
    rootDir: fixture.rootDir,
    storyId: "visual-explanation",
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  const visual = ProjectCreateInputSchema.parse(
    result.fieldExamples.visualFirst,
  );
  assert.ok(visual.story.beats.every((beat) => beat.kind === "visual-scene"));
  assert.ok(
    result.example.story.beats.every((beat) => beat.kind === "narrated-scene"),
  );
  assert.ok(visual.story.beats.every((beat) => !("ttsChunks" in beat)));
  const frames = visual.story.beats.reduce(
    (total, beat) =>
      total + (beat.kind === "visual-scene" ? beat.durationInFrames : 0),
    0,
  );
  assert.equal(
    frames / result.renderDefaults.fps + result.durationBudget.boundarySeconds,
    visual.brief.targetDurationSeconds,
  );
  assert.equal(Object.hasOwn(visual, "sceneTemplates"), false);
  assert.equal(Object.hasOwn(visual.render, "fps"), false);
  assert.match(result.agentHandoff.instruction, /fieldExamples\.visualFirst/u);
  assert.match(result.guidance.join(" "), /visible mechanism/u);
  assert.match(result.guidance.join(" "), /SVG, Canvas, spatial geometry/u);
  assert.match(result.guidance.join(" "), /illustrative, not a template/u);
  assert.deepEqual(await readFile(fixture.configPath), configBefore);
  assert.deepEqual(await readdir(join(fixture.rootDir, "src/projects")), []);
});
