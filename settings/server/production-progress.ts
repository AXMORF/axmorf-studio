import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { DeliveryPublishSchema, StoryIdSchema } from "../../src/contracts";
import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import { readProjectProductionProgressProjection } from "../../scripts/project-production/application/progress-query";
import { readLocalProjectRoot } from "../../scripts/projects/root";
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

const inspectFile = async (path: string) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Delivery contains an unsafe file.");
  }
  const bytes = await readFile(path);
  return {
    checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    sizeBytes: bytes.byteLength,
  } as const;
};

const readDelivery = async (rootDir: string, projectId: string) => {
  const directory = join(rootDir, "deliveries", projectId);
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Delivery root is unsafe.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
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
    throw new Error("Delivery does not contain exactly four regular files.");
  }

  const publish = DeliveryPublishSchema.parse(
    JSON.parse(await readFile(join(directory, "publish.json"), "utf8")),
  );
  if (publish.storyId !== projectId) {
    throw new Error("Delivery Project identity is stale.");
  }
  const checked = await Promise.all([
    inspectFile(join(directory, "video.mp4")),
    inspectFile(join(directory, "cover-4x3.png")),
    inspectFile(join(directory, "cover-3x4.png")),
  ]);
  for (const [index, key] of (
    ["video", "cover4x3", "cover3x4"] as const
  ).entries()) {
    if (
      publish.artifacts[key].checksum !== checked[index]?.checksum ||
      publish.artifacts[key].sizeBytes !== checked[index]?.sizeBytes
    ) {
      throw new Error("Delivery checksum is stale.");
    }
  }
  return publish;
};

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
        planFingerprint: attempt.planFingerprint,
        artifactSetFingerprint: attempt.artifactSetFingerprint,
        state: attempt.state,
        updatedAt: attempt.updatedAt,
        diagnosticCode: attempt.diagnosticCode,
        tasks: attempt.taskSummary,
        taskOutcomes: attempt.taskOutcomeSummary,
        deliveryResult: attempt.deliveryResult.status,
      };
};

const readProject = async ({
  rootDir,
  projectId,
  readCurrentRevision,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly readCurrentRevision: typeof readCurrentProductionRevision;
}): Promise<ProjectProductionProgress> => {
  let projection: Awaited<
    ReturnType<typeof readProjectProductionProgressProjection>
  >;
  try {
    projection = await readProjectProductionProgressProjection({
      rootDir,
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
      attempt: null,
      delivery: null,
      error: "当前 attempt 数据无效。",
    };
  }
  const attempt = attemptSummary(projection);
  let delivery: Awaited<ReturnType<typeof readDelivery>>;
  try {
    delivery = await readDelivery(rootDir, projectId);
  } catch {
    return {
      projectId: StoryIdSchema.parse(projectId),
      status: "error",
      revisionId: projection.revisionId,
      tasks: projection.attempt?.taskSummary ?? emptyTasks,
      attempt,
      delivery: null,
      error: "交付合同、exact file set 或 checksum 校验失败。",
    };
  }

  let currentRevisionId: string | null;
  try {
    currentRevisionId = (await readCurrentRevision({ rootDir, projectId }))
      .revisionId;
  } catch {
    if (delivery !== null) {
      return {
        projectId: StoryIdSchema.parse(projectId),
        status: "error",
        revisionId: projection.revisionId,
        tasks: projection.attempt?.taskSummary ?? emptyTasks,
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
    const revisionId =
      currentRevisionId ??
      projection.revisionId ??
      delivery?.revisionId ??
      null;
    const current =
      delivery !== null &&
      currentRevisionId !== null &&
      currentRevisionId === delivery.revisionId;
    const status =
      delivery !== null
        ? current
          ? "current"
          : "stale"
        : projection.status === "needs-agent"
          ? "needs-agent"
          : projection.status === "failed"
            ? "failed"
            : projection.status === "not-produced"
              ? "not-produced"
              : "converging";
    return {
      projectId: StoryIdSchema.parse(projectId),
      status,
      revisionId,
      tasks: projection.attempt?.taskSummary ?? emptyTasks,
      attempt,
      delivery:
        delivery === null
          ? null
          : {
              deliveryBuildId: delivery.deliveryBuildId,
              revisionId: delivery.revisionId,
              artifactSetFingerprint: delivery.artifactSetFingerprint,
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
      attempt,
      delivery: null,
      error: "交付合同、exact file set 或 checksum 校验失败。",
    };
  }
};

export const readProjectProductionProgress = async ({
  rootDir,
  dependencies = {
    readCurrentRevision: readCurrentProductionRevision,
  },
}: {
  readonly rootDir: string;
  readonly dependencies?: Readonly<{
    readCurrentRevision: typeof readCurrentProductionRevision;
  }>;
}): Promise<ProductionProgressResponse> => {
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
        readCurrentRevision: dependencies.readCurrentRevision,
      }),
    ),
  );
  return ProductionProgressResponseSchema.parse({
    schemaVersion: 4,
    projects,
  });
};
