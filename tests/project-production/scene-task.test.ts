import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  SCENE_ORIGINALITY_INPUT_ID,
  SCENE_MOTION_REQUIREMENT,
  buildProducerTaskSpec,
  buildSceneTaskInputV7,
  buildSceneOriginalityBaseline,
  buildSceneSourceGraph,
  buildScenePriorSource,
  computeSceneContinuityId,
  type ScenePriorSource,
} from "@axmorf/studio/contracts";
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
  sourceFiles = { "src/Renderer.tsx": rendererSource },
  originalityEntries = [],
  requireMotion = false,
  priorSource,
  handoffFontSize,
}: {
  readonly rootDir: string;
  readonly semanticId?: string;
  readonly sourceFiles?: Readonly<Record<string, string>>;
  readonly originalityEntries?: readonly unknown[];
  readonly requireMotion?: boolean;
  readonly priorSource?: ScenePriorSource;
  readonly handoffFontSize?: number;
}) => {
  const fixture = createScenePackageInput();
  const baseTaskInput = requireMotion
    ? buildSceneTaskInputV7({
        ...fixture.task,
        sceneRequirements: [
          {
            requirementId: SCENE_MOTION_REQUIREMENT.requirementId,
            category: SCENE_MOTION_REQUIREMENT.category,
            statement: SCENE_MOTION_REQUIREMENT.statement,
            severity: SCENE_MOTION_REQUIREMENT.severity,
          },
        ],
      })
    : fixture.task;
  const sceneTaskInput =
    handoffFontSize === undefined
      ? baseTaskInput
      : buildSceneTaskInputV7({
          ...baseTaskInput,
          continuity: {
            ...baseTaskInput.continuity,
            nextMeaningId: "next",
            nextSummary: "Keep the query visible",
            handoffs: {
              contractVersion: "scene-continuity-v1",
              incoming: null,
              outgoing: {
                kind: "continuous",
                continuityId: computeSceneContinuityId(
                  baseTaskInput.storyId,
                  baseTaskInput.meaningId,
                  "next",
                ),
                subject: "Query",
                reason: "Continue the query",
                visual: {
                  schemaVersion: 1,
                  viewBox: [
                    0,
                    0,
                    baseTaskInput.sceneViewport.width,
                    baseTaskInput.sceneViewport.height,
                  ],
                  elements: [
                    {
                      tag: "text",
                      attributes: { fontSize: handoffFontSize },
                      children: ["Q"],
                    },
                  ],
                },
              },
            },
          },
        });
  const originalityBaseline = buildSceneOriginalityBaseline({
    subjectStoryId: fixture.task.storyId,
    entries: originalityEntries,
  });
  const context = `${JSON.stringify({
    originalityBaseline,
    scene: {
      taskInput: sceneTaskInput,
      ...(priorSource === undefined ? {} : { priorSource }),
    },
  })}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: checksum(context) },
      {
        id: SCENE_ORIGINALITY_INPUT_ID,
        fingerprint: originalityBaseline.baselineFingerprint,
      },
    ].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      ...Object.keys(sourceFiles),
      "src/generated/reference-fidelity.generated.json",
      "src/selected-resources.json",
      "src/shot-plan.json",
      "src/shot-recipe-selection.json",
      "src/sound-plan.json",
      "src/sync-anchors.json",
      "src/visual-plan.json",
    ].sort(),
    validatorPolicyVersion: "scene-owner-validator-v4",
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
  for (const [logicalPath, source] of Object.entries(sourceFiles)) {
    const destination = join(workspace, logicalPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source);
  }
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

test("Agent-authored Scene tasks still require their declared motion plan", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-required-motion-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task } = await createSceneWorkspace({ rootDir, requireMotion: true });

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /requires a structured shot-plan motionPlan/u,
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

test("Scene task validates and compiles every declared TypeScript source", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-source-graph-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task } = await createSceneWorkspace({
    rootDir,
    sourceFiles: {
      "src/Renderer.tsx": `
import type {SceneRendererProps} from "@axmorf/studio/remotion";
import {SceneBody} from "./components/SceneBody";
const Renderer = (props: SceneRendererProps) => <SceneBody width={props.viewportWidth} height={props.viewportHeight} />;
export default Renderer;
`,
      "src/components/SceneBody.tsx": `
export const SceneBody = ({width, height}: {width: number; height: number}) => <div style={{width, height}} />;
`,
    },
  });

  assert.equal(
    (await checkSceneTask({ rootDir, taskRevision: task.taskRevision })).status,
    "task-workspace-valid",
  );
});

test("Scene task rejects a complete source graph that duplicates frozen historical ownership", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-originality-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sources = {
    "src/Renderer.tsx": rendererSource,
    "src/helpers/palette.ts": "export const ink = '#111';\n",
  };
  const sourceGraphFingerprint = buildSceneSourceGraph(
    Object.entries(sources).map(([path, source]) => ({
      path: path.slice("src/".length),
      source,
    })),
  ).sourceGraphFingerprint;
  const { task } = await createSceneWorkspace({
    rootDir,
    sourceFiles: sources,
    originalityEntries: [
      {
        owner: { storyId: "historical-story", meaningId: "opening" },
        sourceGraphFingerprint,
      },
    ],
  });

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /duplicates frozen historical ownership: historical-story\/opening/u,
  );
});

test("Scene task permits a frozen fingerprint owned by the same Story and meaning", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-originality-owner-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sourceGraphFingerprint = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: rendererSource },
  ]).sourceGraphFingerprint;
  const { task } = await createSceneWorkspace({
    rootDir,
    originalityEntries: [
      {
        owner: { storyId: "synthetic-proof", meaningId: "meaning-one" },
        sourceGraphFingerprint,
      },
    ],
  });

  assert.equal(
    (await checkSceneTask({ rootDir, taskRevision: task.taskRevision })).status,
    "task-workspace-valid",
  );
});

test("Scene task applies readability policy to declared helper sources", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-scene-source-readability-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task } = await createSceneWorkspace({
    rootDir,
    sourceFiles: {
      "src/Renderer.tsx": `
import type {SceneRendererProps} from "@axmorf/studio/remotion";
import {SceneBody} from "./SceneBody";
const Renderer = (_props: SceneRendererProps) => <SceneBody />;
export default Renderer;
`,
      "src/SceneBody.tsx": `
export const SceneBody = () => <p style={{fontSize: 1}}>Unreadable helper copy</p>;
`,
    },
  });

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /below the frozen/u,
  );
});

test("Scene task applies its frozen font minimum to common SVG data outside the source graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-handoff-readability-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task } = await createSceneWorkspace({ rootDir, handoffFontSize: 1 });
  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /Continuity visual text size 1px.*readability-font-minimum/u,
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

test("Scene task cannot take ownership of GlobalVisual decoration", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-global-visual-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { task, workspace } = await createSceneWorkspace({ rootDir });
  await writeFile(
    join(workspace, "src/Renderer.tsx"),
    `${rendererSource}\nconst GlobalVisualDecorationLayers = null;\nvoid GlobalVisualDecorationLayers;`,
  );

  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: task.taskRevision }),
    /must not own GlobalVisualDecorationLayers/u,
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

test("Scene task retains d.ts syntax checks and compiles type-only local imports", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-scene-declaration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const source = `import type {SceneRendererProps} from "@axmorf/studio/remotion";
import type {Viewport} from "./types";
const Renderer = ({viewportWidth, viewportHeight}: SceneRendererProps) => {
  const size: Viewport = {width: viewportWidth, height: viewportHeight};
  return <div style={{width: size.width, height: size.height}} />;
};
export default Renderer;
`;
  const current = await createSceneWorkspace({
    rootDir,
    sourceFiles: {
      "src/Renderer.tsx": source,
      "src/types.d.ts":
        "export interface Viewport { width: number; height: number; }\n",
    },
  });
  assert.equal(
    (await checkSceneTask({ rootDir, taskRevision: current.task.taskRevision }))
      .status,
    "task-workspace-valid",
  );
  await writeFile(
    join(current.workspace, "src/types.d.ts"),
    "export interface Viewport { width: ; }\n",
  );
  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: current.task.taskRevision }),
    /syntax errors/u,
  );
  await writeFile(
    join(current.workspace, "src/types.d.ts"),
    'export type Forbidden = "https://example.com";\n',
  );
  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: current.task.taskRevision }),
    /network access/u,
  );
});

test("Scene task validates retained prior license bytes without requiring Renderer rewrites", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-prior-scene-license-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = createScenePackageInput();
  const license = "Apache-2.0\nRetain upstream attribution.\n";
  const priorSource = buildScenePriorSource({
    storyId: fixture.task.storyId,
    meaningId: fixture.task.meaningId,
    brief: {
      meaningId: fixture.task.meaningId,
      visualIntent: "Keep the prior subject.",
      compositionIntent: "Prior location.",
      motionIntent: "Preserve prior motion.",
      soundIntent: "Narration only.",
      continuityBrief: "Prior continuity.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
    rendererSourceFingerprint:
      fixture.rendererBinding.rendererSourceFingerprint,
    scenePackageFingerprint: `sha256:${"a".repeat(64)}`,
    files: [
      { path: "LICENSE", role: "license", content: license },
      { path: "Renderer.tsx", role: "source", content: rendererSource },
    ].map((file) => ({
      ...file,
      checksum: checksum(file.content),
      sizeBytes: Buffer.byteLength(file.content),
    })),
  });
  const current = await createSceneWorkspace({
    rootDir,
    priorSource,
    sourceFiles: { "src/Renderer.tsx": rendererSource, "src/LICENSE": license },
  });
  assert.equal(
    (await checkSceneTask({ rootDir, taskRevision: current.task.taskRevision }))
      .status,
    "task-workspace-valid",
  );
  await writeFile(join(current.workspace, "src/LICENSE"), "Changed license\n");
  await assert.rejects(
    checkSceneTask({ rootDir, taskRevision: current.task.taskRevision }),
    /retained license.*checksum drifted/u,
  );
});
