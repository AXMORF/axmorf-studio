import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  buildSilentScenePreset,
  StoryResourcePoolSchema,
} from "@axmorf/studio/contracts";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { prepareNarrationInputs } from "../../scripts/project-production/application/prepare-fixed-tasks";
import { buildTaskExecutionContract } from "../../scripts/project-production/application/task-execution-contract";
import { loadProjectProductionInputs } from "../../scripts/project-production/application/load-inputs";
import { capabilityDescriptorDeclarations } from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  writeProjectCreateJson,
} from "../fixtures/project-create";

for (const mode of ["default", "explicit"] as const) {
  test(`new authored film ${mode} capability access reaches Scene inputs without changing mandatory preset resources`, async (t) => {
    const fixture = await prepareProjectCreateFixture();
    t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
    const scene = validProjectCreateInput.scenes[0];
    await writeProjectCreateJson(fixture.inputPath, {
      ...validProjectCreateInput,
      resources: {
        ...validProjectCreateInput.resources,
        ...(mode === "explicit" ? { capabilityAccess: "explicit" } : {}),
      },
      story: {
        ...validProjectCreateInput.story,
        timingSource: "authored-frames",
        beats: [
          {
            kind: "silent-scene",
            meaningId: scene.meaningId,
            narrativePurpose: "Show a causal action.",
            preset: buildSilentScenePreset({
              presetId: "authored-action",
              durationInFrames: 120,
              visualIntent: scene.visualIntent,
              soundIntent: scene.soundIntent,
              resourceIds: [],
              implementation: { kind: "scene-owner" },
            }),
          },
        ],
      },
    });
    const args = {
      ...fixture,
      projectId: validProjectCreateInput.storyId,
      env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    };
    await createProject(args);
    const pool = StoryResourcePoolSchema.parse(
      JSON.parse(
        await readFile(
          join(
            fixture.rootDir,
            "src/projects/story-example/production/story-resource-pool.json",
          ),
          "utf8",
        ),
      ),
    );
    const expected =
      mode === "default"
        ? capabilityDescriptorDeclarations.map(({ id }) => id).sort()
        : [];
    assert.deepEqual(pool.optionalCapabilityIds ?? [], expected);
    assert.deepEqual(pool.allowedResourceIds, expected);
    await prepareNarrationInputs({
      rootDir: fixture.rootDir,
      projectId: args.projectId,
      env: args.env,
    });
    await projectPendingSceneAuthoring({
      rootDir: fixture.rootDir,
      projectId: args.projectId,
    });
    const policyPath = "scripts/project-production/application/load-inputs.ts";
    const runtimePolicyManifest = buildRuntimePolicyManifest({
      packageVersion: "0.1.21",
      files: [
        {
          logicalPath: policyPath,
          bytes: await readFile(join(import.meta.dirname, "../..", policyPath)),
          scopes: ["composition", "delivery", "global-visual", "scene"],
        },
      ],
    });
    for (const [file, contents] of [
      ["package.json", "{}"],
      ["package-lock.json", "{}"],
      ["remotion.config.mjs", "export {};"],
    ])
      await writeFile(join(fixture.rootDir, file), contents);
    const inputs = await loadProjectProductionInputs({
      rootDir: fixture.rootDir,
      projectId: args.projectId,
      runtimePolicyManifest,
    });
    const owner = inputs.sceneInputs.find(
      ({ taskInput }) => taskInput.meaningId === scene.meaningId,
    )!;
    assert.doesNotThrow(() =>
      buildTaskExecutionContract({
        taskKind: "scene-owner",
        context: { scene: { ...owner, visualStyle: inputs.visualStyle } },
      }),
    );
    assert.deepEqual(owner.taskInput.allowedResourceIds, expected);
    assert.deepEqual(owner.taskInput.optionalCapabilityIds ?? [], expected);
    assert.deepEqual(
      owner.availableResources.map(({ selected }) => selected.resourceId),
      expected,
    );
    assert.deepEqual(owner.brief.candidateResourceIds, []);
    assert.equal(owner.taskInput.storyBeat.kind, "silent-scene");
    if (owner.taskInput.storyBeat.kind === "silent-scene")
      assert.deepEqual(owner.taskInput.storyBeat.preset.resourceIds, []);
  });
}
