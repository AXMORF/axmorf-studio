import { serializeCanonicalJson } from "@axmorf/studio/contracts";
import {
  ProductionInspectionSchema,
  type ProductionInspection,
} from "@axmorf/studio/contracts";
import {
  captureProductionInspectionSnapshot,
  inspectCurrentDelivery,
  inspectNarrationCache,
  inspectProductionSourceReadiness,
  type NarrationCacheInspection,
  type ProductionInspectionSnapshot,
  type ProductionSourceReadiness,
} from "../adapters/production-inspection";
import { buildCurrentProductionPlan } from "./build-current-plan";
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;

export type InspectProductionDependencies = Readonly<{
  captureSnapshot?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly scope?: ProductionScope;
  }) => Promise<
    ProductionInspectionSnapshot | Readonly<Record<string, string>>
  >;
  inspectReadiness?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly scope?: ProductionScope;
  }) => Promise<ProductionSourceReadiness>;
  inspectNarrationCache?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly scope?: ProductionScope;
  }) => Promise<NarrationCacheInspection>;
  buildCurrentPlan?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly narration: NarrationCacheInspection;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
    readonly scope?: ProductionScope;
  }) => Promise<CurrentPlan>;
  inspectDelivery?: typeof inspectCurrentDelivery;
}>;

const snapshotsMatch = (
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
) => serializeCanonicalJson(before) === serializeCanonicalJson(after);

export const inspectProjectProduction = async (
  {
    rootDir,
    projectId,
    env = process.env,
  runtimePolicyManifest,
  scope: suppliedScope,
  }: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
    readonly scope?: ProductionScope;
  },
  dependencies: InspectProductionDependencies = {},
): Promise<ProductionInspection> => {
  const captureSnapshot =
    dependencies.captureSnapshot ?? captureProductionInspectionSnapshot;
  const inspectReadiness =
    dependencies.inspectReadiness ?? inspectProductionSourceReadiness;
  const inspectCache =
    dependencies.inspectNarrationCache ?? inspectNarrationCache;
  const buildPlan = dependencies.buildCurrentPlan ?? buildCurrentProductionPlan;
  const readDelivery = dependencies.inspectDelivery ?? inspectCurrentDelivery;
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Production inspection scope is cross-bound.");
  }

  const before = await captureSnapshot({ rootDir, projectId, scope });
  let readiness: ProductionSourceReadiness | undefined;
  let narration: NarrationCacheInspection | undefined;
  let currentPlan: CurrentPlan | null = null;
  let delivery: Awaited<ReturnType<typeof inspectCurrentDelivery>> = {
    current: false,
    revisionId: null,
    deliveryBuildId: null,
  };
  let readError: unknown;
  try {
    readiness = await inspectReadiness({ rootDir, projectId, scope });
    narration = await inspectCache({ rootDir, projectId, env, scope });
    if (readiness.sourceState === "production-inputs-ready") {
      currentPlan = await buildPlan({
        rootDir,
        projectId,
        env,
        narration,
        runtimePolicyManifest,
        scope,
      });
      delivery = await readDelivery({
        rootDir: scope.isolatedRoot,
        projectId,
      });
    }
  } catch (error) {
    readError = error;
  }
  const after = await captureSnapshot({ rootDir, projectId, scope });
  if (!snapshotsMatch(before, after)) {
    throw new Error("inspection-source-drift");
  }
  if (readError !== undefined) throw readError;
  if (readiness === undefined || narration === undefined) {
    throw new Error("Production inspection did not produce a read model.");
  }

  if (currentPlan === null) {
    return ProductionInspectionSchema.parse({
      schemaVersion: 1,
      contractVersion: "production-inspection-v1",
      storyId: projectId,
      sourceState: readiness.sourceState,
      currentRevisionId: null,
      baseline: { kind: "none", revisionId: null },
      estimatedCost: {
        providerRequests: narration.providerRequests,
        providerCacheHits: narration.providerCacheHits,
        agentTasks: null,
        deliveryMedia: null,
      },
      tasks: [],
      nextAction:
        readiness.sourceState === "configured-authoring"
          ? "prepare-narration"
          : "complete-authoring",
    });
  }

  const revisionId = currentPlan.revision.revisionId;
  const currentDelivery =
    delivery.current && delivery.revisionId === revisionId;
  const dirtyAgentTaskCount = currentPlan.plan.summary.dirtyAgentTaskCount;
  const futureTaskCostUnknown =
    narration.providerRequests === null || narration.narrationReady === false;
  const planCurrent = currentPlan.plan.tasks.every(
    ({ action }) => action === "reuse",
  );
  const baseline =
    currentPlan.baseline ??
    (currentDelivery
      ? { kind: "current-delivery" as const, revisionId }
      : { kind: "none" as const, revisionId: null });
  return ProductionInspectionSchema.parse({
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId: projectId,
    sourceState: readiness.sourceState,
    currentRevisionId: revisionId,
    baseline,
    estimatedCost: {
      providerRequests: narration.providerRequests,
      providerCacheHits: narration.providerCacheHits,
      agentTasks: futureTaskCostUnknown ? null : dirtyAgentTaskCount,
      deliveryMedia: futureTaskCostUnknown
        ? null
        : currentDelivery
          ? []
          : ["video", "cover-4x3", "cover-3x4"],
    },
    tasks: currentPlan.plan.tasks,
    nextAction:
      planCurrent && currentDelivery
        ? "converge-current"
        : "prepare-production",
  });
};
