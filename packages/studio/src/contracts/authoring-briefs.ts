import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ResourceCatalogSchema, ResourceIdSchema } from "./resource-catalog";
import type { AuthoringRequirements } from "./authoring-requirements";
import type { StorySpec } from "./story";

const SafeTextSchema = z.string().trim().min(1).max(1600).refine((value) => !/(?:Bearer\s|https?:\/\/|(?:^|\s)\/(?:home|data|tmp)\/|[A-Za-z]:\\|\b(?:token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b)/iu.test(value), "Authoring text must not contain private or remote diagnostics.");
const CardIdSchema = z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const sortedUnique = (values: readonly string[], context: z.RefinementCtx, path: PropertyKey) => {
  const sorted = [...values].sort();
  if (new Set(values).size !== values.length || values.some((value, index) => value !== sorted[index])) context.addIssue({ code: "custom", message: "Authoring identity lists must be sorted and unique.", path: [path] });
};

export const STORY_RESOURCE_POOL_VERSION = "story-resource-pool-v1" as const;
const SnapshotSchema = z.object({ sourceId: z.literal("video-shotcraft"), snapshotFingerprint: Sha256DigestSchema, allowedCardIds: z.array(CardIdSchema).min(1).max(128).readonly() }).strict().superRefine((value, context) => sortedUnique(value.allowedCardIds, context, "allowedCardIds")).readonly();
const PoolInput = z.object({ schemaVersion: z.literal(1), contractVersion: z.literal(STORY_RESOURCE_POOL_VERSION), storyId: StoryIdSchema, requirementsFingerprint: Sha256DigestSchema, resourceCatalogFingerprint: Sha256DigestSchema, allowedResourceIds: z.array(ResourceIdSchema).max(256).readonly(), allowedSnapshots: z.array(SnapshotSchema).max(16).readonly(), selfAuthoredVisualsAllowed: z.literal(true) }).strict().superRefine((pool, context) => sortedUnique(pool.allowedResourceIds, context, "allowedResourceIds"));
export const StoryResourcePoolInputSchema = PoolInput.readonly();
export const computeStoryResourcePoolFingerprint = (raw: unknown) => { const value = { ...(raw as Record<string, unknown>) }; delete value.poolFingerprint; return createFingerprint({ namespace: "story-resource-pool", version: 1, value: StoryResourcePoolInputSchema.parse(value) }); };
export const StoryResourcePoolSchema = PoolInput.extend({ poolFingerprint: Sha256DigestSchema }).strict().superRefine((pool, context) => { if (pool.poolFingerprint !== computeStoryResourcePoolFingerprint(pool)) context.addIssue({ code: "custom", message: "Story resource pool fingerprint is stale.", path: ["poolFingerprint"] }); }).readonly();
export const buildStoryResourcePool = (raw: unknown) => { const input = StoryResourcePoolInputSchema.parse({ ...(raw as Record<string, unknown>), schemaVersion: 1, contractVersion: STORY_RESOURCE_POOL_VERSION }); return StoryResourcePoolSchema.parse({ ...input, poolFingerprint: computeStoryResourcePoolFingerprint(input) }); };
export const validateStoryResourcePool = ({ pool: rawPool, catalog: rawCatalog, requirementsFingerprint }: { readonly pool: unknown; readonly catalog: unknown; readonly requirementsFingerprint: unknown }) => {
  const pool = StoryResourcePoolSchema.parse(rawPool); const catalog = ResourceCatalogSchema.parse(rawCatalog);
  if (pool.requirementsFingerprint !== Sha256DigestSchema.parse(requirementsFingerprint) || pool.resourceCatalogFingerprint !== catalog.catalogFingerprint) throw new Error("Story resource pool identity is stale.");
  const catalogById = new Map(catalog.entries.map((entry) => [entry.descriptor.id, entry] as const));
  for (const id of pool.allowedResourceIds) { const entry = catalogById.get(id); if (entry === undefined || entry.descriptor.status !== "approved" || entry.descriptor.allowedUse === "blocked" || entry.descriptor.kind === "authoring-reference") throw new Error(`Story resource pool contains an unavailable resource: ${id}.`); }
  return pool;
};
export type StoryResourcePool = z.infer<typeof StoryResourcePoolSchema>;

export const SCENE_PRODUCTION_BRIEF_VERSION = "scene-production-brief-v1" as const;
const SnapshotSelectionSchema = z.object({ sourceId: z.literal("video-shotcraft"), cardIds: z.array(CardIdSchema).min(1).max(128).readonly() }).strict().superRefine((value, context) => sortedUnique(value.cardIds, context, "cardIds")).readonly();
export const SceneProductionBriefItemSchema = z.object({ meaningId: MeaningIdSchema, visualIntent: SafeTextSchema, compositionIntent: SafeTextSchema, motionIntent: SafeTextSchema, soundIntent: SafeTextSchema, continuityBrief: SafeTextSchema, candidateResourceIds: z.array(ResourceIdSchema).max(128).readonly(), allowedSnapshotCards: z.array(SnapshotSelectionSchema).max(16).readonly() }).strict().superRefine((scene, context) => sortedUnique(scene.candidateResourceIds, context, "candidateResourceIds")).readonly();
const BriefInput = z.object({ schemaVersion: z.literal(1), contractVersion: z.literal(SCENE_PRODUCTION_BRIEF_VERSION), storyId: StoryIdSchema, requirementsFingerprint: Sha256DigestSchema, semanticTimingFingerprint: Sha256DigestSchema, visualStyleFingerprint: Sha256DigestSchema, resourcePoolFingerprint: Sha256DigestSchema, soundPolicy: z.enum(["allowed", "none"]), reviewPolicy: z.literal("mechanical-only"), scenes: z.array(SceneProductionBriefItemSchema).min(1).max(256).readonly() }).strict().superRefine((brief, context) => { if (new Set(brief.scenes.map(({ meaningId }) => meaningId)).size !== brief.scenes.length) context.addIssue({ code: "custom", message: "Scene brief meaning IDs must be unique.", path: ["scenes"] }); });
export const SceneProductionBriefInputSchema = BriefInput.readonly();
export const computeSceneProductionBriefFingerprint = (raw: unknown) => { const value = { ...(raw as Record<string, unknown>) }; delete value.briefFingerprint; return createFingerprint({ namespace: "scene-production-brief", version: 1, value: SceneProductionBriefInputSchema.parse(value) }); };
export const SceneProductionBriefSchema = BriefInput.extend({ briefFingerprint: Sha256DigestSchema }).strict().superRefine((brief, context) => { if (brief.briefFingerprint !== computeSceneProductionBriefFingerprint(brief)) context.addIssue({ code: "custom", message: "Scene production brief fingerprint is stale.", path: ["briefFingerprint"] }); }).readonly();
export const buildSceneProductionBrief = (raw: unknown) => { const input = SceneProductionBriefInputSchema.parse({ ...(raw as Record<string, unknown>), schemaVersion: 1, contractVersion: SCENE_PRODUCTION_BRIEF_VERSION }); return SceneProductionBriefSchema.parse({ ...input, briefFingerprint: computeSceneProductionBriefFingerprint(input) }); };
export const validateSceneProductionBrief = ({ brief: rawBrief, story, requirements, semanticTimingFingerprint, visualStyleFingerprint, pool }: { readonly brief: unknown; readonly story: StorySpec; readonly requirements: AuthoringRequirements; readonly semanticTimingFingerprint: unknown; readonly visualStyleFingerprint: unknown; readonly pool: StoryResourcePool }) => {
  const brief = SceneProductionBriefSchema.parse(rawBrief);
  if (brief.storyId !== story.storyId || brief.requirementsFingerprint !== requirements.requirementsFingerprint || brief.semanticTimingFingerprint !== Sha256DigestSchema.parse(semanticTimingFingerprint) || brief.visualStyleFingerprint !== Sha256DigestSchema.parse(visualStyleFingerprint) || brief.resourcePoolFingerprint !== pool.poolFingerprint || brief.soundPolicy !== requirements.enhancementSelection.sound) throw new Error("Scene production brief identity is stale.");
  if (brief.scenes.length !== story.beats.length || brief.scenes.some(({ meaningId }, index) => meaningId !== story.beats[index]?.meaningId)) throw new Error("Scene production brief must contain every StoryBeat in order.");
  const poolResources = new Set(pool.allowedResourceIds); const poolSnapshots = new Map(pool.allowedSnapshots.map((snapshot) => [snapshot.sourceId, new Set(snapshot.allowedCardIds)]));
  for (const scene of brief.scenes) {
    const beat = story.beats.find(({ meaningId }) => meaningId === scene.meaningId);
    if (beat?.kind === "silent-scene" && (scene.visualIntent !== beat.preset.visualIntent || scene.soundIntent !== beat.preset.soundIntent || JSON.stringify(scene.candidateResourceIds) !== JSON.stringify(beat.preset.resourceIds) || scene.allowedSnapshotCards.length > 0)) throw new Error(`Silent Scene ${scene.meaningId} brief is stale against its preset.`);
    if (scene.candidateResourceIds.some((id) => !poolResources.has(id))) throw new Error(`Scene ${scene.meaningId} requests a resource outside the Story pool.`);
    for (const selection of scene.allowedSnapshotCards) if (selection.cardIds.some((id) => !poolSnapshots.get(selection.sourceId)?.has(id))) throw new Error(`Scene ${scene.meaningId} requests a snapshot outside the Story pool.`);
  }
  return brief;
};

export const GLOBAL_VISUAL_BRIEF_VERSION = "global-visual-brief-v1" as const;
const GlobalBriefInput = z.object({ schemaVersion: z.literal(1), contractVersion: z.literal(GLOBAL_VISUAL_BRIEF_VERSION), storyId: StoryIdSchema, responsibility: z.literal("project-global-background-texture-decoration-continuity-v1"), visualIntent: z.array(z.object({ intentId: z.string().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: SafeTextSchema, appliesTo: z.enum(["full-composition", "frozen-frame-windows"]) }).strict().readonly()).min(1).max(64).readonly(), constraints: z.object({ captionOwner: z.literal("caption-layer"), sceneSemanticOwner: z.literal("scene-package"), visibleText: z.literal("forbidden"), motion: z.literal("remotion-frame-api-only"), runtimeExternalAccess: z.literal("forbidden"), genericDsl: z.literal("forbidden") }).strict().readonly() }).strict();
export const GlobalVisualBriefInputSchema = GlobalBriefInput.readonly();
export const computeGlobalVisualBriefFingerprint = (raw: unknown) => { const value = { ...(raw as Record<string, unknown>) }; delete value.briefFingerprint; return createFingerprint({ namespace: "global-visual-brief", version: 1, value: GlobalVisualBriefInputSchema.parse(value) }); };
export const GlobalVisualBriefSchema = GlobalBriefInput.extend({ briefFingerprint: Sha256DigestSchema }).strict().superRefine((brief, context) => { if (brief.briefFingerprint !== computeGlobalVisualBriefFingerprint(brief)) context.addIssue({ code: "custom", message: "GlobalVisualBrief fingerprint is stale.", path: ["briefFingerprint"] }); }).readonly();
export const buildGlobalVisualBrief = (raw: unknown) => { const input = GlobalVisualBriefInputSchema.parse({ ...(raw as Record<string, unknown>), schemaVersion: 1, contractVersion: GLOBAL_VISUAL_BRIEF_VERSION }); return GlobalVisualBriefSchema.parse({ ...input, briefFingerprint: computeGlobalVisualBriefFingerprint(input) }); };
