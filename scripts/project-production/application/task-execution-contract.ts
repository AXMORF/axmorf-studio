import { z } from "zod";

import {
  GlobalVisualLayerPolicySchema,
  GlobalVisualPlanSchema,
  ReferenceFidelityReceiptSchema,
  RenderSpecSchema,
  SceneReadabilityPolicySchema,
  SceneSelectedResourcesFileSchema,
  SceneSelectedResourceSchema,
  validateSelectedResourceRef,
  SceneProductionBriefItemSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  ScenePriorSourceSchema,
  scenePriorSourceOutputFiles,
  SCENE_MOTION_REQUIREMENT_ID,
  SceneMotionPlanSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  StoryIdSchema,
  TaskExecutionContractSchema,
  TASK_EXECUTION_CONTRACT_VERSION,
  VISUAL_THEME_DECORATION_MAX_OPACITY,
  VisualThemeSchema,
  VisualStyleSpecSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  createGlobalVisualPlan,
  deriveCoverCompositionBaseId,
  getFixedCoverDimensions,
  type AgentTaskKind,
  type ProducerTaskSpec,
  type TaskExecutionContract,
  type TaskOutputOwner,
} from "@axmorf/studio/contracts";

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
  })
  .strict()
  .readonly();
const JsonValueSchema = z.json();

const toJsonSchema = (schema: z.ZodType) =>
  JSON.parse(JSON.stringify(z.toJSONSchema(schema))) as Record<string, unknown>;

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
  readonly example: unknown;
  readonly owner?: TaskOutputOwner;
}) => ({
  path,
  owner,
  format: "json" as const,
  instructions,
  derivedFields,
  jsonSchema: toJsonSchema(schema),
  example: JsonValueSchema.parse(example),
});

const sourceOutput = ({
  path,
  format,
  instructions,
  example,
}: {
  readonly path: string;
  readonly format: "tsx" | "ts" | "text";
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
  "Read only task.json and the immutable input files declared by this contract.",
  "Write only declared output paths inside this task workspace.",
  "Do not use network access, remote URLs, credentials, CSS animation, or CSS transition.",
  "Use Remotion frame APIs for render-critical motion.",
  "Do not render captions, narration, or audio in Scene, GlobalVisual, or Cover source.",
] as const;

const immutableInputs = [
  "task.json",
  "inputs/context.json",
  "inputs/task-contract.json",
] as const;

const createContract = (
  contract: Omit<
    TaskExecutionContract,
    "schemaVersion" | "contractVersion" | "immutableInputs" | "preflight"
  >,
) =>
  TaskExecutionContractSchema.parse({
    schemaVersion: 1,
    contractVersion: TASK_EXECUTION_CONTRACT_VERSION,
    ...contract,
    immutableInputs,
    preflight: {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    },
    outputs: [...contract.outputs].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
  });

const buildSceneContract = (rawContext: unknown) => {
  const context = z
    .object({
      scene: z
        .object({
          taskInput: SceneTaskInputSchema,
          priorSource: ScenePriorSourceSchema.optional(),
          availableResources: z.array(SceneSelectedResourceSchema).default([]),
          brief: SceneProductionBriefItemSchema,
          visualStyle: VisualStyleSpecSchema,
          narrationCues: z
            .array(
              z
                .object({
                  chunkId: z.string().min(1),
                  text: z.string().trim().min(1),
                  startFrame: z.number().int().nonnegative(),
                  endFrame: z.number().int().positive(),
                })
                .strict(),
            )
            .readonly(),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(rawContext);
  const { taskInput, brief, visualStyle, narrationCues, availableResources } =
    context.scene;
  const priorSource = context.scene.priorSource;
  if (
    priorSource !== undefined &&
    (priorSource.storyId !== taskInput.storyId ||
      priorSource.meaningId !== taskInput.meaningId)
  )
    throw new Error("Scene prior source is cross-bound against its task.");
  if (
    JSON.stringify(
      availableResources.map(({ selected }) => selected.resourceId),
    ) !== JSON.stringify([...taskInput.allowedResourceIds].sort())
  ) {
    throw new Error(
      "Scene available resources must exactly resolve its allowlist.",
    );
  }
  for (const record of availableResources)
    validateSelectedResourceRef({
      ...record,
      currentCatalogFingerprint: taskInput.resourceCatalogFingerprint,
    });
  const durationInFrames =
    taskInput.timingBeat.endFrame - taskInput.timingBeat.startFrame;
  if (
    brief.meaningId !== taskInput.meaningId ||
    visualStyle.storyId !== taskInput.storyId ||
    visualStyle.resourceCatalogFingerprint !==
      taskInput.resourceCatalogFingerprint ||
    JSON.stringify(brief.candidateResourceIds) !==
      JSON.stringify([...taskInput.allowedResourceIds].sort())
  ) {
    throw new Error("Scene creative context is stale against its task input.");
  }
  const expectedChunks =
    taskInput.storyBeat.kind === "narrated-scene"
      ? taskInput.storyBeat.ttsChunks
      : [];
  if (
    narrationCues.length !== expectedChunks.length ||
    narrationCues.some(
      (cue, index) =>
        cue.chunkId !== expectedChunks[index]?.chunkId ||
        cue.text !== expectedChunks[index]?.ttsText ||
        cue.startFrame >= cue.endFrame ||
        cue.endFrame > durationInFrames ||
        (index > 0 && cue.startFrame < narrationCues[index - 1].endFrame),
    )
  ) {
    throw new Error("Scene narration cues are stale or outside its timing.");
  }
  const shotId = `${taskInput.meaningId}-primary`;
  const handoffs = taskInput.continuity.handoffs;
  const hasVisualHandoff = [handoffs?.incoming, handoffs?.outgoing].some(
    (handoff) => handoff?.kind === "continuous" && handoff.visual !== undefined,
  );
  const requiresMotion =
    taskInput.sceneRequirements.some(
      (rule) => rule.requirementId === SCENE_MOTION_REQUIREMENT_ID,
    ) ||
    handoffs?.incoming != null ||
    handoffs?.outgoing.kind === "continuous";
  const anchorFrame = narrationCues[0]?.startFrame ?? 0;
  const canMove = durationInFrames > 1 && anchorFrame < durationInFrames - 1;
  const incoming = handoffs?.incoming ?? null;
  const outgoing =
    handoffs?.outgoing.kind === "continuous" ? handoffs.outgoing : null;
  const motionPlan = requiresMotion
    ? SceneMotionPlanSchema.parse({
        schemaVersion: 2,
        objects: [
          { objectId: "subject", meaning: brief.visualIntent },
          ...(incoming === null
            ? []
            : [{ objectId: "incoming-subject", meaning: incoming.subject }]),
          ...(outgoing === null
            ? []
            : [{ objectId: "outgoing-subject", meaning: outgoing.subject }]),
        ],
        actions: [
          {
            actionId: "explain-subject",
            shotId,
            kind: canMove ? "transform" : "hold",
            explanatoryPurpose: brief.motionIntent,
            initialState: "Authored initial subject relationship",
            resultingState: "Authored consequence, held for reading",
            objectIds: ["subject"],
            frameRange: { startFrame: 0, endFrame: durationInFrames },
            syncAnchorId: canMove ? "subject-action" : null,
            readingHoldFrames: 0,
          },
        ],
        handoff: {
          kind: handoffs?.outgoing.kind ?? "motivated-cut",
          reason: handoffs?.outgoing.reason ?? brief.continuityBrief,
          incoming:
            incoming === null
              ? []
              : [
                  {
                    continuityId: incoming.continuityId,
                    objectId: "incoming-subject",
                  },
                ],
          outgoing:
            outgoing === null
              ? []
              : [
                  {
                    continuityId: outgoing.continuityId,
                    objectId: "outgoing-subject",
                  },
                ],
        },
      })
    : undefined;

  const selection = buildShotRecipeSelection({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    selections: [],
  });
  const visualPlan = buildSceneVisualPlan({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    semanticObjective: taskInput.storyBeat.narrativePurpose,
    subject: brief.visualIntent,
    primaryAction: brief.motionIntent,
    causalLink:
      "The visible action makes the StoryBeat's causal link concrete.",
    primaryComposition: brief.compositionIntent,
    styleRealization: [
      visualStyle.artDirection.medium,
      visualStyle.artDirection.palette,
      visualStyle.artDirection.motionLanguage,
    ],
    continuity: brief.continuityBrief,
    orderedShotIds: [shotId],
    visualResourceIds: [],
    recipeDecision: "empty",
    fallbackIntent: "Fail closed instead of loading an undeclared resource.",
  });
  const shotPlan = buildShotPlanSet({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    shots: [
      {
        shotId,
        order: 0,
        primaryRange: { startFrame: 0, endFrame: durationInFrames },
        purpose: brief.visualIntent,
        action: brief.motionIntent,
        visualResourceIds: [],
        syncAnchorIds: requiresMotion && canMove ? ["subject-action"] : [],
      },
    ],
    ...(motionPlan === undefined ? {} : { motionPlan }),
  });
  const syncAnchors = buildSceneSyncAnchors({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    anchors:
      requiresMotion && canMove
        ? [
            {
              eventId: "subject-action",
              sceneLocalFrame: anchorFrame,
              purpose: brief.motionIntent,
            },
          ]
        : [],
  });
  const soundPlan = buildSceneSoundPlan({
    taskInputFingerprint: taskInput.taskInputFingerprint,
    meaningId: taskInput.meaningId,
    sceneDurationInFrames: durationInFrames,
    contributions: [],
  });

  const originalityInstruction =
    "Treat originalityBaseline as immutable negative evidence: the complete declared TypeScript source graph must not normalize to another Scene in that baseline.";
  const contract = createContract({
    taskKind: "scene-owner",
    purpose:
      "Author one meaning-local Scene renderer and its semantic visual, shot, sync, sound, resource, and recipe decisions.",
    workflow: [
      "Read the complete VisualStyle from inputs/context.json; when theme is present its background, primaryText, secondaryText, and accent roles are the shared color authority.",
      "Use scene.taskInput in inputs/context.json as immutable identity, timing, viewport, and allowlist authority.",
      "Use scene.brief and scene.visualStyle for visual, composition, motion, sound, and continuity decisions. Narrated Scenes use scene.narrationCues as exact Scene-local spoken ranges. Visual Scenes have no narration or captions: show the meaning through evolving subjects and short readable labels within their authored frame budget.",
      "Evaluate scene.availableResources capability authoring guides before implementing equivalent behavior yourself. Use the exact public imports, parameters and examples when a capability fits; keep authored content specific to this StoryBeat. Record the chosen capabilities and concrete reasons for self-authored alternatives in visual-plan.json styleRealization.",
      "Before writing the renderer, decide what the viewer sees first, what visibly changes, and what final state makes the StoryBeat's causal point clear. Use one or more shots according to the meaning and duration, with purposeful entry, transformation, and result.",
      "Choose a visual subject with a specific role in the idea. Show cause and consequence through staging, scale, movement, occlusion, or a change in spatial relationship. Geometry and particles can represent a meaningful subject, its aggregation, trajectory or transformation; avoid ambient filler and motion that only illustrates a keyword. Masks, morphs and effects remain free choices, not required recipes.",
      "Give each shot one focal subject and a readable silhouette. Use wide views, close-ups and large short claims to direct attention and reveal a relationship or change; preserve the subject across reframing. Text can become a visual actor rather than staying a small label. Follow the brief's pace: alternate action with readable holds, and let the next meaningful event take over instead of filling the remaining budget with a static result. Leave the Composition-owned caption area visually quiet.",
      "Align meaningful changes to narrationCues in narrated Scenes; in visual Scenes author event anchors from the cause, consequence and reading rhythm. Declare anchors used by shots or sound. The optional resolveSceneActionTiming public helper consumes action ranges, anchors and result holds; Renderer continuity contains the frozen seam. Keep plan, code and visible result consistent.",
      ...(hasVisualHandoff
        ? [
            "The frozen continuous handoff includes visual: a shared declarative SVG drawing, not a template or a second Scene's source. Use this exact drawing for the incoming first frame or outgoing last frame. Bring your own subject into that state through causal movement, then preserve it at the seam; the next Scene begins there and evolves it. Keep unrelated labels or overlays from changing its visible state at the seam. Review the approach and departure, not only the endpoint.",
          ]
        : []),
      originalityInstruction,
      "When scene.priorSource is absent, create this Scene from the current brief; no prior implementation was frozen, so do not claim preservation of existing source.",
      "Replace the scaffold Renderer with StoryBeat-specific creative output and write every declared output. The scaffold is an API illustration, never a finished Scene.",
      "Run the deterministic task finalizer to bind identities, canonicalize JSON, and recompute derived fields.",
      "Run the fixed checker and correct only this workspace. When the bound commands.preview is available, render the Scene before commit; compare real action playback with intent, label holds and narration where present, then repair the same declared outputs and preview again if needed. Report actual review limits; preview is evidence, never aesthetic approval or a replacement for final boundary/music review. Use the exact bound commit only after technical checks.",
    ],
    outputs: [
      sourceOutput({
        path: "src/Renderer.tsx",
        format: "tsx",
        instructions: [
          "Default-export a component assignable to SceneRendererComponent from @axmorf/studio/remotion.",
          "Use sceneFrame, durationInFrames, fps, viewportWidth, and viewportHeight; never assume full-frame coordinates.",
          requiresMotion
            ? "Realize the explanatory intent in shots.motionPlan using content-appropriate frame-driven code: custom SVG, Canvas or supported 3D capabilities, composition and camera choices are allowed. Intent v2 prescribes no geometry, trajectories or components. Optional tracked v1 plans/data-motion-object bindings enable a limited DOM dependency probe. Unsupported probes mean temporal-review-required, never creative invalidity or automatic approval. Render and review low-cost action/boundary previews against the intent; preserve facts, readability and narration alignment."
            : "The runtime supplies the verified shot-plan.json. Realize its intent with authored frame-driven animation or optional selected capabilities. Tracked geometry is optional; a plan does not certify visible, semantic or aesthetic quality.",
          "Do not import or call useVideoConfig; the supplied SceneRendererProps own timing and viewport dimensions.",
          "Show a readable subject, a visible meaning-driven change, and its result at narration-aligned or authored visual event frames. resolveSceneActionTiming({shots, syncAnchors, actionId, sceneFrame}) is an optional public helper returning anticipation/change/reading-hold progress; it leaves geometry and easing to you. Use the optional continuity prop to consume frozen incoming/outgoing seams.",
          ...(hasVisualHandoff
            ? [
                "Import SceneContinuityVisual from @axmorf/studio/remotion. Render <SceneContinuityVisual handoff={continuity.incoming}/> or use continuity.outgoing when its kind is continuous. It draws the frozen visual in viewport coordinates with stable SVG IDs. At the matching first/last frame use a direct viewport child without transform or overflow-hidden ancestors; a Fragment root is one option. The checker compares actual DOM and perturbs the drawing to detect ignored input; markers do not prove consumption. Animate toward and away from that state with your own frame-driven geometry, not a one-frame swap. Browser effects and occlusion still require boundary review.",
              ]
            : []),
          "Keep the root transparent and do not own captions, narration, or GlobalVisual decoration.",
          "For themed Projects, use visualStyle.theme semantic roles for readable text and accents; Composition draws theme.background and Scene must not replace it with a full-frame surface.",
          "Keep visible text at the task viewport minimum font size with clear contrast against its actual background; pure layout and graphic containers do not need a font size.",
        ],
        example: `import type {SceneRendererProps} from "@axmorf/studio/remotion";

// API illustration only. Author the subject, action and result from the brief;
// choose a suitable technique rather than animating this placeholder.
const Renderer = (_props: SceneRendererProps) => null;
export default Renderer;
`,
      }),
      jsonOutput({
        path: "src/generated/reference-fidelity.generated.json",
        schema: ReferenceFidelityReceiptSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "For empty or inspiration-only selections, the fixed finalizer replaces this draft with the not-applicable receipt.",
          "For exact-demo-localized selections, provide pass evidence fields; the finalizer recomputes receipt and item fingerprints.",
        ],
        derivedFields: [
          "schemaVersion",
          "checkerVersion",
          "selectionFingerprint",
          "reason",
          "items[].itemFingerprint",
          "receiptFingerprint",
        ],
        example: buildNotApplicableFidelityReceipt({
          selectionFingerprint: selection.selectionFingerprint,
          reason: "empty",
        }),
      }),
      jsonOutput({
        path: "src/selected-resources.json",
        schema: SceneSelectedResourcesFileSchema,
        instructions: [
          "Copy the selected/descriptor records from scene.availableResources for the exact resources used by the renderer and plans; never invent descriptor fingerprints.",
          "Declare capability IDs in visual-plan.json visualResourceIds. Every declared capability must actually be invoked or mounted by the Renderer source graph; unused imports do not count. Do not invoke unselected capabilities.",
        ],
        example: { schemaVersion: 1, selectedResources: [] },
      }),
      jsonOutput({
        path: "src/shot-plan.json",
        schema: ShotPlanSetSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Cover the Scene with ordered, non-overlapping, meaning-local shots.",
          "Choose shot boundaries for semantic changes, including a result hold when duration permits; one continuous shot is valid for a short, clear Beat.",
          "Describe observable subject positions, actions, and changes in each shot; a theme word or a camera move alone is not a shot action.",
          "New content Scenes require an intent-first motionPlan v2: meaningful subjects, explanatory actions, event timing and continuity. Describe the intended visible change, not mandatory trajectories or components; custom action kinds and frame-driven animation are allowed. Tracked motionPlan v1 remains optional for reusable state interpolation and limited dependency checks.",
          "Each action declares initialState, resultingState, explanatoryPurpose, shotId, objectIds, frameRange, syncAnchorId and readingHoldFrames. Narrated anchors follow sealed narrationCues; visual anchors follow authored causal events. Make labels readable during holds. A hold need not freeze every property. Continuous transitions declare incoming/outgoing continuityId object handoffs; motivated cuts explain why. No mandatory camera movement or animation quota.",
          "scene.taskInput.continuity.handoffs freezes the Root-owned incoming/outgoing seam. Match its outgoing kind and exact continuity IDs; bind each handoff to an authored object whose meaning equals the shared subject. Do not invent IDs or omit a promised incoming object. Realize the shared subject visibly; local object IDs and frame-driven implementation remain your choice. Tracked v1 continuous boundaries require frozen trackedState and exact first/last poses; without it use intent v2. Fixed template boundaries use motivated cuts.",
          "Keep shot order identical to visual-plan.json orderedShotIds.",
        ],
        derivedFields: [
          "schemaVersion",
          "taskInputFingerprint",
          "meaningId",
          "sceneDurationInFrames",
          "shotPlanFingerprint",
        ],
        example: shotPlan,
      }),
      jsonOutput({
        path: "src/shot-recipe-selection.json",
        schema: ShotRecipeSelectionSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Use an empty selection for self-authored visuals; otherwise use only immutable snapshot cards allowed by scene.taskInput.",
        ],
        derivedFields: [
          "schemaVersion",
          "taskInputFingerprint",
          "selectionFingerprint",
        ],
        example: selection,
      }),
      jsonOutput({
        path: "src/sound-plan.json",
        schema: SceneSoundPlanSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Declare only allowlisted non-narration SoundContributions.",
          "Read each selected sound-effect descriptor's timing guidance. Align the onset or swell center with its declared visible syncAnchor by offsetting startFrame; keep the complete media duration inside this Scene. Use volume and sparse accents to support the brief's motion and hierarchy, without competing with narration or Project BGM. Project BGM is owned by the Composition, never duplicate it in Scene source or sound-plan.json. Final mixed-audio review remains necessary; a Scene preview alone excludes Project BGM.",
        ],
        derivedFields: [
          "schemaVersion",
          "taskInputFingerprint",
          "meaningId",
          "sceneDurationInFrames",
          "soundPlanFingerprint",
        ],
        example: soundPlan,
      }),
      jsonOutput({
        path: "src/sync-anchors.json",
        schema: SceneSyncAnchorSetSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Declare only frame-local semantic events referenced by shots or sound contributions.",
          "Use scene.narrationCues to place visual events at the relevant spoken chunk, not at arbitrary percentages.",
        ],
        derivedFields: [
          "schemaVersion",
          "taskInputFingerprint",
          "meaningId",
          "sceneDurationInFrames",
          "syncAnchorFingerprint",
        ],
        example: syncAnchors,
      }),
      jsonOutput({
        path: "src/visual-plan.json",
        schema: SceneVisualPlanSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Describe subject, action, causality, composition, style realization, continuity, and ordered shots.",
          "Carry scene.brief and scene.visualStyle into concrete visible choices; describe the beginning, change, and result in the shot actions.",
          "Make causalLink name the visible consequence of the primaryAction, not a generic claim that the visuals support the narration.",
          "Use only resource IDs permitted by scene.taskInput.allowedResourceIds.",
        ],
        derivedFields: [
          "schemaVersion",
          "taskInputFingerprint",
          "meaningId",
          "visualPlanFingerprint",
        ],
        example: visualPlan,
      }),
    ],
    componentSignatures: [
      "type SceneRendererComponent = ComponentType<SceneRendererProps>;",
      "SceneRendererProps supplies sceneFrame, durationInFrames, fps, viewportWidth, viewportHeight, StoryBeat, plans, and resolved visual resources.",
    ],
    constraints: sharedConstraints,
  });
  if (priorSource === undefined) return contract;
  const additionalOutputs = scenePriorSourceOutputFiles(priorSource)
    .filter(
      (file) =>
        !contract.outputs.some(({ path }) => path === `src/${file.path}`),
    )
    .map((file) => {
      const path = `src/${file.path}`;
      if (file.role === "source")
        return sourceOutput({
          path,
          format: file.path.endsWith(".tsx") ? "tsx" : "ts",
          instructions: [
            "Preserve this prior Scene helper or type declaration and change it only when the current brief delta requires it.",
          ],
          example: file.content,
        });
      if (file.path.endsWith(".json"))
        return jsonOutput({
          path,
          schema: JsonValueSchema,
          instructions: [
            "Copy the exact immutable prior Scene declaration or lineage bytes; retain its license and attribution identity.",
          ],
          example: JSON.parse(file.content),
        });
      return sourceOutput({
        path,
        format: "text",
        instructions: [
          "Copy this immutable prior Scene license or attribution file byte-for-byte; its exact checksum is validated.",
        ],
        example: file.content,
      });
    });
  return createContract({
    ...contract,
    purpose:
      "Revise one existing meaning-local Scene from its frozen current base source and declarations, preserving every behavior outside the current brief delta.",
    workflow: [
      ...contract.workflow.slice(0, 4),
      "Read scene.priorSource in inputs/context.json: it contains only this owning Scene's frozen current base TS/TSX graph, type declarations, plans, and any local license or lineage. Its brief is the previous authored intent; compare it with scene.brief to identify the requested delta.",
      "Preserve the prior Renderer and helper graph as the starting implementation. Apply only the current brief delta; keep unaffected subjects, motion, sound, resources, timing relationships, and layout decisions. Do not reconstruct or redraw the whole Scene for a local change.",
      "Start each semantic JSON draft from its prior declaration. Preserve unaffected decisions, adapt to current immutable timing and allowlists, and let the fixed finalizer recompute fresh task identities and derived fingerprints.",
      "Write every declared output; prior source in context is read-only input, never an existing mutable src/Renderer.tsx. Preserve local license and lineage files exactly and do not read base snapshot paths, other Scenes, history, or another executor workspace.",
      originalityInstruction,
      ...contract.workflow.slice(-2),
    ],
    outputs: [...contract.outputs, ...additionalOutputs],
    constraints: [
      ...sharedConstraints,
      "Only the frozen owning Scene graph in scene.priorSource may be used as prior implementation; it grants no broader filesystem access.",
    ],
  });
};

const buildGlobalVisualContract = (rawContext: unknown) => {
  const context = z
    .object({
      story: z.object({ storyId: StoryIdSchema }).passthrough(),
      render: RenderSpecSchema,
      timing: SemanticTimingSchema,
      layerPolicy: GlobalVisualLayerPolicySchema,
      requirements: z
        .object({ readabilityPolicy: SceneReadabilityPolicySchema })
        .passthrough(),
      resourcePool: z
        .object({ resourceCatalogFingerprint: Sha256DigestSchema })
        .passthrough(),
      visualStyle: z
        .object({ theme: VisualThemeSchema.optional() })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .parse(rawContext);
  const theme = context.visualStyle?.theme;
  const plan = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId: context.story.storyId,
    compositionId: context.render.compositionId,
    width: context.render.width,
    height: context.render.height,
    fps: context.render.fps,
    durationInFrames: context.layerPolicy.baseFrameRange.endFrame,
    captionSafeArea: context.requirements.readabilityPolicy.captionSafeAreaPx,
    catalogFingerprint: context.resourcePool.resourceCatalogFingerprint,
    frameTreatment: {
      inset: 24,
      borderWidth: 2,
      borderColor: theme?.secondaryText ?? "#fffdf9",
      borderOpacity: 0.2,
      vignetteOpacity: 0.08,
      grainOpacity: 0,
    },
    continuityMotif: {
      color: theme?.accent ?? "#a37d5c",
      strokeWidth: 3,
      opacity: 0.25,
      motionPolicy: "linear-frame-progress-v1",
      windows: [],
    },
  });

  return createContract({
    taskKind: "global-visual-owner",
    purpose:
      theme === undefined
        ? "Author visual-only full-composition base and content-window decoration layers without taking Scene or text ownership."
        : "Author visual-only content-window decoration while Composition owns the full-composition theme.background.",
    workflow: [
      "Use Story, render, timing, layerPolicy, readability, resource pool, VisualStyle, and GlobalVisual brief from inputs/context.json.",
      theme === undefined
        ? "Author the base for the full Composition and decoration for the fixed content window using window-local frame zero."
        : "Composition owns the full-composition theme.background. Export GlobalVisualBaseLayer as a zero-parameter direct null return; use the resolved theme roles for decoration in the fixed content window with window-local frame zero.",
      "Run the deterministic task finalizer to canonicalize the plan and recompute its fingerprint.",
      "Run the fixed task checker, correct only this workspace, then use the attempt-bound completion operation supplied by the caller.",
    ],
    outputs: [
      jsonOutput({
        path: "project/global-visual-plan.json",
        schema: GlobalVisualPlanSchema,
        owner: "agent-draft-fixed-finalize",
        instructions: [
          "Bind the exact render, caption safe-area, Catalog identity, and fixed base/decorative ranges from context.",
          "Keep frame treatment and continuity motifs decorative, visual-only, and inside layerPolicy.decorationFrameRange.",
        ],
        derivedFields: ["planFingerprint"],
        example: plan,
      }),
      sourceOutput({
        path: "src/GlobalVisualLayers.tsx",
        format: "tsx",
        instructions: [
          "Export exactly the zero-prop named components GlobalVisualBaseLayer and GlobalVisualDecorationLayers.",
          theme === undefined
            ? "The base is mounted for the full Composition; decoration is mounted only for the content window and receives window-local frame zero."
            : `The themed base must directly return null without parameters, additional statements, helpers, or JSX, and is never mounted. Composition draws theme.background and composites all decoration behind Scenes in one fixed ${VISUAL_THEME_DECORATION_MAX_OPACITY * 100}% maximum opacity group. Use theme.secondaryText and theme.accent; author normal internal opacity and do not pre-apply the group limit a second time.`,
          "Directly import and call useCurrentFrame from remotion for decoration motion; do not shadow or proxy it.",
          "Each rendered JSX root must be intrinsic or Remotion AbsoluteFill and declare exactly one inline pointerEvents: none style property without spreads; a themed null base has no root.",
          "Do not render visible text, Scene semantics, captions, narration, or audio.",
          ...(theme === undefined
            ? []
            : [
                "Stay within frame-driven JSX/SVG: no style/script/link/iframe/object/embed/foreignObject elements, HTML injection, refs, event handlers, JSX attribute spreads, browser globals, effect/ref/portal APIs, dynamic code execution, or timers. Local style object spreads remain allowed; use explicit JSX attributes.",
              ]),
          "Keep JSX child expressions mechanically non-text: elements or fragments, null or booleans, safe conditionals, or arrays containing only those shapes.",
        ],
        example: `import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";

${
  theme === undefined
    ? `export const GlobalVisualBaseLayer = () => {
  return <AbsoluteFill style={{backgroundColor: "#161412", pointerEvents: "none"}} />;
};`
    : "export const GlobalVisualBaseLayer = () => null;"
}

export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 24], [0, 0.28], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <AbsoluteFill style={{inset: 24, border: "2px solid ${theme?.secondaryText ?? "#fffdf9"}", opacity, pointerEvents: "none"}} />;
};
`,
      }),
      jsonOutput({
        path: "src/selected-resources.json",
        schema: SelectedResourcesFileSchema,
        instructions: [
          "List the exact approved global-visual resources used by either layer or the plan.",
        ],
        example: { schemaVersion: 1, selectedResources: [] },
      }),
    ],
    componentSignatures: [
      theme === undefined
        ? "export const GlobalVisualBaseLayer: () => ReactElement;"
        : "export const GlobalVisualBaseLayer: () => null;",
      "export const GlobalVisualDecorationLayers: () => ReactElement;",
    ],
    constraints: sharedConstraints,
  });
};

const buildCoverContract = (rawContext: unknown) => {
  const context = z
    .object({
      story: z.object({ storyId: StoryIdSchema }).passthrough(),
      visualStyle: z
        .object({ theme: VisualThemeSchema.optional() })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .parse(rawContext);
  const compositionId = deriveCoverCompositionBaseId(context.story.storyId);
  const theme = context.visualStyle?.theme;
  const cover4x3 = getFixedCoverDimensions("cover-4x3");
  const cover3x4 = getFixedCoverDimensions("cover-3x4");

  return createContract({
    taskKind: "cover-owner",
    purpose:
      "Author two code-only one-frame Delivery covers that express the current Story and VisualStyle.",
    workflow: [
      "Use Story, VisualStyle, and CoverSpec from inputs/context.json.",
      "When visualStyle.theme is present, use its background, primaryText, secondaryText, and accent roles consistently in both covers; do not choose a separate palette.",
      "Write both covers plus their fixed Root and entry source without loading media or remote resources.",
      "Cover JSX is statically validated: precompute chart coordinates while authoring and embed literal SVG paths; do not put loops, helper calls, Math expressions, or runtime calculations in the cover source.",
      "Run the deterministic task finalizer and fixed checker, correct only this workspace, then use the attempt-bound completion operation supplied by the caller.",
    ],
    outputs: [
      sourceOutput({
        path: "src/Cover3x4.tsx",
        format: "tsx",
        instructions: [
          `Default-export a ${cover3x4.width}x${cover3x4.height} code-only cover with no media, font, or network access.`,
        ],

        example: `const Cover3x4 = () => <div style={{width: ${cover3x4.width}, height: ${cover3x4.height}, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "${theme?.background ?? "#242424"}", color: "${theme?.primaryText ?? "#fffdf9"}", fontSize: 88, fontWeight: 700}}>STORY</div>;\nexport default Cover3x4;\n`,
      }),
      sourceOutput({
        path: "src/Cover4x3.tsx",
        format: "tsx",
        instructions: [
          `Default-export a ${cover4x3.width}x${cover4x3.height} code-only cover with no media, font, or network access.`,
        ],

        example: `const Cover4x3 = () => <div style={{width: ${cover4x3.width}, height: ${cover4x3.height}, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "${theme?.background ?? "#fffdf9"}", color: "${theme?.primaryText ?? "#242424"}", fontSize: 88, fontWeight: 700}}>STORY</div>;\nexport default Cover4x3;\n`,
      }),
      sourceOutput({
        path: "src/Root.tsx",
        format: "tsx",
        instructions: [
          "Register exactly the 4x3 then 3x4 fixed literal one-frame Compositions.",
        ],
        example: `import {Composition} from "remotion";
import Cover4x3 from "./Cover4x3";
import Cover3x4 from "./Cover3x4";

export const CoverRoot = () => <>
  <Composition id="${compositionId}DeliveryCover4x3V2" component={Cover4x3} width={${cover4x3.width}} height={${cover4x3.height}} fps={30} durationInFrames={1} />
  <Composition id="${compositionId}DeliveryCover3x4V2" component={Cover3x4} width={${cover3x4.width}} height={${cover3x4.height}} fps={30} durationInFrames={1} />
</>;
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
      "Cover4x3 and Cover3x4 are zero-prop default React components; CoverRoot registers exact fixed Composition literals.",
    ],
    constraints: sharedConstraints,
  });
};

export const buildTaskExecutionContract = ({
  taskKind,
  context,
}: {
  readonly taskKind: AgentTaskKind;
  readonly context: unknown;
}): TaskExecutionContract => {
  if (taskKind === "scene-owner") return buildSceneContract(context);
  if (taskKind === "global-visual-owner") {
    return buildGlobalVisualContract(context);
  }
  return buildCoverContract(context);
};

export const assertTaskExecutionContractMatchesTask = ({
  task,
  contract: rawContract,
}: {
  readonly task: ProducerTaskSpec;
  readonly contract: unknown;
}): TaskExecutionContract => {
  const contract = TaskExecutionContractSchema.parse(rawContract);
  if (contract.taskKind !== task.taskKind) {
    throw new Error("Task execution contract kind does not match task.json.");
  }
  const immutableReads = contract.immutableInputs.filter(
    (path) => path !== "task.json",
  );
  if (
    immutableReads.length !== task.declaredReadSet.length ||
    immutableReads.some((path, index) => path !== task.declaredReadSet[index])
  ) {
    throw new Error(
      "Task execution contract immutable inputs do not match task.json.",
    );
  }
  const outputs = contract.outputs.map(({ path }) => path);
  if (
    outputs.length !== task.declaredOutputSet.length ||
    outputs.some((path, index) => path !== task.declaredOutputSet[index])
  ) {
    throw new Error("Task execution contract outputs do not match task.json.");
  }
  return contract;
};
