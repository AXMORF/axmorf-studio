import { z } from "zod";

import {
  GlobalVisualLayerPolicySchema,
  GlobalVisualPlanSchema,
  ReferenceFidelityReceiptSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  Sha256DigestSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  StoryIdSchema,
  TaskExecutionContractSchema,
  buildNotApplicableFidelityReceipt,
  buildShotRecipeSelection,
  deriveCoverCompositionBaseId,
  getStoryCompositionDurationInFrames,
  type TaskExecutionContract,
} from "../../../src/contracts";

const SelectedResourcesFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
  })
  .readonly();

const jsonOutput = ({
  path,
  schema,
  instructions,
  derivedFields = [],
  example,
  owner = "agent",
}: {
  readonly path: string;
  readonly schema: z.ZodType;
  readonly instructions: readonly string[];
  readonly derivedFields?: readonly string[];
  readonly example?: unknown;
  readonly owner?: "agent" | "rsp-finalize" | "agent-draft-rsp-finalize";
}) => ({
  path,
  owner,
  format: "json" as const,
  instructions,
  derivedFields,
  jsonSchema: JSON.parse(JSON.stringify(z.toJSONSchema(schema))) as Record<
    string,
    unknown
  >,
  ...(example === undefined ? {} : { example }),
});

const sourceOutput = ({
  path,
  format,
  instructions,
  example,
}: {
  readonly path: string;
  readonly format: "tsx" | "ts";
  readonly instructions: readonly string[];
  readonly example: string;
}) => ({
  path,
  owner: "agent" as const,
  format,
  instructions,
  derivedFields: [],
  example,
});

const sharedConstraints = [
  "Read only immutable task.json and the files listed in immutableInputs.",
  "Write only declared output paths in this task workspace.",
  "Do not use network access, external URLs, credentials, CSS animation, or CSS transition.",
  "Use Remotion frame values for render-critical motion and keep Scene roots transparent.",
  "Do not render captions or narration inside Scene, GlobalVisual, or Cover outputs.",
  "Do not inspect, copy, or adapt Renderer source from any existing Project; historical and same-Revision duplicate Renderers are rejected by fixed validation.",
] as const;

const sceneContract = (rawContext: unknown): TaskExecutionContract => {
  const context = rawContext as {
    scene?: { taskInput?: unknown; beat?: { narrativePurpose?: unknown } };
  };
  const input = SceneTaskInputSchema.parse(context.scene?.taskInput);
  const meaningId = input.meaningId;
  const taskInputFingerprint = input.taskInputFingerprint;
  const durationInFrames =
    input.timingBeat.endFrame - input.timingBeat.startFrame;
  const narrativePurpose = input.storyBeat.narrativePurpose;
  const continuityBrief = input.continuity.continuityBrief;
  const shotId = `${meaningId}-primary`;
  const recipeSelectionExample = buildShotRecipeSelection({
    taskInputFingerprint,
    selections: [],
  });
  const renderer = `import type {SceneRendererProps} from "../../../../remotion/runtime/story-visual/types";

const Renderer = ({sceneFrame, durationInFrames, viewportWidth, viewportHeight, storyBeat}: SceneRendererProps) => {
  const progress = Math.min(1, Math.max(0, sceneFrame / Math.max(1, durationInFrames - 1)));
  return (
    <div style={{width: viewportWidth, height: viewportHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "#fffdf9", opacity: 0.75 + progress * 0.25}}>
      <div style={{fontSize: 56, fontWeight: 700}}>{storyBeat.meaningId}</div>
    </div>
  );
};

export default Renderer;
`;
  return TaskExecutionContractSchema.parse({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind: "scene-owner",
    purpose:
      "Author one meaning-local Scene renderer and its semantic visual, shot, sync, sound, resource, and recipe decisions.",
    workflow: [
      "Run the exact task bind command and do not write until it returns task-worker-bound.",
      "Read inputs/context.json and use scene.taskInput as immutable identity and timing authority.",
      "Replace the examples with creative output that realizes the current StoryBeat, brief, VisualStyle, and requirements.",
      "Write every declared output. Fingerprint fields listed as derivedFields may be omitted or stale in drafts.",
      "Run rsp task finalize once to canonicalize JSON and compute derived fingerprints, then run rsp task check.",
      "Correct only this workspace and repeat finalize/check until valid, then run the attempt-bound commit command.",
    ],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: [
      sourceOutput({
        path: "src/Renderer.tsx",
        format: "tsx",
        instructions: [
          "Default-export a component assignable to SceneRendererComponent.",
          "Author this Renderer from the current immutable Scene context; never reuse another Project or another meaningId Renderer to satisfy validation.",
          "Use sceneFrame, durationInFrames, fps, viewportWidth, and viewportHeight; never assume full-frame coordinates.",
          "Keep every JSX transform and scale value statically provable and never shrink readable content; use frame-driven opacity, top, left, width, or height for motion instead of a dynamic transform or scale.",
          "Keep the root transparent and do not own captions, narration, or global decoration.",
        ],
        example: renderer,
      }),
      jsonOutput({
        path: "src/visual-plan.json",
        schema: SceneVisualPlanSchema,
        instructions: [
          "Describe the semantic subject, action, causality, composition, style realization, continuity, and ordered shots.",
          "Use only resource ids permitted by scene.taskInput.allowedResourceIds.",
        ],
        derivedFields: ["visualPlanFingerprint"],
        example: {
          schemaVersion: 1,
          taskInputFingerprint,
          meaningId,
          semanticObjective: narrativePurpose,
          subject: `The subject of ${meaningId}.`,
          primaryAction: "Show one clear meaning-local action.",
          causalLink: "The action visibly advances the narrated idea.",
          primaryComposition:
            "Use one readable focal composition inside the Scene viewport.",
          styleRealization: [
            "Apply the exact current VisualStyle art direction.",
          ],
          continuity: continuityBrief,
          orderedShotIds: [shotId],
          visualResourceIds: [],
          recipeDecision: "empty",
          fallbackIntent:
            "Fail closed rather than load an undeclared resource.",
        },
      }),
      jsonOutput({
        path: "src/shot-plan.json",
        schema: ShotPlanSetSchema,
        instructions: [
          "Cover the Scene with ordered non-overlapping meaning-local shots.",
          "Every orderedShotId in visual-plan.json must match this shot order.",
        ],
        derivedFields: ["shotPlanFingerprint"],
        example: {
          schemaVersion: 1,
          taskInputFingerprint,
          meaningId,
          sceneDurationInFrames: durationInFrames,
          shots: [
            {
              shotId,
              order: 0,
              primaryRange: { startFrame: 0, endFrame: durationInFrames },
              purpose: "Realize the current StoryBeat in one primary shot.",
              action: "Stage one visible action synchronized to the narration.",
              visualResourceIds: [],
              syncAnchorIds: [],
            },
          ],
        },
      }),
      jsonOutput({
        path: "src/sync-anchors.json",
        schema: SceneSyncAnchorSetSchema,
        instructions: [
          "Declare only frame-local semantic events used by shots or sound contributions.",
        ],
        derivedFields: ["syncAnchorFingerprint"],
        example: {
          schemaVersion: 1,
          taskInputFingerprint,
          meaningId,
          sceneDurationInFrames: durationInFrames,
          anchors: [],
        },
      }),
      jsonOutput({
        path: "src/sound-plan.json",
        schema: SceneSoundPlanSchema,
        instructions: [
          "Narration is forbidden here; declare only allowlisted non-narration SoundContributions.",
        ],
        derivedFields: ["soundPlanFingerprint"],
        example: {
          schemaVersion: 2,
          taskInputFingerprint,
          meaningId,
          sceneDurationInFrames: durationInFrames,
          contributions: [],
        },
      }),
      jsonOutput({
        path: "src/shot-recipe-selection.json",
        schema: ShotRecipeSelectionSchema,
        instructions: [
          "Use an empty selection for self-authored visuals; otherwise use only immutable snapshot cards allowed by scene.taskInput.",
        ],
        derivedFields: ["selectionFingerprint"],
        example: recipeSelectionExample,
      }),
      jsonOutput({
        path: "src/selected-resources.json",
        schema: SelectedResourcesFileSchema,
        instructions: [
          "List the exact catalog resources used by the renderer, visual plan, shots, or sound plan.",
        ],
        example: { schemaVersion: 1, selectedResources: [] },
      }),
      jsonOutput({
        path: "src/generated/reference-fidelity.generated.json",
        schema: ReferenceFidelityReceiptSchema,
        owner: "agent-draft-rsp-finalize",
        instructions: [
          "rsp task finalize writes the not-applicable receipt for empty or inspiration-only recipe selections.",
          "Exact-demo-localized selections require a pass receipt draft with evidence fields; finalize recomputes only its derived fingerprints.",
        ],
        derivedFields: ["receiptFingerprint", "items[].itemFingerprint"],
        example: buildNotApplicableFidelityReceipt({
          selectionFingerprint: recipeSelectionExample.selectionFingerprint,
          reason: "empty",
        }),
      }),
    ],
    componentSignatures: [
      `type SceneRendererProps = Readonly<{storyId: string; meaningId: string; sceneFrame: number; durationInFrames: number; fps: number; viewportWidth: number; viewportHeight: number; storyBeat: StoryBeat; sourceReferences: readonly VideoSourceReference[]; timingBeat: Readonly<{startFrame: number; endFrame: number}>; visualStyle: VisualStyleSpec; visualPlan: SceneVisualPlan; shots: ShotPlanSet; syncAnchors: SceneSyncAnchorSet; visualResources: readonly ResolvedSceneVisualResource[]}>;`,
      "type SceneRendererComponent = ComponentType<SceneRendererProps>;",
    ],
    constraints: sharedConstraints,
    commands: {
      bind:
        "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
      finalize:
        "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
      check:
        "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
    },
  });
};

const globalVisualContract = (rawContext: unknown): TaskExecutionContract => {
  const context = rawContext as {
    story?: { storyId?: unknown };
    render?: {
      compositionId?: unknown;
      width?: unknown;
      height?: unknown;
      fps?: unknown;
    };
    timing?: { durationInFrames?: unknown; fps?: unknown };
    requirements?: {
      readabilityPolicy?: { captionSafeAreaPx?: unknown };
    };
    resourcePool?: { resourceCatalogFingerprint?: unknown };
    layerPolicy?: unknown;
  };
  const storyId = StoryIdSchema.parse(context.story?.storyId);
  const render = z
    .object({
      compositionId: z.string(),
      width: z.number(),
      height: z.number(),
      fps: z.number(),
    })
    .parse(context.render);
  const timing = z
    .object({ durationInFrames: z.number().int().positive(), fps: z.number() })
    .parse(context.timing);
  const captionSafeArea = z
    .object({
      top: z.number().int().nonnegative(),
      right: z.number().int().nonnegative(),
      bottom: z.number().int().nonnegative(),
      left: z.number().int().nonnegative(),
    })
    .parse(context.requirements?.readabilityPolicy?.captionSafeAreaPx);
  const catalogFingerprint = Sha256DigestSchema.parse(
    context.resourcePool?.resourceCatalogFingerprint,
  );
  const layerPolicy = GlobalVisualLayerPolicySchema.parse(context.layerPolicy);
  return TaskExecutionContractSchema.parse({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind: "global-visual-owner",
    purpose:
      "Author one visual-only full-Composition base treatment plus narrated-content-only decoration and continuity layers without taking Scene or text ownership.",
    workflow: [
      "Run the exact task bind command and do not write until it returns task-worker-bound.",
      "Read the full Story, timing, layer policy, render, readability, resource pool, VisualStyle, and GlobalVisual brief from inputs/context.json.",
      "Write the three declared outputs and replace examples with current creative decisions.",
      "Run rsp task finalize to canonicalize the plan and compute its fingerprint, then run rsp task check.",
      "Correct only this workspace until valid, then run the attempt-bound commit command.",
    ],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: [
      sourceOutput({
        path: "src/GlobalVisualLayers.tsx",
        format: "tsx",
        instructions: [
          "Export zero-prop named components GlobalVisualBaseLayer and GlobalVisualDecorationLayers.",
          `GlobalVisualBaseLayer owns only the stable background board/texture for Composition frames ${layerPolicy.baseLayerFrameRange.startFrame}-${layerPolicy.baseLayerFrameRange.endFrame}; do not put Story-specific progress marks or continuity decoration in it.`,
          `GlobalVisualDecorationLayers is mechanically mounted only for Composition frames ${layerPolicy.decorationLayerFrameRange.startFrame}-${layerPolicy.decorationLayerFrameRange.endFrame}; its useCurrentFrame origin is local frame 0 at the start of that window.`,
          "Use useCurrentFrame for decoration motion and set pointerEvents: none on both component roots.",
          "Do not render visible text, Scene semantics, captions, narration, or audio.",
        ],
        example: `import {AbsoluteFill, useCurrentFrame} from "remotion";

export const GlobalVisualBaseLayer = () => (
  <AbsoluteFill style={{backgroundColor: "#fffdf9", pointerEvents: "none"}} />
);

export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  return <div style={{position: "absolute", inset: 24, border: "2px solid rgba(163,125,92,0.2)", opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />;
};
`,
      }),
      jsonOutput({
        path: "project/global-visual-plan.json",
        schema: GlobalVisualPlanSchema,
        instructions: [
          "Bind exact render, timing, caption safe-area, and catalog identities from context.",
          "Keep frame treatment and continuity motif decorative and text-free; continuity motif windows must stay inside layerPolicy.decorationLayerFrameRange.",
        ],
        derivedFields: ["planFingerprint"],
        example: {
          schemaVersion: 1,
          planVersion: "global-visual-plan-v1",
          storyId,
          compositionId: render.compositionId,
          width: render.width,
          height: render.height,
          fps: render.fps,
          durationInFrames: getStoryCompositionDurationInFrames(
            timing.durationInFrames,
          ),
          captionSafeArea,
          catalogFingerprint,
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
        },
      }),
      jsonOutput({
        path: "src/selected-resources.json",
        schema: SelectedResourcesFileSchema,
        instructions: [
          "List the exact approved resources used by GlobalVisualLayers or the plan.",
        ],
        example: { schemaVersion: 1, selectedResources: [] },
      }),
    ],
    componentSignatures: [
      "export const GlobalVisualBaseLayer: () => ReactElement; // zero props, full Composition base only",
      "export const GlobalVisualDecorationLayers: () => ReactElement; // zero props, narrated-window decoration only",
    ],
    constraints: sharedConstraints,
    commands: {
      bind:
        "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
      finalize:
        "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
      check:
        "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
    },
  });
};

const coverContract = (rawContext: unknown): TaskExecutionContract => {
  const context = rawContext as { story?: { storyId?: unknown } };
  const storyId = StoryIdSchema.parse(context.story?.storyId);
  const compositionId = deriveCoverCompositionBaseId(storyId);
  return TaskExecutionContractSchema.parse({
    schemaVersion: 2,
    contractVersion: "agent-task-execution-contract-v2",
    taskKind: "cover-owner",
    purpose:
      "Author two code-only one-frame Delivery covers that express the current Story and VisualStyle.",
    workflow: [
      "Run the exact task bind command and do not write until it returns task-worker-bound.",
      "Read Story, VisualStyle, and CoverSpec from inputs/context.json.",
      "Write all four source files and replace the visual examples with Story-specific code-only graphics.",
      "Run rsp task finalize, then rsp task check, correct only this workspace, and commit with the exact attempt-bound command.",
    ],
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    immutableInputs: ["inputs/context.json", "inputs/task-contract.json"],
    outputs: [
      sourceOutput({
        path: "src/Cover4x3.tsx",
        format: "tsx",
        instructions: [
          "Default-export a 1600x1200 code-only cover with no asset or network access.",
        ],
        example:
          'const Cover4x3 = () => <div style={{width: 1600, height: 1200, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fffdf9", color: "#242424", fontSize: 88, fontWeight: 700}}>STORY</div>;\nexport default Cover4x3;\n',
      }),
      sourceOutput({
        path: "src/Cover3x4.tsx",
        format: "tsx",
        instructions: [
          "Default-export a 1200x1600 code-only cover with no asset or network access.",
        ],
        example:
          'const Cover3x4 = () => <div style={{width: 1200, height: 1600, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#242424", color: "#fffdf9", fontSize: 88, fontWeight: 700}}>STORY</div>;\nexport default Cover3x4;\n',
      }),
      sourceOutput({
        path: "src/Root.tsx",
        format: "tsx",
        instructions: [
          "Register exactly the two fixed literal one-frame Compositions in 4x3 then 3x4 order.",
        ],
        example: `import {Composition} from "remotion";
import Cover4x3 from "./Cover4x3";
import Cover3x4 from "./Cover3x4";
export const CoverRoot = () => (<>
  <Composition id="${compositionId}DeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1} />
  <Composition id="${compositionId}DeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1} />
</>);
`,
      }),
      sourceOutput({
        path: "src/index.ts",
        format: "ts",
        instructions: ["Register CoverRoot through Remotion registerRoot."],
        example:
          'import {registerRoot} from "remotion";\nimport {CoverRoot} from "./Root";\nregisterRoot(CoverRoot);\n',
      }),
    ],
    componentSignatures: [
      "Cover4x3 and Cover3x4 are zero-prop default React components; Root registers exact fixed Composition literals.",
    ],
    constraints: sharedConstraints,
    commands: {
      bind:
        "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
      finalize:
        "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
      check:
        "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
    },
  });
};

export const buildTaskExecutionContract = ({
  taskKind,
  context,
}: {
  readonly taskKind: "scene-owner" | "global-visual-owner" | "cover-owner";
  readonly context: unknown;
}): TaskExecutionContract => {
  if (taskKind === "scene-owner") return sceneContract(context);
  if (taskKind === "global-visual-owner") return globalVisualContract(context);
  return coverContract(context);
};
