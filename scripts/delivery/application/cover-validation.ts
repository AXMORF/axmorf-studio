import { join } from "node:path";

import {
  buildDeliveryCoverPackage,
  type DeliveryCoverAssignment,
} from "../../../src/contracts";
import type { ProcessRunner } from "../../baseline/evidence";
import { inspectDeliveryFile } from "../adapters/filesystem";
import { collectDeliveryCoverSourceGraph } from "../adapters/cover-source";
import {
  inspectDeliveryCover,
  inspectDeliveryCoverThumbnail,
  renderDeliveryCoverV2,
} from "../adapters/media";

export const validateDeliveryCoverAuthoring = async ({
  rootDir,
  assignment,
  workspace,
  runProcess,
}: {
  readonly rootDir: string;
  readonly assignment: DeliveryCoverAssignment;
  readonly workspace: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const graph = await collectDeliveryCoverSourceGraph({
    rootDir,
    storyId: assignment.storyId,
    compositionId: assignment.compositionBaseId,
  });
  const coverPackage = buildDeliveryCoverPackage({
    storyId: assignment.storyId,
    compositionId: assignment.compositionBaseId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    storyFingerprint: assignment.storyFingerprint,
    visualStyleSpecFingerprint: assignment.visualStyleSpecFingerprint,
    coverSpecFingerprint: assignment.coverSpecFingerprint,
    sourceFiles: graph.files,
    sourceGraphFingerprint: graph.sourceGraphFingerprint,
    compositions: graph.compositions,
  });
  const outputs = [
    {
      variantId: "cover-4x3" as const,
      compositionId: `${assignment.compositionBaseId}DeliveryCover4x3V2`,
      fileName: "cover-4x3.png" as const,
      width: 1600,
      height: 1200,
      thumbnail: { width: 320, height: 240 },
    },
    {
      variantId: "cover-3x4" as const,
      compositionId: `${assignment.compositionBaseId}DeliveryCover3x4V2`,
      fileName: "cover-3x4.png" as const,
      width: 1200,
      height: 1600,
      thumbnail: { width: 240, height: 320 },
    },
  ] as const;
  const checked = [];
  for (const output of outputs) {
    const path = join(workspace, output.fileName);
    await renderDeliveryCoverV2({
      rootDir,
      projectId: assignment.storyId,
      compositionId: output.compositionId,
      outputPath: path,
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    const media = await inspectDeliveryCover({
      absolutePath: path,
      expected: { width: output.width, height: output.height },
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    const thumbnail = await inspectDeliveryCoverThumbnail({
      absolutePath: path,
      expected: output.thumbnail,
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    const file = await inspectDeliveryFile(path);
    checked.push({ output, path, media, thumbnail, file });
  }
  return {
    coverPackage,
    checked: checked as unknown as readonly [
      (typeof checked)[number],
      (typeof checked)[number],
    ],
  } as const;
};
