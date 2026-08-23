import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "../../src/contracts";
import { checkSceneTask } from "../../scripts/project-production/application/scene-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  createProductionLocations,
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
  type ProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const rendererSource = `
import type {SceneRendererProps} from "../../../../remotion/runtime/story-visual/types";
const Renderer = ({viewportWidth, viewportHeight}: SceneRendererProps) => <div style={{width: viewportWidth, height: viewportHeight}} />;
export default Renderer;
`;

const legacyRendererSource = `
import type {SceneRendererProps} from "../../../../remotion/runtime/story-visual/types";
const SceneBackground = () => <div />;
const SceneContentFrame = (_props: {children?: any; policy: unknown}) => <div />;
const Renderer = ({readabilityPolicy}: SceneRendererProps & {readabilityPolicy?: unknown}) => (
  <>
    <SceneBackground />
    <SceneContentFrame policy={readabilityPolicy}><div /></SceneContentFrame>
  </>
);
export default Renderer;
`;

const fullFrameRendererSource = `
import {useVideoConfig} from "remotion";
const Renderer = () => {
  const {width, height} = useVideoConfig();
  return <div style={{width, height}} />;
};
export default Renderer;
`;

const createSceneWorkspace = async ({
  rootDir,
  semanticId = "meaning-one",
  locations: explicitLocations,
}: {
  readonly rootDir: string;
  readonly semanticId?: string;
  readonly locations?: ProductionLocations;
}) => {
  const locations =
    explicitLocations ??
    createProductionLocations({
      ...createRepositoryProductionLocations({ repositoryRoot: rootDir }),
      runtimeResources: join(import.meta.dirname, "../.."),
    });
  const fixture = createScenePackageInput();
  const context = `${JSON.stringify({
    scene: { taskInput: fixture.task },
  })}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: checksum(context) },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      "src/Renderer.tsx",
      "src/generated/reference-fidelity.generated.json",
      "src/selected-resources.json",
      "src/shot-plan.json",
      "src/shot-recipe-selection.json",
      "src/sound-plan.json",
      "src/sync-anchors.json",
      "src/visual-plan.json",
    ],
    validatorPolicyVersion: "scene-owner-validator-v2",
  });
  const workspace = await createTaskWorkspace({
    locations,
    task,
    seedFiles: { "inputs/context.json": context },
  });
  const outputs: Readonly<Record<string, unknown>> = {
    "src/generated/reference-fidelity.generated.json": fixture.fidelityReceipt,
    "src/selected-resources.json": {
      schemaVersion: 1,
      selectedResources: fixture.selectedResources,
    },
    "src/shot-plan.json": fixture.shots,
    "src/shot-recipe-selection.json": fixture.selection,
    "src/sound-plan.json": fixture.sound,
    "src/sync-anchors.json": fixture.anchors,
    "src/visual-plan.json": fixture.visual,
  };
  await mkdir(join(workspace, "src/generated"), { recursive: true });
  await writeFile(join(workspace, "src/Renderer.tsx"), rendererSource);
  for (const [logicalPath, value] of Object.entries(outputs)) {
    const destination = join(workspace, logicalPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value)}\n`);
  }
  return { locations, task, workspace } as const;
};

test("Scene task accepts the complete Renderer and plan bundle, then rejects malformed JSON", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task, workspace } = await createSceneWorkspace({
    rootDir,
  });

  assert.equal(
    (await checkSceneTask({ locations, taskRevision: task.taskRevision }))
      .status,
    "task-workspace-valid",
  );

  await writeFile(join(workspace, "src/visual-plan.json"), "{not-json\n");
  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /JSON|Unexpected|property name/iu,
  );
});

test("Scene task rejects a context bound to another meaningId", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-cross-bound-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createSceneWorkspace({
    rootDir,
    semanticId: "meaning-two",
  });

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /cross-bound/u,
  );
});

test("Scene task rejects an unresolved Renderer import graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-compile-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task, workspace } = await createSceneWorkspace({
    rootDir,
  });
  await writeFile(
    join(workspace, "src/Renderer.tsx"),
    `${rendererSource}\nimport {missingRendererDependency} from "./missing-renderer-dependency";\nvoid missingRendererDependency;\n`,
  );

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /Scene task compile failed/u,
  );
});

test("Scene task reads compiler sources only from the explicit Workspace Runtime Pack", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-runtime-pack-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const runtimeResources = join(rootDir, "runtime-pack");
  await mkdir(
    join(runtimeResources, "source/src/remotion/runtime/story-visual"),
    { recursive: true },
  );
  await writeFile(
    join(runtimeResources, "source/tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Preserve",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
      },
    })}\n`,
  );
  await writeFile(
    join(runtimeResources, "source/src/remotion/runtime/story-visual/types.ts"),
    "export type SceneRendererComponent = ;\n",
  );
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "application-support"),
    runtimeResources,
    cacheRoot: join(rootDir, "cache"),
  });
  const { task } = await createSceneWorkspace({
    rootDir,
    locations,
  });

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /Scene task compile failed \(TS1110(?:,|\))/u,
  );
});

test("Scene task rejects the removed Scene-owned readability boundary", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-legacy-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task, workspace } = await createSceneWorkspace({
    rootDir,
  });
  await writeFile(join(workspace, "src/Renderer.tsx"), legacyRendererSource);

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /must not own SceneBackground/u,
  );
});

test("Scene task rejects access to Composition dimensions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-full-frame-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task, workspace } = await createSceneWorkspace({
    rootDir,
  });
  await writeFile(join(workspace, "src/Renderer.tsx"), fullFrameRendererSource);

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /must not own useVideoConfig/u,
  );
});

test("Scene task rejects a Renderer that narrows the shared StoryBeat contract", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-scene-component-contract-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task, workspace } = await createSceneWorkspace({
    rootDir,
  });
  await writeFile(
    join(workspace, "src/Renderer.tsx"),
    rendererSource.replace(
      "({viewportWidth, viewportHeight}: SceneRendererProps) => <div style={{width: viewportWidth, height: viewportHeight}} />",
      '(_props: {storyBeat: {kind: "narrated-scene"; ttsChunks: readonly unknown[]}}) => <div />',
    ),
  );

  await assert.rejects(
    checkSceneTask({ locations, taskRevision: task.taskRevision }),
    /Scene task compile failed \(TS2322,/u,
  );
});
