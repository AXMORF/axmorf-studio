import {
  PROJECT_BUILD_STEP_IDS,
  StoryIdSchema,
  type ProductionStageEvent,
  type ProductionStageId,
} from "../../src/contracts";
import {
  discoverLatestProductionProgressRuns,
  readProductionProgressRun,
  readProductionOwnerReceiptProgress,
} from "../../scripts/production/application/progress-query";
import { readDeliveryProgressProjection } from "../../scripts/delivery/application/progress-query";
import {
  PROJECT_BUILD_STEP_COPY,
  readProjectBuildProgressProjection,
  type ProjectBuildProgressProjection,
  type ProjectSourceSnapshotCollector,
} from "../../scripts/project-build/application/progress-query";
import { readLocalProjectRoot } from "../../scripts/projects/root";
import type {
  ProductionProgressStep,
  ProductionProgressStepStatus,
  ProductionRunProgress,
} from "../contracts/api";
import {
  ProductionProgressResponseSchema,
  type ProductionProgressResponse,
} from "../contracts/api";

const discoverSourceProjectIds = async (rootDir: string) => {
  const projectIds: string[] = [];
  for (const entry of await readLocalProjectRoot(rootDir)) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Project symbolic links are not allowed: ${entry.name}.`);
    }
    if (!entry.isDirectory()) continue;
    projectIds.push(StoryIdSchema.parse(entry.name));
  }
  return projectIds;
};

const latestStageEvent = (
  events: readonly ProductionStageEvent[],
  stageId: ProductionStageId,
) => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.stageId === stageId) return event;
  }
  return null;
};

const stageStatus = (
  event: ProductionStageEvent | null,
): Exclude<ProductionProgressStepStatus, "attention" | "launched"> => {
  if (event === null) return "pending";
  if (event.type === "stage-failed") return "failed";
  if (event.type === "stage-succeeded" || event.type === "render-ready") {
    return "succeeded";
  }
  return "running";
};

const failedDetail = (event: ProductionStageEvent | null, fallback: string) =>
  event?.type === "stage-failed" ? event.error.summary : fallback;

const readRunProductionProgress = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}): Promise<ProductionRunProgress> => {
  const loaded = await readProductionProgressRun({ rootDir, runId });
  const eventFor = (stageId: ProductionStageId) =>
    latestStageEvent(loaded.events, stageId);
  const startEvent = eventFor("production-start");
  const narrativeEvent = eventFor("narrative");
  const freezeEvent = eventFor("scene-freeze");
  const scenesEvent = eventFor("scenes");
  const renderReadyEvent = eventFor("render-ready");
  const ownerReceipts = await readProductionOwnerReceiptProgress({
    rootDir,
    runId,
  });

  const freezeSucceededEvent = loaded.events.find(
    (event) =>
      event.stageId === "scene-freeze" && event.type === "stage-succeeded",
  );
  const assignmentCount =
    freezeSucceededEvent?.type === "stage-succeeded"
      ? freezeSucceededEvent.outputArtifacts.filter((artifact) =>
          artifact.artifactId.startsWith("scene-assignment."),
        ).length
      : 0;
  const renderReadyFingerprint =
    renderReadyEvent !== null && "outputArtifacts" in renderReadyEvent
      ? (renderReadyEvent.outputArtifacts.find(
          (artifact) => artifact.artifactId === "production-render-ready",
        )?.fingerprint ?? null)
      : null;
  let delivery = await readDeliveryProgressProjection({
    rootDir,
    storyId: loaded.run.storyId,
    renderReadyFingerprint,
  });

  let scenesStatus: ProductionProgressStepStatus = stageStatus(scenesEvent);
  const scenesOccurredAt =
    scenesEvent?.occurredAt ?? ownerReceipts.latestReceiptAt;
  let scenesDetail = `${ownerReceipts.receivedSceneReceipts} / ${ownerReceipts.expectedSceneReceipts} 个 Scene owner receipts，GlobalVisual ${
    ownerReceipts.globalVisualReceipt === "missing" ||
    ownerReceipts.globalVisualReceipt === "not-frozen"
      ? "等待中"
      : "已收到"
  }`;
  if (
    scenesStatus === "pending" &&
    ownerReceipts.receivedRenderReadyReceipts > 0
  ) {
    scenesStatus = "running";
  }
  if (
    (scenesStatus === "pending" || scenesStatus === "running") &&
    ownerReceipts.expectedRenderReadyReceipts > 0 &&
    ownerReceipts.receivedRenderReadyReceipts ===
      ownerReceipts.expectedRenderReadyReceipts
  ) {
    scenesStatus = "running";
    scenesDetail = "Owner receipts 已齐全，等待固定 production:finalize 收敛";
  }
  if (
    loaded.state.state === "render-ready" &&
    renderReadyEvent !== null &&
    ownerReceipts.coverReceipt === "missing"
  ) {
    delivery = {
      status: "attention",
      detail: "render-ready 已完成，Cover receipt 缺失，自动交付被阻塞",
      occurredAt: renderReadyEvent.occurredAt,
    };
  } else if (
    loaded.state.state === "render-ready" &&
    renderReadyEvent !== null &&
    ownerReceipts.coverReceipt === "owner-failed"
  ) {
    delivery = {
      status: "attention",
      detail: "render-ready 已完成，Cover owner 明确失败，自动交付被阻塞",
      occurredAt: ownerReceipts.latestReceiptAt,
    };
  }

  const steps: ProductionProgressStep[] = [
    {
      id: "production-start",
      label: "前置检查并建立 Run",
      command: "npm run production:start",
      status: stageStatus(startEvent),
      detail: failedDetail(startEvent, "Run manifest 与初始状态已建立"),
      occurredAt: startEvent?.occurredAt ?? null,
    },
    {
      id: "narrative",
      label: "旁白、时序与自动检查",
      command: "npm run production:narrative",
      status: stageStatus(narrativeEvent),
      detail: failedDetail(narrativeEvent, "Narrative baseline 已生成并封存"),
      occurredAt: narrativeEvent?.occurredAt ?? null,
    },
    {
      id: "scene-freeze",
      label: "冻结 Scene 制作任务",
      command: "npm run production:scene:freeze",
      status: stageStatus(freezeEvent),
      detail: failedDetail(
        freezeEvent,
        assignmentCount === 0
          ? "等待冻结 Scene assignments"
          : `${assignmentCount} 个 Scene assignments 已冻结`,
      ),
      occurredAt: freezeEvent?.occurredAt ?? null,
    },
    {
      id: "scenes",
      label: "Owner 创作与固定收敛",
      command: "npm run production:finalize",
      status: scenesStatus,
      detail: failedDetail(scenesEvent, scenesDetail),
      occurredAt: scenesOccurredAt,
    },
    {
      id: "render-ready",
      label: "生成渲染计划",
      command: "npm run production:render-ready:check",
      status: stageStatus(renderReadyEvent),
      detail: failedDetail(
        renderReadyEvent,
        "Composition 与 render plan 已进入 render-ready",
      ),
      occurredAt: renderReadyEvent?.occurredAt ?? null,
    },
    {
      id: "delivery",
      label: "构建交付并启动渲染",
      command: "npm run delivery:build",
      ...delivery,
    },
  ];
  const completedSteps = steps.filter(
    (step) => step.status === "succeeded" || step.status === "launched",
  ).length;
  const updatedAt = steps.reduce((latest, step) => {
    if (step.occurredAt === null) return latest;
    return Date.parse(step.occurredAt) > Date.parse(latest)
      ? step.occurredAt
      : latest;
  }, loaded.run.createdAt);
  return {
    runId: loaded.run.runId,
    storyId: loaded.run.storyId,
    createdAt: loaded.run.createdAt,
    updatedAt,
    state: loaded.state.state,
    completedSteps,
    totalSteps: steps.length,
    steps,
  };
};

export const readProjectProductionProgress = async ({
  rootDir,
  collectSnapshot,
}: {
  readonly rootDir: string;
  readonly collectSnapshot?: ProjectSourceSnapshotCollector;
}): Promise<ProductionProgressResponse> => {
  const [sourceProjectIds, discovery] = await Promise.all([
    discoverSourceProjectIds(rootDir),
    discoverLatestProductionProgressRuns(rootDir),
  ]);
  const projectIds = [
    ...new Set([
      ...sourceProjectIds,
      ...discovery.latestRunIds.keys(),
      ...discovery.invalidProjectIds,
    ]),
  ].sort();
  const projects = await Promise.all(
    projectIds.map(async (projectId) => {
      let build: ProjectBuildProgressProjection;
      let buildError: string | null = null;
      try {
        build = await readProjectBuildProgressProjection({
          rootDir,
          projectId,
          ...(collectSnapshot === undefined ? {} : { collectSnapshot }),
        });
      } catch {
        buildError = "交付状态异常；请检查 publish.json 与四文件完整性。";
        build = {
          status: "not-built",
          buildId: null,
          completedSteps: 0,
          detail: buildError,
          delivery: null,
          steps: PROJECT_BUILD_STEP_IDS.map((id) => ({
            id,
            label: PROJECT_BUILD_STEP_COPY[id].label,
            status: id === "verify" ? "failed" : "pending",
            detail:
              id === "verify"
                ? "交付合同、文件类型、大小或 checksum 校验失败"
                : PROJECT_BUILD_STEP_COPY[id].pending,
            occurredAt: null,
            reused: null,
          })),
          totalSteps: 6,
          updatedAt: null,
        };
      }
      let auditedRun: ProductionRunProgress | null = null;
      let auditedRunError: string | null = null;
      if (discovery.invalidProjectIds.has(projectId)) {
        auditedRunError =
          "Run discovery identity 无效；请检查该 Project 的 Run manifest。";
      }
      const runId = discovery.latestRunIds.get(projectId);
      if (runId !== undefined && auditedRunError === null) {
        try {
          auditedRun = await readRunProductionProgress({ rootDir, runId });
          if (auditedRun.storyId !== projectId) {
            throw new Error("Production run Project identity is stale.");
          }
        } catch {
          auditedRun = null;
          auditedRunError =
            "最新 audited Run 状态不可用；请检查该 Run 的 current contract 数据。";
        }
      }
      const { status: buildStatus, ...buildView } = build;
      return {
        projectId,
        status: buildError === null ? buildStatus : ("error" as const),
        error: buildError,
        build: buildView,
        auditedRun,
        auditedRunError,
      };
    }),
  );
  return ProductionProgressResponseSchema.parse({ schemaVersion: 3, projects });
};
