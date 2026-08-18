import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  PROJECT_BUILD_STEP_IDS,
  ProjectPublishSchema,
  type ProjectBuildProgress,
  type ProjectBuildStepId,
} from "../../../src/contracts";
import {
  inspectDeliveryFile,
  readDeliveryJson,
} from "../../delivery/adapters/filesystem";
import { readProjectBuildProgress } from "../adapters/progress";
import {
  collectProjectSourceSnapshot,
  type ProjectSourceSnapshot,
} from "../adapters/source-snapshot";

export type ProjectSourceSnapshotCollector =
  typeof collectProjectSourceSnapshot;

export const PROJECT_BUILD_STEP_COPY = {
  prepare: {
    label: "准备 Project 并绑定 buildId",
    pending: "等待执行固定 project:build 命令",
  },
  video: { label: "构建视频", pending: "等待 Project 准备完成" },
  "cover-4x3": { label: "构建 4:3 Cover", pending: "等待视频构建完成" },
  "cover-3x4": {
    label: "构建 3:4 Cover",
    pending: "等待 4:3 Cover 构建完成",
  },
  verify: { label: "验证四文件交付", pending: "等待视频与两个 Cover 就绪" },
  promote: {
    label: "原子提升 current delivery",
    pending: "等待四文件验证通过",
  },
} as const satisfies Record<
  ProjectBuildStepId,
  Readonly<{ label: string; pending: string }>
>;

export type ProjectBuildProgressProjection = Readonly<{
  status: "not-built" | "building" | "current" | "stale" | "failed";
  buildId: string | null;
  completedSteps: number;
  detail: string;
  delivery: null | Readonly<{
    buildId: string;
    sourceSnapshotFingerprint: string;
    frameCount: number;
    sourceCurrent: boolean;
    updatedAt: string;
    files: Readonly<{
      video: true;
      cover4x3: true;
      cover3x4: true;
      publish: true;
    }>;
  }>;
  steps: readonly Readonly<{
    id: ProjectBuildStepId;
    label: string;
    status: "pending" | "running" | "succeeded" | "failed";
    detail: string;
    occurredAt: string | null;
    reused: boolean | null;
  }>[];
  totalSteps: 6;
  updatedAt: string | null;
}>;

const defaultSteps = () =>
  PROJECT_BUILD_STEP_IDS.map((id) => ({
    id,
    label: PROJECT_BUILD_STEP_COPY[id].label,
    status: "pending" as const,
    detail: PROJECT_BUILD_STEP_COPY[id].pending,
    occurredAt: null,
    reused: null,
  }));

const completedSteps = (occurredAt: string) =>
  PROJECT_BUILD_STEP_IDS.map((id) => ({
    id,
    label: PROJECT_BUILD_STEP_COPY[id].label,
    status: "succeeded" as const,
    detail: id === "promote" ? "四文件已成为 current delivery" : "已完成",
    occurredAt,
    reused: null,
  }));

const progressStepDetail = (step: ProjectBuildProgress["steps"][number]) => {
  if (step.status === "pending")
    return PROJECT_BUILD_STEP_COPY[step.id].pending;
  if (step.status === "running") return "固定构建命令正在执行此阶段";
  if (step.status === "failed") return "此阶段失败；请检查终端中的安全诊断";
  if (step.reused === true) return "已复用同 buildId staging 中的验证产物";
  return "已完成";
};

const progressSteps = (progress: ProjectBuildProgress) =>
  progress.steps.map((step) => ({
    ...step,
    label: PROJECT_BUILD_STEP_COPY[step.id].label,
    detail: progressStepDetail(step),
  }));

const inspectCurrentDelivery = async ({
  rootDir,
  projectId,
  snapshot,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly snapshot: ProjectSourceSnapshot;
}) => {
  const directory = join(rootDir, "deliveries", projectId);
  let directoryMetadata;
  try {
    directoryMetadata = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error("Project delivery directory is unsafe.");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const expected = [
    "cover-3x4.png",
    "cover-4x3.png",
    "publish.json",
    "video.mp4",
  ];
  const actual = entries.map(({ name }) => name).sort();
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index]) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new Error("Project delivery does not contain the exact four files.");
  }
  const publishPath = `deliveries/${projectId}/publish.json`;
  const publish = ProjectPublishSchema.parse(
    await readDeliveryJson({ rootDir, relativePath: publishPath }),
  );
  if (publish.storyId !== projectId) {
    throw new Error("Project delivery story identity is stale.");
  }
  const [video, cover4x3, cover3x4, publishMetadata] = await Promise.all([
    inspectDeliveryFile(join(directory, "video.mp4")),
    inspectDeliveryFile(join(directory, "cover-4x3.png")),
    inspectDeliveryFile(join(directory, "cover-3x4.png")),
    lstat(join(directory, "publish.json")),
  ]);
  for (const [recorded, inspected] of [
    [publish.artifacts.video, video],
    [publish.artifacts.cover4x3, cover4x3],
    [publish.artifacts.cover3x4, cover3x4],
  ] as const) {
    if (
      recorded.checksum !== inspected.checksum ||
      recorded.sizeBytes !== inspected.sizeBytes
    ) {
      throw new Error("Project delivery artifact checksum is stale.");
    }
  }
  return {
    buildId: publish.buildId,
    sourceSnapshotFingerprint: publish.sourceSnapshotFingerprint,
    frameCount: publish.frameCount,
    sourceCurrent:
      publish.sourceSnapshotFingerprint === snapshot.fingerprint &&
      publish.sourceFileCount === snapshot.files.length,
    updatedAt: publishMetadata.mtime.toISOString(),
    files: {
      video: true,
      cover4x3: true,
      cover3x4: true,
      publish: true,
    },
  } as const;
};

export const readProjectBuildProgressProjection = async ({
  rootDir,
  projectId,
  collectSnapshot = collectProjectSourceSnapshot,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly collectSnapshot?: typeof collectProjectSourceSnapshot;
}): Promise<ProjectBuildProgressProjection> => {
  const snapshot = await collectSnapshot({ rootDir, projectId });
  const [delivery, progress] = await Promise.all([
    inspectCurrentDelivery({ rootDir, projectId, snapshot }),
    readProjectBuildProgress({ rootDir, projectId }),
  ]);
  const relevantProgress =
    progress === null ||
    (progress.sourceSnapshotFingerprint !== null &&
      progress.sourceSnapshotFingerprint !== snapshot.fingerprint)
      ? null
      : progress;
  const promotedCurrent =
    relevantProgress?.state === "succeeded" &&
    relevantProgress.currentStep === "promote" &&
    delivery?.sourceCurrent === true;
  if (relevantProgress !== null && !promotedCurrent) {
    const steps = progressSteps(relevantProgress);
    return {
      status: relevantProgress.state === "failed" ? "failed" : "building",
      buildId: relevantProgress.buildId,
      completedSteps: steps.filter(({ status }) => status === "succeeded")
        .length,
      detail:
        relevantProgress.state === "failed"
          ? "构建失败；上一版有效交付未被替换"
          : "构建正在执行；若终端已退出，本次构建可能已中断",
      delivery,
      steps,
      totalSteps: 6,
      updatedAt: relevantProgress.updatedAt,
    };
  }
  if (delivery === null) {
    return {
      status: "not-built",
      buildId: null,
      completedSteps: 0,
      detail: "尚未生成四文件交付",
      delivery: null,
      steps: defaultSteps(),
      totalSteps: 6,
      updatedAt: null,
    };
  }
  if (!delivery.sourceCurrent) {
    return {
      status: "stale",
      buildId: delivery.buildId,
      completedSteps: 0,
      detail: "上一版交付仍有效，当前源码尚未构建",
      delivery,
      steps: defaultSteps(),
      totalSteps: 6,
      updatedAt: delivery.updatedAt,
    };
  }
  const steps = completedSteps(delivery.updatedAt);
  return {
    status: "current",
    buildId: delivery.buildId,
    completedSteps: steps.length,
    detail: "当前源码对应的四文件交付已完成",
    delivery,
    steps,
    totalSteps: 6,
    updatedAt: delivery.updatedAt,
  };
};
