import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildAuthoringRequirements,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
} from "../../src/contracts";
import { checkSceneTask } from "../../scripts/project-production/application/scene-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  validNarrationSpec,
  validRenderSpec,
  validVideoBrief,
} from "../fixtures/narrative";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const rendererSource = `
const SceneBackground = () => <div />;
const SceneContentFrame = (_props: {children?: unknown; policy: unknown}) => <div />;
const Renderer = ({readabilityPolicy}: {readabilityPolicy: unknown}) => (
  <>
    <SceneBackground />
    <SceneContentFrame policy={readabilityPolicy}><div /></SceneContentFrame>
  </>
);
export default Renderer;
`;

const buildRequirements = () => {
  const fixture = createScenePackageInput();
  const story = {
    schemaVersion: 3,
    storyId: fixture.task.storyId,
    title: "Synthetic Scene validator proof",
    beats: [fixture.task.storyBeat],
  } as const;
  const projectSound = buildProjectSoundPlan({
    storyId: fixture.task.storyId,
    contributions: [],
  });
  return buildAuthoringRequirements({
    source: {
      brief: {
        ...validVideoBrief,
        storyId: fixture.task.storyId,
        title: story.title,
      },
      story,
      narration: validNarrationSpec,
      render: { ...validRenderSpec, compositionId: "SyntheticProof" },
      projectSound,
    },
    sourceChecksums: {
      videoBrief: sha("1"),
      storySpec: sha("2"),
      narrationSpec: sha("3"),
      renderSpec: sha("4"),
      projectSound: sha("5"),
    },
    enhancementSelection: {
      storyVisual: "required",
      sound: "allowed",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
    readability: { edgeInsetPx: 96 },
  });
};

const createSceneWorkspace = async ({
  rootDir,
  semanticId = "meaning-one",
}: {
  readonly rootDir: string;
  readonly semanticId?: string;
}) => {
  const fixture = createScenePackageInput();
  const context = `${JSON.stringify({
    requirements: buildRequirements(),
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
    validatorPolicyVersion: "scene-owner-validator-v1",
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": context },
  });
  const outputs: Readonly<Record<string, unknown>> = {
    "src/generated/reference-fidelity.generated.json":
      fixture.fidelityReceipt,
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
  await writeFile(
    join(rootDir, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "preserve",
        noImplicitAny: false,
        noEmit: true,
      },
    })}\n`,
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
