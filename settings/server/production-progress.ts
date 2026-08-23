import { StoryIdSchema } from "../../src/contracts";
import {
  readCurrentProjectDelivery,
  readCurrentProjectSource,
  readProjectProductionProgressProjection,
  readRepositoryCurrentProductionRevision,
} from "../../scripts/project-production/application/progress-query";
import { readLocalProjectRoot } from "../../scripts/projects/root";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";
import {
  ProductionProgressResponseSchema,
  type ProductionProgressResponse,
  type ProjectProductionProgress,
} from "../contracts/api";

const emptyTasks = {
  reusedTaskCount: 0,
  dirtyAgentTaskCount: 0,
  dirtyFixedTaskCount: 0,
  blockedTaskCount: 0,
} as const;

type ReadCurrentRevision = (input: {
  readonly locations: ReturnType<typeof createRepositoryProductionLocations>;
  readonly projectId: string;
}) => Promise<Readonly<{ revisionId: string }>>;

const readRepositoryCurrentRevision: ReadCurrentRevision = (input) =>
  readRepositoryCurrentProductionRevision(input);

const attemptSummary = (
  projection: Awaited<
    ReturnType<typeof readProjectProductionProgressProjection>
  >,
) => {
  const attempt = projection.attempt;
  return attempt === null
    ? null
    : {
        attemptId: attempt.attemptId,
        revisionId: attempt.revisionId,
        state: attempt.state,
        updatedAt: attempt.updatedAt,
        diagnosticCode: attempt.diagnosticCode,
        tasks: attempt.taskSummary,
        estimatedCost: attempt.estimatedCost,
        actualCost: attempt.actualCost,
        taskExplanations: attempt.taskExplanations,
        taskOutcomes: attempt.taskOutcomeSummary,
        terminalResult: attempt.terminalResult.status,
      };
};

const readProject = async ({
  rootDir,
  projectId,
  readCurrentRevision,
  inspectProduction,
  readCurrentDelivery,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly readCurrentRevision: ReadCurrentRevision;
  readonly inspectProduction?: (input: {
    readonly locations: ReturnType<typeof createRepositoryProductionLocations>;
    readonly projectId: string;
  }) => Promise<NonNullable<ProjectProductionProgress["inspection"]>>;
  readonly readCurrentDelivery: typeof readCurrentProjectDelivery;
}): Promise<ProjectProductionProgress> => {
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  let inspection: ProjectProductionProgress["inspection"] = null;
  if (inspectProduction !== undefined) {
    try {
      inspection = await inspectProduction({ locations, projectId });
    } catch {
      // Settings diagnostics never alter production authority. A projection
      // failure must not hide a valid attempt or delivery.
    }
  }
  let projection: Awaited<
    ReturnType<typeof readProjectProductionProgressProjection>
  >;
  try {
    projection = await readProjectProductionProgressProjection({
      locations,
      storyId: projectId,
    });
    if (
      projection.attempt !== null &&
      projection.attempt.storyId !== projectId
    ) {
      throw new Error("Execution attempt Project identity is stale.");
    }
  } catch {
    return {
      projectId: StoryIdSchema.parse(projectId),
      status: "error",
      revisionId: null,
      tasks: emptyTasks,
      inspection,
      attempt: null,
      delivery: null,
      error: "当前 attempt 数据无效。",
    };
  }
  const attempt = attemptSummary(projection);
  let delivery: Awaited<ReturnType<typeof readCurrentProjectDelivery>>;
  try {
    delivery = await readCurrentDelivery({ locations, storyId: projectId });
  } catch {
    return {
      projectId: StoryIdSchema.parse(projectId),
      status: "error",
      revisionId: projection.revisionId,
      tasks: projection.attempt?.taskSummary ?? emptyTasks,
      inspection,
      attempt,
      delivery: null,
      error:
        "交付合同、exact file set、media probe、checksum 或 EOF 校验失败。",
    };
  }

  let currentRevisionId: string | null;
  try {
    currentRevisionId = (
      await readCurrentRevision({ locations, projectId })
    ).revisionId;
  } catch {
    if (delivery !== null) {
      return {
        projectId: StoryIdSchema.parse(projectId),
        status: "error",
        revisionId: projection.revisionId,
        tasks: projection.attempt?.taskSummary ?? emptyTasks,
        inspection,
        attempt,
        delivery: null,
        error: "当前 Project authoring inputs 无法计算 Revision。",
      };
    }
    // A partially scaffolded Project may not yet have enough inputs for a
    // Revision. Existing attempt diagnostics remain visible, but never make a
    // delivery current.
    currentRevisionId = projection.revisionId;
  }

  try {
    const sourceCurrent = await readCurrentProjectSource({
      locations,
      storyId: projectId,
    });
    const revisionId =
      currentRevisionId ??
      projection.revisionId ??
      delivery?.revisionId ??
      null;
    const current =
      delivery !== null &&
      sourceCurrent !== null &&
      currentRevisionId !== null &&
      currentRevisionId === delivery.revisionId &&
      sourceCurrent.sourceCurrentId === delivery.sourceCurrentId;
    const status =
      delivery !== null
        ? current
          ? "current"
          : "stale"
        : projection.status === "needs-agent"
          ? "needs-agent"
          : projection.status === "failed"
            ? "failed"
            : projection.attempt?.terminalResult.status === "source-current" &&
                sourceCurrent !== null
              ? "source-current"
              : projection.status === "not-produced"
                ? "not-produced"
                : "converging";
    return {
      projectId: StoryIdSchema.parse(projectId),
      status,
      revisionId,
      tasks: projection.attempt?.taskSummary ?? emptyTasks,
      inspection,
      attempt,
      delivery:
        delivery === null
          ? null
          : {
              deliveryBuildId: delivery.deliveryBuildId,
              revisionId: delivery.revisionId,
              sourceCurrentId: delivery.sourceCurrentId,
              rendererRuntimeFingerprint: delivery.rendererRuntimeFingerprint,
              frameCount: delivery.frameCount,
              current,
              files: {
                video: true,
                cover4x3: true,
                cover3x4: true,
                publish: true,
              },
            },
      error: null,
    };
  } catch {
    return {
      projectId: StoryIdSchema.parse(projectId),
      status: "error",
      revisionId: projection.revisionId,
      tasks: projection.attempt?.taskSummary ?? emptyTasks,
      inspection,
      attempt,
      delivery: null,
      error:
        "交付合同、exact file set、media probe、checksum 或 EOF 校验失败。",
    };
  }
};

export const readProjectProductionProgress = async ({
  rootDir,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly dependencies?: Readonly<{
    readCurrentRevision?: ReadCurrentRevision;
    inspectProduction?: (input: {
      readonly locations: ReturnType<typeof createRepositoryProductionLocations>;
      readonly projectId: string;
    }) => Promise<NonNullable<ProjectProductionProgress["inspection"]>>;
    readCurrentDelivery?: typeof readCurrentProjectDelivery;
  }>;
}): Promise<ProductionProgressResponse> => {
  const readCurrentRevision =
    dependencies.readCurrentRevision ?? readRepositoryCurrentRevision;
  const inspectProduction = dependencies.inspectProduction;
  const readCurrentDelivery =
    dependencies.readCurrentDelivery ?? readCurrentProjectDelivery;
  const projectIds: string[] = [];
  for (const entry of await readLocalProjectRoot(rootDir)) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Project symbolic links are not allowed: ${entry.name}.`);
    }
    if (entry.isDirectory()) projectIds.push(StoryIdSchema.parse(entry.name));
  }
  const projects = await Promise.all(
    projectIds.sort().map((projectId) =>
      readProject({
        rootDir,
        projectId,
        readCurrentRevision,
        inspectProduction,
        readCurrentDelivery,
      }),
    ),
  );
  return ProductionProgressResponseSchema.parse({
    schemaVersion: 5,
    projects,
  });
};
