import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ProducerTaskSpecSchema,
  SceneTaskInputSchema,
  SemanticTimingSchema,
  StoryIdSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  createGlobalVisualPlan,
  deriveCoverCompositionBaseId,
  getStoryCompositionDurationInFrames,
  serializeCanonicalJson,
} from "../../src/contracts";
import { validProjectCreateInput } from "../../tests/fixtures/project-create";

export const DESKTOP_NATIVE_STORY_ID = "desktop-native-fixture" as const;

const json = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const write = async (path: string, value: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
};

export const createDesktopNativeProjectInput = () => ({
  ...validProjectCreateInput,
  storyId: DESKTOP_NATIVE_STORY_ID,
  brief: {
    ...validProjectCreateInput.brief,
    storyId: DESKTOP_NATIVE_STORY_ID,
    title: "AXMORF native production proof",
    targetDurationSeconds: 4,
  },
  story: {
    schemaVersion: 3,
    storyId: DESKTOP_NATIVE_STORY_ID,
    title: "AXMORF native production proof",
    beats: [
      {
        kind: "narrated-scene",
        meaningId: "opening",
        narrativePurpose: "Prove the first native production Scene.",
        ttsChunks: [
          { chunkId: "opening-01", ttsText: "Native production starts." },
        ],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 500 }],
      },
      {
        kind: "narrated-scene",
        meaningId: "closing",
        narrativePurpose: "Prove the current Delivery boundary.",
        ttsChunks: [
          { chunkId: "closing-01", ttsText: "Native delivery is current." },
        ],
        explicitPauses: [],
      },
    ],
  },
  scenes: [
    {
      ...validProjectCreateInput.scenes[0],
      meaningId: "opening",
      visualIntent: "Show a restrained native production state.",
    },
    {
      ...validProjectCreateInput.scenes[0],
      meaningId: "closing",
      visualIntent: "Show a distinct current Delivery state.",
      continuityBrief: "Cut cleanly from the opening proof.",
    },
  ],
  render: {
    ...validProjectCreateInput.render,
    compositionId: "DesktopNativeFixture",
    leadInFrames: 15,
    tailFrames: 15,
  },
  publishing: {
    ...validProjectCreateInput.publishing,
    description:
      "A real four-file Delivery produced by the packaged native gate.",
    chapters: [
      { meaningId: "opening", name: "开场" },
      { meaningId: "closing", name: "交付" },
    ],
  },
});

const sceneRenderer = `import type {SceneRendererProps} from "../../../../remotion/runtime/story-visual/types";

const Renderer = ({viewportWidth, viewportHeight, storyBeat}: SceneRendererProps) => (
  <div style={{width: viewportWidth, height: viewportHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "#fffdf9"}}>
    <div style={{fontSize: 56, fontWeight: 700, letterSpacing: 4}}>{storyBeat.meaningId}</div>
  </div>
);

export default Renderer;
`;

const sceneOutputs = (context: unknown) => {
  const input = SceneTaskInputSchema.parse(
    (context as { scene?: { taskInput?: unknown } }).scene?.taskInput,
  );
  const durationInFrames =
    input.timingBeat.endFrame - input.timingBeat.startFrame;
  const shots = buildShotPlanSet({
    taskInputFingerprint: input.taskInputFingerprint,
    meaningId: input.meaningId,
    sceneDurationInFrames: durationInFrames,
    shots: [
      {
        shotId: "native-gate-shot",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: durationInFrames },
        purpose: "Expose a deterministic native gate Scene.",
        action: "Hold the semantic label in the Scene viewport.",
        visualResourceIds: [],
        syncAnchorIds: [],
      },
    ],
  });
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: input.taskInputFingerprint,
    meaningId: input.meaningId,
    semanticObjective: input.storyBeat.narrativePurpose,
    subject: "The current native production state.",
    primaryAction: "Present the Scene meaning as a stable title.",
    causalLink: "The title change makes the Scene boundary observable.",
    primaryComposition: "A single centered title inside the provided viewport.",
    styleRealization: ["High contrast typography", "Restrained warm accent"],
    continuity: "Keep the native proof centered across the hard cut.",
    orderedShotIds: ["native-gate-shot"],
    visualResourceIds: [],
    recipeDecision: "empty",
    fallbackIntent: "Fail closed instead of loading an undeclared resource.",
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: input.taskInputFingerprint,
    meaningId: input.meaningId,
    sceneDurationInFrames: durationInFrames,
    anchors: [],
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: input.taskInputFingerprint,
    meaningId: input.meaningId,
    sceneDurationInFrames: durationInFrames,
    contributions: [],
  });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: input.taskInputFingerprint,
    selections: [],
  });
  const fidelity = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  return {
    "src/Renderer.tsx": sceneRenderer,
    "src/generated/reference-fidelity.generated.json": json(fidelity),
    "src/selected-resources.json": json({
      schemaVersion: 1,
      selectedResources: [],
    }),
    "src/shot-plan.json": json(shots),
    "src/shot-recipe-selection.json": json(selection),
    "src/sound-plan.json": json(sound),
    "src/sync-anchors.json": json(anchors),
    "src/visual-plan.json": json(visual),
  } as const;
};

const globalOutputs = (raw: unknown) => {
  const context = raw as {
    story?: { storyId?: unknown };
    render?: {
      compositionId?: unknown;
      width?: unknown;
      height?: unknown;
      fps?: unknown;
    };
    timing?: unknown;
    requirements?: { readabilityPolicy?: { captionSafeAreaPx?: unknown } };
    resourcePool?: { resourceCatalogFingerprint?: unknown };
  };
  const storyId = StoryIdSchema.parse(context.story?.storyId);
  const timing = SemanticTimingSchema.parse(context.timing);
  const render = context.render;
  const plan = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId,
    compositionId: render?.compositionId,
    width: render?.width,
    height: render?.height,
    fps: render?.fps,
    durationInFrames: getStoryCompositionDurationInFrames(
      timing.durationInFrames,
    ),
    captionSafeArea: context.requirements?.readabilityPolicy?.captionSafeAreaPx,
    catalogFingerprint: context.resourcePool?.resourceCatalogFingerprint,
    frameTreatment: {
      inset: 24,
      borderWidth: 2,
      borderColor: "#fffdf9",
      borderOpacity: 0.2,
      vignetteOpacity: 0.08,
      grainOpacity: 0,
    },
    continuityMotif: {
      color: "#a37d5c",
      strokeWidth: 3,
      opacity: 0.25,
      motionPolicy: "linear-frame-progress-v1",
      windows: [],
    },
  });
  return {
    "project/global-visual-plan.json": json(plan),
    "src/GlobalVisualLayers.tsx": `import {useCurrentFrame} from "remotion";\n\nexport const GlobalVisualLayers = () => {\n  const frame = useCurrentFrame();\n  return <div style={{position: "absolute", inset: 24, border: "2px solid rgba(255,253,249,0.2)", pointerEvents: "none", opacity: frame >= 0 ? 1 : 0}} />;\n};\n`,
    "src/selected-resources.json": json({
      schemaVersion: 1,
      selectedResources: [],
    }),
  } as const;
};

const coverOutputs = (storyId: string) => {
  const compositionId = deriveCoverCompositionBaseId(storyId);
  return {
    "src/Cover4x3.tsx": `const Cover4x3 = () => <div style={{width: 1600, height: 1200, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf9", color: "#242424", fontSize: 88, fontWeight: 700}}>AXMORF</div>;\nexport default Cover4x3;\n`,
    "src/Cover3x4.tsx": `const Cover3x4 = () => <div style={{width: 1200, height: 1600, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#242424", color: "#fffdf9", fontSize: 88, fontWeight: 700}}>AXMORF</div>;\nexport default Cover3x4;\n`,
    "src/Root.tsx": `import {Composition} from "remotion";\nimport Cover4x3 from "./Cover4x3";\nimport Cover3x4 from "./Cover3x4";\nexport const CoverRoot = () => (<>\n  <Composition id="${compositionId}DeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1} />\n  <Composition id="${compositionId}DeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1} />\n</>);\n`,
    "src/index.ts": `import {registerRoot} from "remotion";\nimport {CoverRoot} from "./Root";\nregisterRoot(CoverRoot);\n`,
  } as const;
};

type DirtyTask = Readonly<{
  taskRevision: string;
  taskKind: string;
}>;

const parsePreparation = (raw: unknown) => {
  const value = raw as {
    status?: unknown;
    storyId?: unknown;
    dirtyAgentTasks?: readonly DirtyTask[];
  };
  if (value.status !== "project-production-prepared") {
    throw new Error("desktop-native-fixture-preparation-required");
  }
  const storyId = StoryIdSchema.parse(value.storyId);
  if (!Array.isArray(value.dirtyAgentTasks)) {
    throw new Error("desktop-native-fixture-dirty-tasks-required");
  }
  return { storyId, dirtyAgentTasks: value.dirtyAgentTasks } as const;
};

export const executeDesktopNativeAgentTasks = async ({
  workspaceRoot,
  preparation,
}: {
  readonly workspaceRoot: string;
  readonly preparation: unknown;
}) => {
  if (!isAbsolute(workspaceRoot)) {
    throw new Error("desktop-native-fixture-workspace-absolute-required");
  }
  const prepared = parsePreparation(preparation);
  const completed: string[] = [];
  for (const dirty of prepared.dirtyAgentTasks) {
    const taskRoot = join(
      workspaceRoot,
      ".rsp/work",
      prepared.storyId,
      dirty.taskRevision,
    );
    const task = ProducerTaskSpecSchema.parse(
      JSON.parse(await readFile(join(taskRoot, "task.json"), "utf8")),
    );
    if (
      task.taskRevision !== dirty.taskRevision ||
      task.storyId !== prepared.storyId ||
      task.taskKind !== dirty.taskKind
    ) {
      throw new Error("desktop-native-fixture-task-cross-bound");
    }
    const context = JSON.parse(
      await readFile(join(taskRoot, "inputs/context.json"), "utf8"),
    ) as unknown;
    const outputs =
      task.taskKind === "scene-owner"
        ? sceneOutputs(context)
        : task.taskKind === "global-visual-owner"
          ? globalOutputs(context)
          : task.taskKind === "cover-owner"
            ? coverOutputs(task.storyId)
            : null;
    if (outputs === null) {
      throw new Error(
        `desktop-native-fixture-task-kind-unsupported:${task.taskKind}`,
      );
    }
    const actual = Object.keys(outputs).sort();
    const declared = [...task.declaredOutputSet].sort();
    if (json(actual) !== json(declared)) {
      throw new Error("desktop-native-fixture-output-authority-mismatch");
    }
    for (const [logicalPath, bytes] of Object.entries(outputs)) {
      await write(join(taskRoot, logicalPath), bytes);
    }
    completed.push(task.taskRevision);
  }
  return {
    storyId: prepared.storyId,
    completedTaskRevisions: completed.sort(),
  } as const;
};

const readStdinJson = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "create-input") {
    process.stdout.write(json(createDesktopNativeProjectInput()));
    return;
  }
  if (command === "execute-agent-tasks") {
    const workspaceIndex = args.indexOf("--workspace");
    const workspaceRoot = args[workspaceIndex + 1];
    if (workspaceIndex === -1 || workspaceRoot === undefined) {
      throw new Error("desktop-native-fixture-workspace-required");
    }
    process.stdout.write(
      json(
        await executeDesktopNativeAgentTasks({
          workspaceRoot,
          preparation: await readStdinJson(),
        }),
      ),
    );
    return;
  }
  throw new Error("desktop-native-fixture-command-invalid");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "desktop-native-fixture-failed"}\n`,
    );
    process.exitCode = 1;
  });
}
