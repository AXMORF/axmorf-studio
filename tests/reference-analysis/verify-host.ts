import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeReferenceVideo } from "../../scripts/reference-analysis/analyze";
import {
  ensureReferenceDirectory,
  referenceChecksum,
} from "../../scripts/reference-analysis/filesystem";
import { runMediaProcess } from "../../scripts/shared/media-process";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";
import { createKnownCutReferenceFixture } from "./fixtures";

type FixtureReport = Readonly<{
  media: { fps: number; durationSeconds: number };
  method: {
    refinement: { maximumGrayDecodes: number };
    preview: { maximumFrames: number };
  };
  cutCandidates: readonly {
    nominalBoundaryFrameRange: {
      lowerExclusive: number;
      upperInclusive: number;
      resolutionFrames: number;
    };
    confidence: { sourceFrameBoundaryVerified: boolean };
  }[];
  coarseIntervals: readonly {
    imageMotion: {
      status: string;
      transform: {
        translationXPixels: number;
        translationYPixels: number;
        centeredScale: number;
      };
      semanticCamera: string;
    };
  }[];
}>;

// Explicit engineering proof, excluded from test discovery. The disposable
// local root is retained under ignored out/ so an Agent can inspect evidence.
export const verifyReferenceAnalysisHost = async () => {
  const repositoryRoot = await realpath(
    fileURLToPath(new URL("../../", import.meta.url)),
  );
  await ensureReferenceDirectory(join(repositoryRoot, "out"));
  const rootDir = await mkdtemp(
    join(repositoryRoot, "out/reference-analysis-proof-v2-"),
  );
  await mkdir(join(rootDir, "public"));
  const expected = await createKnownCutReferenceFixture({
    rootDir,
    toolRootDir: repositoryRoot,
  });
  const sourceChecksum = referenceChecksum(
    await readFile(join(rootDir, expected.inputPath)),
  );
  let toolCalls = 0;
  const runProcess: typeof runMediaProcess = (command, args, options) => {
    assert.ok(options?.timeoutMs !== undefined);
    assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 30000);
    toolCalls++;
    return runMediaProcess(command, args, options);
  };
  const request = {
    rootDir,
    inputPath: expected.inputPath,
    runProcess,
    resolveTool: (tool: Parameters<typeof resolveMediaToolCommand>[0]) =>
      resolveMediaToolCommand({ ...tool, rootDir: repositoryRoot }),
  };
  const result = await analyzeReferenceVideo(request);
  const firstToolCalls = toolCalls;
  assert.equal(result.status, "reference-analysis-ready");
  assert.equal(result.coarseSampleCount, 6);
  assert.equal(result.candidateCutCount, 1);
  const report = JSON.parse(
    await readFile(join(rootDir, result.reportPath), "utf8"),
  ) as FixtureReport;
  assert.equal(report.media.fps, expected.fps);
  assert.equal(
    report.media.durationSeconds,
    expected.frameCount / expected.fps,
  );
  assert.deepEqual(report.cutCandidates[0].nominalBoundaryFrameRange, {
    lowerExclusive: expected.authoredCutAtFrame - 1,
    upperInclusive: expected.authoredCutAtFrame,
    resolutionFrames: 1,
  });
  assert.equal(
    report.cutCandidates[0].confidence.sourceFrameBoundaryVerified,
    false,
  );
  assert.ok(result.sampleCount <= report.method.refinement.maximumGrayDecodes);
  assert.ok(result.previews.length <= report.method.preview.maximumFrames);
  const motion = report.coarseIntervals[0].imageMotion;
  assert.equal(motion.status, "estimated");
  assert.ok(Math.abs(motion.transform.translationXPixels - 2) <= 0.5);
  assert.ok(Math.abs(motion.transform.translationYPixels) <= 0.5);
  assert.ok(Math.abs(motion.transform.centeredScale - 1) <= 0.02);
  assert.equal(motion.semanticCamera, "not-assessed");
  const manifestBytes = await readFile(join(rootDir, result.manifestPath));
  const cached = await analyzeReferenceVideo(request);
  assert.equal(cached.analysisFingerprint, result.analysisFingerprint);
  assert.equal(cached.noOp, true);
  assert.deepEqual(
    await readFile(join(rootDir, result.manifestPath)),
    manifestBytes,
  );
  assert.equal(
    referenceChecksum(await readFile(join(rootDir, expected.inputPath))),
    sourceChecksum,
  );
  const evidence = {
    status: result.status,
    rootDir,
    source: {
      provenance: "original-synthetic-known-cut-translated-textured-plane",
      ...expected,
      checksum: sourceChecksum,
      unchanged: true,
    },
    algorithmId: result.algorithmId,
    analysisFingerprint: result.analysisFingerprint,
    actual: {
      grayDecodes: result.sampleCount,
      coarseSamples: result.coarseSampleCount,
      refinementWindows: result.refinementCount,
      candidateCutCount: result.candidateCutCount,
      previews: result.previews.length,
      imageMotionEstimates: result.imageMotionEstimateCount,
      firstAnalysisToolCalls: firstToolCalls,
      cacheVerificationToolCalls: toolCalls - firstToolCalls,
    },
    bounds: { grayDecodes: 216, refinementWindows: 12, previews: 24 },
    nominalCutBracket: report.cutCandidates[0].nominalBoundaryFrameRange,
    firstImageMotion: motion,
    reportPath: join(rootDir, result.reportPath),
    readableReportPath: join(rootDir, result.readableReportPath),
    previewIndexPath: join(rootDir, result.previewIndexPath),
    manifestPath: join(rootDir, result.manifestPath),
    previewPaths: result.previews.map(({ path }) => join(rootDir, path)),
    cacheNoOp: cached.noOp,
    assessment: result.assessment,
  };
  const evidencePath = join(rootDir, "evidence.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    flag: "wx",
  });
  return { ...evidence, evidencePath };
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyReferenceAnalysisHost()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
