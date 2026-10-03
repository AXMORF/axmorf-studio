import type { TaskWorkerTransport } from "@axmorf/studio/contracts";

import {
  readSceneTaskPreviewSnapshot,
  renderSceneTaskPreview,
} from "../adapters/task-preview-render";
import { finalizeAgentTaskWorkspace } from "./finalize-agent-task";
import { assertTaskWorkerBinding } from "./task-worker-binding";

export const previewBoundSceneTask = async ({
  rootDir,
  runtimeRootDir = rootDir,
  taskRevision,
  attemptId,
  bindingId,
  transport,
  dependencies = {},
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly transport: TaskWorkerTransport;
  readonly dependencies?: Readonly<{
    assertBinding?: typeof assertTaskWorkerBinding;
    finalizeTask?: typeof finalizeAgentTaskWorkspace;
    renderPreview?: typeof renderSceneTaskPreview;
  }>;
}) => {
  const input = { rootDir, taskRevision, attemptId, bindingId };
  const assertBinding = dependencies.assertBinding ?? assertTaskWorkerBinding;
  const bound = await assertBinding(input);
  if (
    transport !== "shared-workspace" ||
    bound.task.taskKind !== "scene-owner"
  ) {
    return {
      status: "task-preview-unavailable" as const,
      taskRevision: bound.task.taskRevision,
      attemptId,
      reason:
        transport !== "shared-workspace"
          ? ("controller-io-preview-filesystem-access-not-supported" as const)
          : ("scene-owner-task-required" as const),
      scope: "No task outputs or preview files were read or written.",
    };
  }

  // Preview the same fixed projection that commit checks, rather than a separate
  // permissive draft renderer. Only finalize can write derived task outputs.
  await (dependencies.finalizeTask ?? finalizeAgentTaskWorkspace)({
    rootDir,
    runtimeRootDir,
    taskRevision,
  });
  const current = await assertBinding(input);
  const snapshot = await readSceneTaskPreviewSnapshot(current);
  const preview = await (dependencies.renderPreview ?? renderSceneTaskPreview)({
    rootDir,
    runtimeRootDir,
    task: current.task,
    snapshot,
    attemptId,
    assertSourceCurrent: async () => {
      const latest = await assertBinding(input);
      const latestSnapshot = await readSceneTaskPreviewSnapshot(latest);
      if (latestSnapshot.sourceFingerprint !== snapshot.sourceFingerprint) {
        throw new Error("Scene task outputs changed during preview rendering.");
      }
    },
  });
  return {
    status: "scene-task-preview-complete" as const,
    storyId: current.task.storyId,
    meaningId: snapshot.taskInput.meaningId,
    revisionId: current.task.revisionId,
    taskRevision: current.task.taskRevision,
    attemptId,
    sourceFingerprint: snapshot.sourceFingerprint,
    sourceFiles: snapshot.files.map(({ bytes: _bytes, ...file }) => {
      void _bytes;
      return file;
    }),
    preview,
    reviewStatus: "needs-temporal-review" as const,
    notAssessed: [
      "cross-scene-continuity",
      "global-visual-layers",
      "project-background-music-mix",
      "full-resolution-legibility",
      "semantic-correctness",
      "aesthetic-quality",
      "human-listening-review",
    ],
  };
};
