import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  DeliveryLaunchManifestSchema,
  PRODUCTION_RUN_CONTRACT_VERSION,
  ProductionRunIdSchema,
  ProductionWatcherLaunchIntentSchema,
  ProductionWatcherLaunchReceiptSchema,
  RenderLaunchIntentSchema,
  RenderLaunchReceiptSchema,
  StoryIdSchema,
  type ProductionStageEvent,
  type ProductionStageId,
} from "../src/contracts";
import {
  getProductionRunPaths,
  readProductionRunStore,
} from "../scripts/production/adapters/run-store";
import {
  deliveryPathExists,
  readDeliveryJson,
} from "../scripts/delivery/adapters/filesystem";
import { readLocalProjectRoot } from "../scripts/projects/root";

export type ProductionProgressStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "attention"
  | "launched";

export type ProductionProgressStep = Readonly<{
  id:
    | "production-start"
    | "narrative"
    | "scene-freeze"
    | "scenes"
    | "render-ready"
    | "delivery";
  label: string;
  command: string;
  status: ProductionProgressStepStatus;
  detail: string;
  occurredAt: string | null;
}>;

export type ProductionRunProgress = Readonly<{
  runId: string;
  storyId: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  completedSteps: number;
  totalSteps: number;
  steps: readonly ProductionProgressStep[];
}>;

export type ProjectProductionProgress = Readonly<{
  projectId: string;
  status: "idle" | "available" | "error";
  error: string | null;
  run: ProductionRunProgress | null;
}>;

export type ProductionProgressResponse = Readonly<{
  schemaVersion: 2;
  projects: readonly ProjectProductionProgress[];
}>;

const readJson = async (path: string, label: string): Promise<unknown> => {
  let bytes: string;
  try {
    bytes = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  try {
    return JSON.parse(bytes) as unknown;
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const readOptionalJson = async (path: string, label: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${label} must be a regular file.`);
    }
    return await readJson(path, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

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

const findLatestRunIdsByProject = async (rootDir: string) => {
  const runsRoot = join(rootDir, ".producer-runs");
  let entries;
  try {
    entries = await readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        latestRunIds: new Map<string, string>(),
        invalidProjectIds: new Set<string>(),
      };
    }
    throw error;
  }
  if (entries.length === 0) {
    return {
      latestRunIds: new Map<string, string>(),
      invalidProjectIds: new Set<string>(),
    };
  }

  const invalidProjectIds = new Set<string>();

  const runs = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error("Production runs root contains an unsafe entry.");
      }
      const runId = ProductionRunIdSchema.parse(entry.name);
      const raw = await readJson(
        join(runsRoot, runId, "run.json"),
        "Production run manifest",
      );
      if (
        raw === null ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        (raw as Record<string, unknown>).contractVersion !==
          PRODUCTION_RUN_CONTRACT_VERSION
      ) {
        return null;
      }
      const identity = raw as Record<string, unknown>;
      const storyId = StoryIdSchema.parse(identity.storyId);
      if (
        identity.runId !== runId ||
        typeof identity.createdAt !== "string" ||
        Number.isNaN(Date.parse(identity.createdAt))
      ) {
        invalidProjectIds.add(storyId);
        return null;
      }
      return {
        runId,
        storyId,
        createdAt: identity.createdAt,
        createdAtMs: Date.parse(identity.createdAt),
      };
    }),
  );
  const currentRuns = runs.filter((run) => run !== null);
  const latestByProject = new Map<string, (typeof currentRuns)[number]>();
  for (const run of currentRuns) {
    const previous = latestByProject.get(run.storyId);
    if (
      previous === undefined ||
      run.createdAtMs > previous.createdAtMs ||
      (run.createdAtMs === previous.createdAtMs &&
        run.runId.localeCompare(previous.runId) > 0)
    ) {
      latestByProject.set(run.storyId, run);
    }
  }
  return {
    latestRunIds: new Map(
      [...latestByProject].map(([projectId, run]) => [projectId, run.runId]),
    ),
    invalidProjectIds,
  };
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

const inspectWatcherStatus = async ({
  rootDir,
  runId,
  storyId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly storyId: string;
}) => {
  const paths = getProductionRunPaths({ rootDir, runId });
  const [rawIntent, rawReceipt] = await Promise.all([
    readOptionalJson(paths.watcherLaunchIntent, "Watcher launch intent"),
    readOptionalJson(paths.watcherLaunchReceipt, "Watcher launch receipt"),
  ]);
  if (rawReceipt !== null && rawIntent === null) {
    throw new Error("Watcher launch receipt exists without its intent.");
  }
  if (rawIntent === null)
    return { status: "pending" as const, startedAt: null };
  const intent = ProductionWatcherLaunchIntentSchema.parse(rawIntent);
  if (intent.runId !== runId || intent.storyId !== storyId) {
    throw new Error("Watcher launch intent is stale.");
  }
  if (rawReceipt === null) {
    return { status: "attention" as const, startedAt: null };
  }
  const receipt = ProductionWatcherLaunchReceiptSchema.parse(rawReceipt);
  if (
    receipt.runId !== runId ||
    receipt.storyId !== storyId ||
    receipt.intentFingerprint !== intent.intentFingerprint
  ) {
    throw new Error("Watcher launch receipt is stale.");
  }
  return { status: "running" as const, startedAt: receipt.startedAt };
};

export const inspectDeliveryProgress = async ({
  rootDir,
  storyId,
  renderReadyFingerprint,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly renderReadyFingerprint: string | null;
}): Promise<
  Pick<ProductionProgressStep, "status" | "detail" | "occurredAt">
> => {
  if (renderReadyFingerprint === null) {
    return {
      status: "pending",
      detail: "等待生产流程进入 render-ready",
      occurredAt: null,
    };
  }
  const base = `deliveries/${storyId}`;
  const manifestPath = `${base}/delivery-launch-manifest.json`;
  if (!(await deliveryPathExists(join(rootDir, manifestPath)))) {
    return {
      status: "pending",
      detail: "等待当前 Run 的 Cover 与交付包就绪",
      occurredAt: null,
    };
  }
  const manifest = DeliveryLaunchManifestSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: manifestPath }),
  );
  if (
    manifest.storyId !== storyId ||
    manifest.renderReadyFingerprint !== renderReadyFingerprint
  ) {
    return {
      status: "pending",
      detail: "等待与当前 Run 绑定的新交付包",
      occurredAt: null,
    };
  }

  const intentPath = `${base}/render-launch-intent.json`;
  if (!(await deliveryPathExists(join(rootDir, intentPath)))) {
    return {
      status: "failed",
      detail: "当前交付包缺少 render launch intent",
      occurredAt: null,
    };
  }
  const intent = RenderLaunchIntentSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: intentPath }),
  );
  if (
    intent.deliveryId !== manifest.deliveryId ||
    intent.renderReadyFingerprint !== renderReadyFingerprint
  ) {
    throw new Error("Delivery render launch intent is stale.");
  }

  const receiptPath = `${base}/render-launch-receipt.json`;
  if (!(await deliveryPathExists(join(rootDir, receiptPath)))) {
    return {
      status: "attention",
      detail: "已写入启动意图但缺少 spawn 回执（launch-ambiguous）",
      occurredAt: null,
    };
  }
  const receipt = RenderLaunchReceiptSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: receiptPath }),
  );
  if (
    receipt.deliveryId !== intent.deliveryId ||
    receipt.storyId !== storyId ||
    receipt.intentFingerprint !== intent.intentFingerprint ||
    receipt.commandFingerprint !== intent.commandFingerprint ||
    receipt.outputPath !== intent.outputPath
  ) {
    throw new Error("Delivery render launch receipt is stale.");
  }
  return {
    status: "launched",
    detail: "Remotion 已收到 spawn 确认；不代表 MP4 已完成",
    occurredAt: receipt.startedAt,
  };
};

const readRunProductionProgress = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}): Promise<ProductionRunProgress> => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const eventFor = (stageId: ProductionStageId) =>
    latestStageEvent(loaded.events, stageId);
  const startEvent = eventFor("production-start");
  const narrativeEvent = eventFor("narrative");
  const freezeEvent = eventFor("scene-freeze");
  const scenesEvent = eventFor("scenes");
  const renderReadyEvent = eventFor("render-ready");
  const watcher = await inspectWatcherStatus({
    rootDir,
    runId,
    storyId: loaded.run.storyId,
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
  const acceptedSceneCount = loaded.state.acceptedSceneResults.length;
  const globalVisualAccepted = loaded.state.acceptedGlobalVisualResult !== null;
  const renderReadyFingerprint =
    renderReadyEvent !== null && "outputArtifacts" in renderReadyEvent
      ? (renderReadyEvent.outputArtifacts.find(
          (artifact) => artifact.artifactId === "production-render-ready",
        )?.fingerprint ?? null)
      : null;
  const delivery = await inspectDeliveryProgress({
    rootDir,
    storyId: loaded.run.storyId,
    renderReadyFingerprint,
  });

  let scenesStatus: ProductionProgressStepStatus = stageStatus(scenesEvent);
  const scenesOccurredAt = scenesEvent?.occurredAt ?? watcher.startedAt;
  let scenesDetail = `${acceptedSceneCount} / ${assignmentCount} 个 Scene 已收敛，GlobalVisual ${
    globalVisualAccepted ? "已收敛" : "等待中"
  }`;
  if (watcher.status === "attention") {
    scenesStatus = "attention";
    scenesDetail =
      "Watcher 已写入启动意图但缺少 spawn 回执（launch-ambiguous）";
  } else if (scenesStatus === "pending" && watcher.status === "running") {
    scenesStatus = "running";
    scenesDetail = "Watcher 已启动，等待 owner receipts";
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
      label: "Watcher 收敛制作结果",
      command: "npm run production:watch:start",
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
}: {
  readonly rootDir: string;
}): Promise<ProductionProgressResponse> => {
  const [sourceProjectIds, discovery] = await Promise.all([
    discoverSourceProjectIds(rootDir),
    findLatestRunIdsByProject(rootDir),
  ]);
  const projectIds = [
    ...new Set([
      ...sourceProjectIds,
      ...discovery.latestRunIds.keys(),
      ...discovery.invalidProjectIds,
    ]),
  ].sort();
  const projects = await Promise.all(
    projectIds.map(async (projectId): Promise<ProjectProductionProgress> => {
      if (discovery.invalidProjectIds.has(projectId)) {
        return {
          projectId,
          status: "error",
          error:
            "Run discovery identity 无效；请检查该 Project 的 Run manifest。",
          run: null,
        };
      }
      const runId = discovery.latestRunIds.get(projectId);
      if (runId === undefined) {
        return { projectId, status: "idle", error: null, run: null };
      }
      try {
        const run = await readRunProductionProgress({ rootDir, runId });
        if (run.storyId !== projectId) {
          throw new Error("Production run Project identity is stale.");
        }
        return { projectId, status: "available", error: null, run };
      } catch {
        return {
          projectId,
          status: "error",
          error: "最新 Run 状态不可用；请检查该 Project 的 Run 与交付产物。",
          run: null,
        };
      }
    }),
  );
  return { schemaVersion: 2, projects };
};
