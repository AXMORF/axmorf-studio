import {
  serializeCanonicalJson,
  type ProducerConfig,
} from "../../../src/contracts";
import {
  ProductionInspectionSchema,
  type ProductionInspection,
} from "../../../src/contracts/production-inspection";
import {
  inspectCurrentDelivery,
  inspectNarrationCache,
  type NarrationCacheInspection,
  type ProductionInspectionSnapshot,
  type ProductionSourceReadiness,
} from "../adapters/production-inspection";
import { buildCurrentProductionPlan } from "./build-current-plan";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";
import {
  createSourceCurrentAttestation,
  inspectSourceCurrent,
  readSourceCurrent,
} from "../adapters/source-current-store";

type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;

const inspectVerifiedCurrentSource = async ({
  locations,
  projectId,
  currentPlan,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly currentPlan: CurrentPlan;
}) => {
  const recordedSource = await readSourceCurrent({
    locations,
    storyId: projectId,
  });
  if (
    recordedSource === null ||
    recordedSource.revisionId !== currentPlan.revision.revisionId ||
    currentPlan.plan.tasks.some(({ action }) => action !== "reuse")
  ) {
    return null;
  }
  const artifacts = currentPlan.tasks.map((task) => {
    const inspection = currentPlan.inspections.get(task.taskRevision);
    if (inspection?.artifactState !== "valid") {
      throw new Error("Current source artifact inspection is unavailable.");
    }
    return inspection.attestation;
  });
  const expectedSource = await createSourceCurrentAttestation({
    locations,
    storyId: projectId,
    revisionId: currentPlan.revision.revisionId,
    artifacts,
  });
  return inspectSourceCurrent({ locations, expected: expectedSource });
};

export type InspectProductionDependencies = Readonly<{
  captureSnapshot: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  }) => Promise<
    ProductionInspectionSnapshot | Readonly<Record<string, string>>
  >;
  inspectReadiness: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  }) => Promise<ProductionSourceReadiness>;
  inspectNarrationCache?: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
    readonly config: ProducerConfig;
  }) => Promise<NarrationCacheInspection>;
  buildCurrentPlan?: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
    readonly config: ProducerConfig;
    readonly narration: NarrationCacheInspection;
  }) => Promise<CurrentPlan>;
  inspectDelivery?: typeof inspectCurrentDelivery;
  inspectCurrentSource?: typeof inspectVerifiedCurrentSource;
}>;

const snapshotsMatch = (
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
) => serializeCanonicalJson(before) === serializeCanonicalJson(after);

export const inspectProjectProduction = async (
  {
    locations,
    projectId,
    config,
    runtime,
  }: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
    readonly config: ProducerConfig;
    readonly runtime: RuntimeExecutionResources;
  },
  dependencies: InspectProductionDependencies,
): Promise<ProductionInspection> => {
  const captureSnapshot = dependencies.captureSnapshot;
  const inspectReadiness = dependencies.inspectReadiness;
  const inspectCache =
    dependencies.inspectNarrationCache ?? inspectNarrationCache;
  const buildPlan = dependencies.buildCurrentPlan;
  const readDelivery = dependencies.inspectDelivery ?? inspectCurrentDelivery;
  const readCurrentSource =
    dependencies.inspectCurrentSource ?? inspectVerifiedCurrentSource;

  const before = await captureSnapshot({ locations, projectId });
  let readiness: ProductionSourceReadiness | undefined;
  let narration: NarrationCacheInspection | undefined;
  let currentPlan: CurrentPlan | null = null;
  let delivery: Awaited<ReturnType<typeof inspectCurrentDelivery>> = {
    current: false,
    revisionId: null,
    sourceCurrentId: null,
    deliveryBuildId: null,
    rendererRuntimeFingerprint: null,
  };
  let sourceCurrentId: string | null = null;
  let readError: unknown;
  try {
    readiness = await inspectReadiness({ locations, projectId });
    narration = await inspectCache({ locations, projectId, config });
    if (readiness.sourceState === "production-inputs-ready") {
      if (buildPlan === undefined) {
        throw new Error("Production plan inspection port is required.");
      }
      currentPlan = await buildPlan({
        locations,
        projectId,
        config,
        narration,
      });
      const currentSource = await readCurrentSource({
        locations,
        projectId,
        currentPlan,
      });
      sourceCurrentId = currentSource?.sourceCurrentId ?? null;
      delivery = await readDelivery({ locations, projectId });
    }
  } catch (error) {
    readError = error;
  }
  const after = await captureSnapshot({ locations, projectId });
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
      sourceCurrentId: null,
      deliveryBuildId: null,
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
    delivery.current &&
    delivery.revisionId === revisionId &&
    sourceCurrentId !== null &&
    delivery.sourceCurrentId === sourceCurrentId &&
    delivery.rendererRuntimeFingerprint === runtime.rendererRuntimeFingerprint;
  const dirtyAgentTaskCount = currentPlan.plan.summary.dirtyAgentTaskCount;
  const futureTaskCostUnknown =
    narration.providerRequests === null || narration.narrationReady === false;
  const planCurrent = currentPlan.plan.tasks.every(
    ({ action }) => action === "reuse",
  );
  const baseline =
    currentPlan.baseline?.kind === "current-delivery" && !currentDelivery
      ? {
          kind: "latest-successful-attempt" as const,
          revisionId: currentPlan.baseline.revisionId,
        }
      : (currentPlan.baseline ??
        (currentDelivery
          ? { kind: "current-delivery" as const, revisionId }
          : { kind: "none" as const, revisionId: null }));
  return ProductionInspectionSchema.parse({
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId: projectId,
    sourceState: readiness.sourceState,
    currentRevisionId: revisionId,
    sourceCurrentId,
    deliveryBuildId: currentDelivery ? delivery.deliveryBuildId : null,
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
        : planCurrent && sourceCurrentId !== null
          ? "build-delivery"
          : "prepare-production",
  });
};
