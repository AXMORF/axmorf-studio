import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  TaskExecutionContractSchema,
  buildSilentScenePreset,
} from "@axmorf/studio/contracts";
import { commitTaskArtifact } from "../../scripts/project-production/adapters/artifact-store";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  buildAuthoredSemanticTimingTask,
  buildCurrentProductionPlan,
} from "../../scripts/project-production/application/build-current-plan";
import { buildCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { finalizeAgentTaskWorkspace } from "../../scripts/project-production/application/finalize-agent-task";
import { loadProjectProductionInputs } from "../../scripts/project-production/application/load-inputs";
import {
  ensureFixedTaskArtifact,
  prepareNarrationInputs,
} from "../../scripts/project-production/application/prepare-fixed-tasks";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const repositoryRoot = join(import.meta.dirname, "../..");

// Synthetic engineering evidence; no production attempt, provider or existing
// user Project is involved. Every seeded owner passes the actual fixed checker.
export const createReadyPreviewFixture = async ({
  insideRepository = false,
  grouped = true,
  audioChannels = 2,
}: {
  readonly insideRepository?: boolean;
  readonly grouped?: boolean;
  readonly audioChannels?: 1 | 2;
} = {}) => {
  const fixture = await prepareProjectCreateFixture();
  let rootDir = fixture.rootDir;
  if (insideRepository) {
    await mkdir(join(repositoryRoot, "out"), { recursive: true });
    rootDir = await mkdtemp(join(repositoryRoot, "out/.preview-proof-"));
    await cp(fixture.rootDir, rootDir, { recursive: true });
    await rm(fixture.rootDir, { recursive: true, force: true });
  }
  const dispose = () => rm(rootDir, { recursive: true, force: true });
  try {
    await cp(join(repositoryRoot, "scripts"), join(rootDir, "scripts"), {
      recursive: true,
    });
    for (const path of ["contracts", "remotion"])
      await cp(
        join(repositoryRoot, "packages/studio/src", path),
        join(rootDir, "src", path),
        {
          recursive: true,
        },
      );
    for (const path of [
      "src/index.css",
      "package.json",
      "package-lock.json",
      "remotion.config.ts",
    ]) {
      await mkdir(dirname(join(rootDir, path)), { recursive: true });
      await cp(join(repositoryRoot, path), join(rootDir, path));
    }
    if (insideRepository) {
      // Host render proofs must use current source, independently of a package
      // build running in another agent. Ordinary fixture checks need no browser.
      const configPath = join(rootDir, "remotion.config.ts");
      const currentConfig = await readFile(configPath, "utf8");
      const returnAnchor = "    ...withTailwind,";
      if (!currentConfig.includes(returnAnchor)) {
        throw new Error(
          "Synthetic preview config has no Webpack return anchor.",
        );
      }
      await writeFile(
        configPath,
        currentConfig.replace(
          returnAnchor,
          `${returnAnchor}
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        "@axmorf/studio/contracts$": ${JSON.stringify(join(repositoryRoot, "packages/studio/src/contracts.ts"))},
        "@axmorf/studio/remotion$": ${JSON.stringify(join(repositoryRoot, "packages/studio/src/remotion.ts"))},
      },
    },`,
        ),
      );
    }
    const compiler = JSON.parse(
      await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
    ) as { compilerOptions: Record<string, unknown> };
    compiler.compilerOptions.baseUrl = repositoryRoot;
    compiler.compilerOptions.paths = {
      ...(compiler.compilerOptions.paths as Record<string, string[]>),
      remotion: [
        join(repositoryRoot, "node_modules/remotion/dist/cjs/index.d.ts"),
      ],
      zod: [join(repositoryRoot, "node_modules/zod/index.d.cts")],
      react: [join(repositoryRoot, "node_modules/@types/react/index.d.ts")],
      "react/jsx-runtime": [
        join(repositoryRoot, "node_modules/@types/react/jsx-runtime.d.ts"),
      ],
    };
    await writeProjectCreateJson(join(rootDir, "tsconfig.json"), compiler);

    const meaningIds = ["opening", "change"];
    const storyId = validProjectCreateInput.storyId;
    const inputPath = join(rootDir, "inputs/project-create.json");
    await writeProducerConfig({
      configPath: join(rootDir, "operator/producer.config.json"),
      value: {
        ...validProjectCreateProducerConfig,
        readability: { edgeInsetPx: 16 },
      },
    });
    await writeProjectCreateJson(inputPath, {
      ...validProjectCreateInput,
      brief: {
        ...validProjectCreateInput.brief,
        title: "Synthetic continuous draft",
        targetDurationSeconds: 1,
      },
      story: {
        schemaVersion: 3,
        storyId,
        title: "Synthetic continuous draft",
        timingSource: "authored-frames",
        beats: meaningIds.map((meaningId) => ({
          kind: "silent-scene",
          meaningId,
          narrativePurpose: `Express ${meaningId} through one moving subject.`,
          preset: buildSilentScenePreset({
            presetId: meaningId,
            durationInFrames: 6,
            visualIntent: "A moving marker retains its world position.",
            soundIntent: "No narration or sound effects.",
            resourceIds: [],
            implementation: { kind: "scene-owner" },
          }),
        })),
        ...(grouped ? { visualScenes: [{ meaningIds }] } : {}),
      },
      scenes: meaningIds.map((meaningId) => ({
        ...validProjectCreateInput.scenes[0],
        meaningId,
        visualIntent: "A moving marker retains its world position.",
        soundIntent: "No narration or sound effects.",
      })),
      render: {
        ...validProjectCreateInput.render,
        width: 640,
        height: 360,
        audioChannels,
        leadInFrames: 0,
        tailFrames: 0,
      },
      publishing: { ...validProjectCreateInput.publishing, chapters: [] },
    });
    await createProject({
      rootDir,
      projectId: storyId,
      inputPath,
      env: {
        RSP_PRODUCER_CONFIG: join(rootDir, "operator/producer.config.json"),
      },
      runtimeResources: fixture.runtimeResources,
    });
    const narration = await prepareNarrationInputs({
      rootDir,
      projectId: storyId,
      env: { RSP_PRODUCER_CONFIG: "/missing/no-provider-configuration.json" },
    });
    await projectPendingSceneAuthoring({ rootDir, projectId: storyId });
    const inputs = await loadProjectProductionInputs({
      rootDir,
      projectId: storyId,
    });
    const revision = buildCurrentProductionRevision(inputs);
    const timing = buildAuthoredSemanticTimingTask({
      inputs,
      revisionId: revision.revisionId,
    });
    await ensureFixedTaskArtifact({
      rootDir,
      task: timing.task,
      files: {
        "inputs/context.json": timing.contextBytes,
        "project/generated/semantic-timing.generated.json":
          narration.semanticTimingBytes,
      },
    });
    const planned = await buildCurrentProductionPlan({
      rootDir,
      projectId: storyId,
      inputs,
      narration,
      baseline: null,
    });
    for (const seed of planned.taskSeeds.values()) {
      const contract = TaskExecutionContractSchema.parse(
        JSON.parse(seed.taskContractBytes!),
      );
      const workspace = await createTaskWorkspace({
        rootDir,
        task: seed.task,
        seedFiles: {
          "inputs/context.json": seed.contextBytes,
          "inputs/task-contract.json": seed.taskContractBytes!,
        },
      });
      for (const output of contract.outputs) {
        const path = join(workspace, output.path);
        await mkdir(dirname(path), { recursive: true });
        let bytes =
          output.format === "json"
            ? `${JSON.stringify(output.example)}\n`
            : String(output.example);
        if (
          seed.task.taskKind === "scene-owner" &&
          output.path === "src/Renderer.tsx"
        ) {
          bytes = `import type {SceneRendererProps} from "@axmorf/studio/remotion";
const Renderer = ({sceneFrame, viewportWidth, viewportHeight}: SceneRendererProps) => <div style={{position: "absolute", left: sceneFrame * 4, top: viewportHeight / 3, width: viewportWidth / 8, height: viewportHeight / 8, backgroundColor: "#fbbf24"}} />;
export default Renderer;
`;
        }
        await writeFile(path, bytes);
      }
      await finalizeAgentTaskWorkspace({
        rootDir,
        taskRevision: seed.task.taskRevision,
      });
      await commitTaskArtifact({ rootDir, task: seed.task, workspace });
    }
    return { rootDir, storyId, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
};
