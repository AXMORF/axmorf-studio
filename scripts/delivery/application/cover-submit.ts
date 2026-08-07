import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDeliveryCoverResult } from "../../../src/contracts";
import type { ProcessRunner } from "../../baseline/evidence";
import {
  cleanupCoverResultStaging,
  coverResultExists,
  coverResultRelativeRoot,
  createCoverResultStaging,
  promoteCoverResult,
  serializeCoverJson,
  writeCoverResultFile,
} from "../adapters/cover-files";
import { collectDeliveryCoverSourceGraph } from "../adapters/cover-source";
import {
  loadCurrentDeliveryCoverAssignment,
  loadCurrentDeliveryCoverResult,
} from "./cover-inputs";
import { validateDeliveryCoverAuthoring } from "./cover-validation";

export const runDeliveryCoverSubmit = async ({
  rootDir,
  projectId,
  runProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const { assignment } = await loadCurrentDeliveryCoverAssignment({
    rootDir,
    projectId,
  });
  const resultRoot = coverResultRelativeRoot(assignment);
  if (await coverResultExists({ rootDir, relativePath: resultRoot })) {
    const current = await loadCurrentDeliveryCoverResult({
      rootDir,
      projectId,
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    return {
      projectId,
      status: "cover-ready" as const,
      noOp: true,
      resultFingerprint: current.result.resultFingerprint,
      resultPath: `${resultRoot}/cover-result.generated.json`,
    };
  }
  const staging = await createCoverResultStaging({ rootDir, assignment });
  let promoted = false;
  try {
    const validated = await validateDeliveryCoverAuthoring({
      rootDir,
      assignment,
      workspace: staging.staging,
      ...(runProcess === undefined ? {} : { runProcess }),
    });
    const [wide, tall] = validated.checked;
    const covers = [
      {
        variantId: "cover-4x3",
        repositoryPath: `${resultRoot}/cover-4x3.png`,
        checksum: wide.file.checksum,
        sizeBytes: wide.file.sizeBytes,
        width: 1600,
        height: 1200,
        decodedToEof: true,
      },
      {
        variantId: "cover-3x4",
        repositoryPath: `${resultRoot}/cover-3x4.png`,
        checksum: tall.file.checksum,
        sizeBytes: tall.file.sizeBytes,
        width: 1200,
        height: 1600,
        decodedToEof: true,
      },
    ] as const;
    const thumbnailChecks = [
      {
        variantId: "cover-4x3",
        width: wide.thumbnail.width,
        height: wide.thumbnail.height,
        decodedToEof: true,
      },
      {
        variantId: "cover-3x4",
        width: tall.thumbnail.width,
        height: tall.thumbnail.height,
        decodedToEof: true,
      },
    ] as const;
    const result = buildDeliveryCoverResult({
      storyId: assignment.storyId,
      assignmentFingerprint: assignment.assignmentFingerprint,
      packageFingerprint: validated.coverPackage.packageFingerprint,
      sourceGraphFingerprint:
        validated.coverPackage.sourceGraphFingerprint,
      covers,
      thumbnailChecks,
    });
    await writeCoverResultFile(
      join(staging.staging, "cover-package.generated.json"),
      serializeCoverJson(validated.coverPackage),
    );
    await writeCoverResultFile(
      join(staging.staging, "cover-result.generated.json"),
      serializeCoverJson(result),
    );
    const finalGraph = await collectDeliveryCoverSourceGraph({
      rootDir,
      storyId: assignment.storyId,
      compositionId: assignment.compositionBaseId,
    });
    if (
      finalGraph.sourceGraphFingerprint !==
        validated.coverPackage.sourceGraphFingerprint ||
      JSON.stringify(finalGraph.files) !==
        JSON.stringify(validated.coverPackage.sourceFiles)
    ) {
      throw new Error("Cover source drifted before immutable promotion.");
    }
    const [storedPackage, storedResult] = await Promise.all([
      readFile(join(staging.staging, "cover-package.generated.json"), "utf8"),
      readFile(join(staging.staging, "cover-result.generated.json"), "utf8"),
    ]);
    if (
      storedPackage !== serializeCoverJson(validated.coverPackage) ||
      storedResult !== serializeCoverJson(result)
    ) {
      throw new Error("Cover staging identity drifted before promotion.");
    }
    await promoteCoverResult({
      rootDir,
      staging: staging.staging,
      destinationRelative: staging.destinationRelative,
    });
    promoted = true;
    return {
      projectId,
      status: "cover-ready" as const,
      noOp: false,
      resultFingerprint: result.resultFingerprint,
      resultPath: `${resultRoot}/cover-result.generated.json`,
    };
  } finally {
    if (!promoted) await cleanupCoverResultStaging(staging.staging);
  }
};
