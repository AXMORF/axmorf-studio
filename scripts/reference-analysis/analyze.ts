import { mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  createFingerprint,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { runMediaProcess } from "../shared/media-process";
import {
  resolveMediaToolCommand,
  type MediaTool,
} from "../shared/media-tool-command";
import type { ProcessResult, ProcessRunner } from "../shared/process";
import {
  buildRhythmSummary,
  inspectReferenceSamplingCapabilities,
  parseReferenceVideoProbe,
  planReferencePreviewDimensions,
  planReferenceSamples,
  REFERENCE_ALGORITHM_ID,
  REFERENCE_MAX_PREVIEWS,
  REFERENCE_MAX_REFINEMENT_STEPS,
  REFERENCE_MAX_REFINEMENT_WINDOWS,
  REFERENCE_MAX_SAMPLES,
  selectReferencePreviewFrames,
  validateReferenceInputPath,
  validateReferenceThreshold,
} from "./domain";
import {
  describeCoarseReferenceIntervals,
  refineReferenceBracket,
  selectReferenceRefinementWindows,
  type ReferenceRefinement,
  type ReferenceSample,
} from "./diagnostics";
import {
  assertReferenceReportManifest,
  ensureReferenceDirectory,
  freezeReferenceInput,
  inspectReferenceFile,
  readReferenceEvidence,
  referenceChecksum,
  referencePathState,
  snapshotReferenceInput,
} from "./filesystem";
import { validateReferencePreviewPng } from "./png";
import {
  renderReferenceHtml,
  renderReferenceMarkdown,
  type ReferencePreview,
} from "./report";

const REFERENCE_LIMITS = [
  "All timestamps are requested seek positions and frame numbers use nominal average fps. Decoded PTS and actual source frame ordinals are unmeasured; even a one-grid-step bracket is not an exact verified source cut.",
  "Coarse sampling is bounded to 120 frames and at most two requests per second. The unsampled tail, multiple cuts between matching samples, and short flashes/cuts can be missed.",
  "At most 12 strongest coarse windows receive eight bisection steps each. Refinement follows one strongest branch per window, does not exhaustively scan it, and can omit other cuts or leave a wider bracket.",
  "Candidate confidence is observable pixel evidence, not a calibrated probability. Cuts, flashes, lighting changes, rapid object movement, occlusion and transitions can produce similar signals.",
  "Image motion fits only translation and centered uniform scale in a stretched 64x36 gray grid, with a bounded search. Rotation, perspective/parallax, local object motion and large displacements can fail or bias this model.",
  "Low texture, repeated patterns, poor residuals or insufficient overlap withhold transform estimates. A fit does not establish camera movement or a continuous world.",
  "PNG previews preserve source aspect approximately through integer dimensions and use a maximum long edge of 512. Their labels identify requested seek positions, not measured decoded timestamps.",
  "No-cut candidates do not prove a single uninterrupted shot. Semantic camera movement, continuity, listening, motion quality and aesthetic approval remain not-assessed; an Agent must inspect the local frames and provide a separate interpretation.",
] as const;

export const analyzeReferenceVideo = async ({
  rootDir: requestedRoot,
  inputPath: rawInputPath,
  threshold: rawThreshold = 0.3,
  runProcess = runMediaProcess,
  resolveTool = resolveMediaToolCommand,
  now = Date.now,
}: {
  readonly rootDir: string;
  readonly inputPath: string;
  readonly threshold?: number;
  readonly runProcess?: ProcessRunner;
  readonly resolveTool?: typeof resolveMediaToolCommand;
  readonly now?: () => number;
}) => {
  const inputPath = validateReferenceInputPath(rawInputPath);
  const threshold = validateReferenceThreshold(rawThreshold);
  const deadline = now() + 180_000;
  const checkDeadline = () => {
    if (now() >= deadline)
      throw new Error(
        "Reference analysis exceeded its bounded processing deadline.",
      );
  };
  const rootDir = await realpath(requestedRoot);
  const input = await snapshotReferenceInput(rootDir, inputPath, checkDeadline);
  await ensureReferenceDirectory(join(rootDir, "out"));
  const outputRoot = join(rootDir, "out/reference-analysis");
  await ensureReferenceDirectory(outputRoot);
  const scratch = await mkdtemp(join(outputRoot, ".analysis-"));
  let retained = false;
  try {
    const frozenInput = join(scratch, "input.video");
    await freezeReferenceInput(rootDir, input, frozenInput, checkDeadline);
    const toolOutputs: {
      tool: MediaTool;
      arguments: readonly string[];
      status: number;
      stdout: string;
      stderr: string;
    }[] = [];
    const diagnostic = (value: string) =>
      value.replaceAll(scratch, "scratch").replaceAll(rootDir, ".");
    const run = async (
      tool: MediaTool,
      args: readonly string[],
    ): Promise<ProcessResult> => {
      checkDeadline();
      const invocation = await resolveTool({ rootDir, tool, args });
      const result = await runProcess(invocation.command, invocation.args, {
        cwd: rootDir,
        timeoutMs: Math.min(30_000, deadline - now()),
      });
      checkDeadline();
      if (result.status !== 0)
        throw new Error(
          `Reference ${tool} analysis failed with exit status ${result.status}.`,
        );
      toolOutputs.push({
        tool,
        arguments: args.map(diagnostic),
        status: result.status,
        stdout: diagnostic(result.stdout),
        stderr: diagnostic(result.stderr),
      });
      return result;
    };
    const probe = await run("ffprobe", [
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-format_whitelist",
      "mov,matroska,webm,avi",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,r_frame_rate,duration:format=duration",
      "-of",
      "json",
      frozenInput,
    ]);
    const media = parseReferenceVideoProbe(probe.stdout);
    const filters = await run("ffmpeg", ["-hide_banner", "-filters"]);
    const encoders = await run("ffmpeg", ["-hide_banner", "-encoders"]);
    const pixelFormats = await run("ffmpeg", ["-hide_banner", "-pix_fmts"]);
    const muxers = await run("ffmpeg", ["-hide_banner", "-muxers"]);
    const missingCapabilities = inspectReferenceSamplingCapabilities({
      filters: filters.stdout,
      encoders: encoders.stdout,
      pixelFormats: pixelFormats.stdout,
      muxers: muxers.stdout,
    });
    const sampling = planReferenceSamples(media.durationSeconds, media.fps);
    const previewDimensions = planReferencePreviewDimensions(
      media.width,
      media.height,
    );
    const frames = new Map<number, Promise<ReferenceSample>>();
    const decoded = new Map<number, ReferenceSample>();
    const maxGrayDecodes =
      REFERENCE_MAX_SAMPLES +
      REFERENCE_MAX_REFINEMENT_WINDOWS * REFERENCE_MAX_REFINEMENT_STEPS;
    const extract = async (
      nominalFrame: number,
      outputPath: string,
      preview: boolean,
    ) => {
      if (
        !Number.isSafeInteger(nominalFrame) ||
        nominalFrame < 0 ||
        nominalFrame >= sampling.nominalFrameCount
      )
        throw new Error("Reference requested frame escaped its nominal grid.");
      await run("ffmpeg", [
        "-hide_banner",
        "-nostdin",
        "-nostats",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        "mov,matroska,webm,avi",
        "-ss",
        String(nominalFrame / media.fps),
        "-i",
        frozenInput,
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        "-frames:v",
        "1",
        "-vf",
        preview
          ? `scale=${previewDimensions.width}:${previewDimensions.height},format=rgb24`
          : `scale=${sampling.width}:${sampling.height},format=gray`,
        "-c:v",
        preview ? "png" : "rawvideo",
        "-pix_fmt",
        preview ? "rgb24" : "gray",
        "-threads",
        "1",
        "-f",
        "image2",
        "-update",
        "1",
        outputPath,
      ]);
    };
    const readFrame = (nominalFrame: number): Promise<ReferenceSample> => {
      const existing = frames.get(nominalFrame);
      if (existing !== undefined) return existing;
      if (frames.size >= maxGrayDecodes)
        throw new Error(
          "Reference gray decoding exceeded its fixed sample budget.",
        );
      const pending = (async () => {
        const path = join(scratch, `frame-${nominalFrame}.gray`);
        await extract(nominalFrame, path, false);
        const pixels = await readReferenceEvidence(
          path,
          sampling.width * sampling.height,
        );
        const sample = { nominalFrame, pixels };
        decoded.set(nominalFrame, sample);
        await rm(path);
        return sample;
      })();
      frames.set(nominalFrame, pending);
      return pending;
    };
    const coarseSamples: ReferenceSample[] = [];
    if (missingCapabilities.length === 0)
      for (const frame of sampling.sampleFrameIndices)
        coarseSamples.push(await readFrame(frame));
    checkDeadline();
    const coarseIntervals = describeCoarseReferenceIntervals(
      coarseSamples,
      media.fps,
      threshold,
    );
    const selectedWindows = selectReferenceRefinementWindows(coarseIntervals);
    const refinements: ReferenceRefinement[] = [];
    for (const interval of selectedWindows)
      refinements.push(
        await refineReferenceBracket({
          interval,
          fps: media.fps,
          threshold,
          readFrame,
          checkDeadline,
        }),
      );
    refinements.sort((left, right) => left.beforeFrame - right.beforeFrame);
    const cutCandidates = refinements.filter(
      ({ abruptChangeCandidate }) => abruptChangeCandidate,
    );
    const previews: ReferencePreview[] = [];
    if (missingCapabilities.length === 0) {
      await ensureReferenceDirectory(join(scratch, "frames"));
      for (const nominalFrame of selectReferencePreviewFrames(
        sampling.sampleFrameIndices,
        cutCandidates,
      )) {
        const path = `frames/frame-${String(nominalFrame).padStart(10, "0")}.png`;
        const absolute = join(scratch, path);
        await extract(nominalFrame, absolute, true);
        const bytes = await readReferenceEvidence(absolute);
        validateReferencePreviewPng(bytes, previewDimensions);
        previews.push({
          path,
          nominalFrame,
          requestedTimeSeconds: nominalFrame / media.fps,
          width: previewDimensions.width,
          height: previewDimensions.height,
          checksum: referenceChecksum(bytes),
          sizeBytes: bytes.length,
        });
      }
    }
    const assertInputCurrent = async () => {
      const current = await snapshotReferenceInput(
        rootDir,
        inputPath,
        checkDeadline,
      );
      if (serializeCanonicalJson(current) !== serializeCanonicalJson(input))
        throw new Error(
          "Reference input changed during analysis; no report was accepted.",
        );
      const frozen = await inspectReferenceFile(frozenInput, checkDeadline);
      if (
        frozen.checksum !== input.checksum ||
        frozen.sizeBytes !== input.sizeBytes
      )
        throw new Error(
          "Reference frozen input changed during analysis; no report was accepted.",
        );
    };
    await assertInputCurrent();
    const report = {
      schemaVersion: 2,
      status:
        missingCapabilities.length === 0
          ? ("reference-analysis-ready" as const)
          : ("reference-analysis-unavailable" as const),
      input,
      media,
      method: {
        algorithmId: REFERENCE_ALGORITHM_ID,
        threshold,
        differenceMetric: "mean-absolute-gray-pixel-difference-divided-by-255",
        sampling,
        refinement: {
          maximumWindows: REFERENCE_MAX_REFINEMENT_WINDOWS,
          maximumStepsPerWindow: REFERENCE_MAX_REFINEMENT_STEPS,
          maximumGrayDecodes: maxGrayDecodes,
          policy: "strongest-unexplained-change-branch-bisection",
        },
        imageMotion: {
          model: "translation-and-centered-uniform-scale",
          sampleWidth: sampling.width,
          sampleHeight: sampling.height,
          maximumEvaluatedTransformsPerPair: 550,
          translationXSearchPixels: [-7, 7],
          translationYSearchPixels: [-5, 5],
          scaleSearch: [0.83, 1.17],
          minimumTextureDeviation: 0.025,
          maximumFitResidual: 0.12,
          minimumOverlap: 0.7,
          minimumDistinctAlternativeGap: 0.003,
        },
        preview: {
          ...previewDimensions,
          maximumFrames: REFERENCE_MAX_PREVIEWS,
        },
      },
      missingCapabilities,
      samples: [...decoded.values()]
        .sort((left, right) => left.nominalFrame - right.nominalFrame)
        .map(({ nominalFrame, pixels }) => ({
          nominalFrame,
          requestedTimeSeconds: nominalFrame / media.fps,
          checksum: referenceChecksum(pixels),
        })),
      coarseIntervals,
      refinements,
      cutCandidates,
      unrefinedCoarseCandidateCount:
        coarseIntervals.filter(
          ({ abruptChangeCandidate }) => abruptChangeCandidate,
        ).length - selectedWindows.length,
      previews,
      rhythmHypothesis:
        missingCapabilities.length === 0
          ? buildRhythmSummary(cutCandidates, media.durationSeconds)
          : null,
      assessment: {
        semanticCamera: "not-assessed",
        continuity: "not-assessed",
        listening: "not-assessed",
        motionQuality: "not-assessed",
        aestheticQuality: "not-assessed",
      },
      provenance: {
        invocation: "workspace-local-remotion-cli",
        frozenInputChecksum: input.checksum,
        toolOutputs,
      },
      limits: REFERENCE_LIMITS,
    };
    const analysisFingerprint = createFingerprint({
      namespace: "reference-video-diagnostics",
      version: 2,
      value: report,
    });
    const textEvidence = {
      "analysis.json": `${serializeCanonicalJson({ ...report, analysisFingerprint })}\n`,
      "report.md": renderReferenceMarkdown(report, analysisFingerprint),
      "index.html": renderReferenceHtml(report, analysisFingerprint),
    };
    for (const [path, text] of Object.entries(textEvidence))
      await writeFile(join(scratch, path), text, { flag: "wx" });
    await assertInputCurrent();
    await rm(frozenInput);
    const evidenceManifest = [
      ...previews.map(({ path, checksum, sizeBytes }) => ({
        path,
        checksum,
        sizeBytes,
      })),
      ...Object.entries(textEvidence).map(([path, text]) => ({
        path,
        checksum: referenceChecksum(Buffer.from(text)),
        sizeBytes: Buffer.byteLength(text),
      })),
    ].sort((left, right) => left.path.localeCompare(right.path));
    await assertReferenceReportManifest(
      scratch,
      evidenceManifest,
      checkDeadline,
    );
    const manifestText = `${serializeCanonicalJson({ schemaVersion: 1, analysisFingerprint, files: evidenceManifest })}\n`;
    await writeFile(join(scratch, "manifest.json"), manifestText, {
      flag: "wx",
    });
    const exactManifest = [
      ...evidenceManifest,
      {
        path: "manifest.json",
        checksum: referenceChecksum(Buffer.from(manifestText)),
        sizeBytes: Buffer.byteLength(manifestText),
      },
    ].sort((left, right) => left.path.localeCompare(right.path));
    const outputDirectory = join(
      outputRoot,
      analysisFingerprint.slice("sha256:".length),
    );
    const existing = await referencePathState(outputDirectory);
    const noOp = existing !== null;
    if (noOp)
      await assertReferenceReportManifest(
        outputDirectory,
        exactManifest,
        checkDeadline,
      );
    const currentInput = await snapshotReferenceInput(
      rootDir,
      inputPath,
      checkDeadline,
    );
    if (serializeCanonicalJson(currentInput) !== serializeCanonicalJson(input))
      throw new Error("Reference input changed before report acceptance.");
    await assertReferenceReportManifest(
      noOp ? outputDirectory : scratch,
      exactManifest,
      checkDeadline,
    );
    checkDeadline();
    if (!noOp) {
      await rename(scratch, outputDirectory);
      retained = true;
    }
    const logical = (path: string) =>
      relative(rootDir, path).split("\\").join("/");
    return {
      status: report.status,
      analysisFingerprint,
      inputChecksum: input.checksum,
      algorithmId: REFERENCE_ALGORITHM_ID,
      threshold,
      sampleCount: decoded.size,
      coarseSampleCount: coarseSamples.length,
      refinementCount: refinements.length,
      candidateCutCount: cutCandidates.length,
      imageMotionEstimateCount: coarseIntervals.filter(
        ({ imageMotion }) => imageMotion.status === "estimated",
      ).length,
      missingCapabilities,
      reportPath: logical(join(outputDirectory, "analysis.json")),
      readableReportPath: logical(join(outputDirectory, "report.md")),
      previewIndexPath: logical(join(outputDirectory, "index.html")),
      manifestPath: logical(join(outputDirectory, "manifest.json")),
      previews: previews.map((preview) => ({
        ...preview,
        path: logical(join(outputDirectory, preview.path)),
      })),
      noOp,
      assessment: report.assessment,
    };
  } finally {
    if (!retained) await rm(scratch, { recursive: true, force: true });
  }
};
