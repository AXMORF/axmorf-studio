import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildProducerTaskSpec } from "@axmorf/studio/contracts";
import { checkSceneTask } from "../../scripts/project-production/application/scene-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const rendererSource = `
import type {SceneRendererProps} from "@axmorf/studio/remotion";
const Renderer = ({viewportWidth, viewportHeight}: SceneRendererProps) => <div style={{width: viewportWidth, height: viewportHeight}} />;
export default Renderer;
`;

const legacyRendererSource = `
import type {SceneRendererProps} from "@axmorf/studio/remotion";
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
}: {
  readonly rootDir: string;
  readonly semanticId?: string;
}) => {
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
    rootDir,
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
  const repositoryRoot = join(import.meta.dirname, "../..");
  const compilerConfig = JSON.parse(
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  ) as { compilerOptions: Record<string, unknown> };
  compilerConfig.compilerOptions.baseUrl = repositoryRoot;
  await writeFile(
    join(rootDir, "tsconfig.json"),
    `${JSON.stringify(compilerConfig, null, 2)}\n`,
  );
  await writeFile(join(workspace, "src/Renderer.tsx"), rendererSource);
  for (const [logicalPath, value] of Object.entries(outputs)) {
    const destination = join(workspace, logicalPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value)}\n`);
  }
  return { task, workspace } as const;
};

test("Scene task accepts the complete Renderer and plan bundle, then rejects malformed JSON", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });

  assert.equal(
    (await checkSceneTask({ rootDir, taskRevision: task.taskRevision })).status,
    "task-workspace-valid",
  );

  await writeFile(join(workspace, "src/visual-plan.json"), "{not-json\n");
  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /JSON|Unexpected|property name/iu,
  );
});

test("Scene task rejects a context bound to another meaningId", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-cross-bound-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task } = await createSceneWorkspace({
    rootDir,
    semanticId: "meaning-two",
  });

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /cross-bound/u,
  );
});

test("Scene task rejects an unresolved Renderer import graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-compile-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });
  await writeFile(
    join(workspace, "src/Renderer.tsx"),
    `${rendererSource}\nimport {missingRendererDependency} from "./missing-renderer-dependency";\nvoid missingRendererDependency;\n`,
  );

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /Scene task compile failed/u,
  );
});

test("Scene task rejects the removed Scene-owned readability boundary", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-legacy-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });
  await writeFile(join(workspace, "src/Renderer.tsx"), legacyRendererSource);

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /must not own SceneBackground/u,
  );
});

test("Scene task rejects access to Composition dimensions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-full-frame-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });
  await writeFile(join(workspace, "src/Renderer.tsx"), fullFrameRendererSource);

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /must not own useVideoConfig/u,
  );
});

test("Scene task rejects a Renderer that narrows the shared StoryBeat contract", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-scene-component-contract-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });
  await writeFile(
    join(workspace, "src/Renderer.tsx"),
    rendererSource.replace(
      "({viewportWidth, viewportHeight}: SceneRendererProps) => <div style={{width: viewportWidth, height: viewportHeight}} />",
      '(_props: {storyBeat: {kind: "narrated-scene"; ttsChunks: readonly unknown[]}}) => <div />',
    ),
  );

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /Scene task compile failed \(TS2322,/u,
  );
});
