import { join } from "node:path";

import type { ProcessRunner } from "../../baseline/evidence";
import {
  DeliveryCoverAssignmentSchema,
  DeliveryCoverPackageSchema,
  DeliveryCoverResultSchema,
  StoryIdSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildDeliveryCoverAssignment,
  buildDeliveryCoverPackage,
} from "../../../src/contracts";
import {
  checksumDeliveryBytes,
  readDeliveryJson,
} from "../adapters/filesystem";
import { collectDeliveryCoverSourceGraph } from "../adapters/cover-source";
import {
  coverResultRelativeRoot,
  readCoverJson,
  readCoverRegularFile,
} from "../adapters/cover-files";
import {
  inspectDeliveryCover,
  inspectDeliveryCoverThumbnail,
} from "../adapters/media";

export const loadCurrentDeliveryCoverAssignment = async ({
  rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const [story, visualStyle, rawStored] = await Promise.all([
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/story.json`,
    }).then(StorySpecSchema.parse),
    readDeliveryJson({
      rootDir,
      relativePath: `src/projects/${projectId}/visual-style.json`,
    }).then(VisualStyleSpecSchema.parse),
    readCoverJson({
      rootDir,
      relativePath: `src/projects/${projectId}/delivery/cover/assignment.generated.json`,
    }),
  ]);
  const stored = DeliveryCoverAssignmentSchema.parse(rawStored);
  const current = buildDeliveryCoverAssignment({ story, visualStyle });
  if (
    stored.assignmentFingerprint !== current.assignmentFingerprint ||
    stored.storyId !== projectId
  ) {
    throw new Error("DeliveryCoverAssignment is stale against current inputs.");
  }
  return { assignment: current, story, visualStyle } as const;
};

export const loadCurrentDeliveryCoverResult = async ({
  rootDir,
  projectId,
  runProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const current = await loadCurrentDeliveryCoverAssignment({
    rootDir,
    projectId,
  });
  const resultRoot = coverResultRelativeRoot(current.assignment);
  const [rawPackage, rawResult, graph] = await Promise.all([
    readCoverJson({
      rootDir,
      relativePath: `${resultRoot}/cover-package.generated.json`,
    }),
    readCoverJson({
      rootDir,
      relativePath: `${resultRoot}/cover-result.generated.json`,
    }),
    collectDeliveryCoverSourceGraph({
      rootDir,
      storyId: current.assignment.storyId,
      compositionId: current.assignment.compositionBaseId,
    }),
  ]);
  const coverPackage = DeliveryCoverPackageSchema.parse(rawPackage);
  const result = DeliveryCoverResultSchema.parse(rawResult);
  const expectedPackage = buildDeliveryCoverPackage({
    storyId: current.assignment.storyId,
    compositionId: current.assignment.compositionBaseId,
    assignmentFingerprint: current.assignment.assignmentFingerprint,
    storyFingerprint: current.assignment.storyFingerprint,
    visualStyleSpecFingerprint:
      current.assignment.visualStyleSpecFingerprint,
    coverSpecFingerprint: current.assignment.coverSpecFingerprint,
    sourceFiles: graph.files,
    sourceGraphFingerprint: graph.sourceGraphFingerprint,
    compositions: graph.compositions,
  });
  if (
    coverPackage.packageFingerprint !== expectedPackage.packageFingerprint ||
    result.storyId !== current.assignment.storyId ||
    result.assignmentFingerprint !== current.assignment.assignmentFingerprint ||
    result.packageFingerprint !== coverPackage.packageFingerprint ||
    result.sourceGraphFingerprint !== coverPackage.sourceGraphFingerprint
  ) {
    throw new Error("DeliveryCover result or source identity is stale.");
  }
  for (const [index, cover] of result.covers.entries()) {
    const file = await readCoverRegularFile({
      rootDir,
      relativePath: cover.repositoryPath,
    });
    if (
      checksumDeliveryBytes(file.bytes) !== cover.checksum ||
      file.sizeBytes !== cover.sizeBytes
    ) {
      throw new Error("DeliveryCover PNG checksum or size drifted.");
    }
    await inspectDeliveryCover({
      absolutePath: file.absolutePath,
      expected: { width: cover.width, height: cover.height },
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    const thumbnail = result.thumbnailChecks[index]!;
    await inspectDeliveryCoverThumbnail({
      absolutePath: file.absolutePath,
      expected: { width: thumbnail.width, height: thumbnail.height },
      ...(runProcess === undefined ? {} : { runProcess }),
    });
  }
  return {
    ...current,
    package: coverPackage,
    result,
    resultRoot,
    resultPath: join(rootDir, `${resultRoot}/cover-result.generated.json`),
  } as const;
};
