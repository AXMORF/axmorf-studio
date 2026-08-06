import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import {
  Sha256DigestSchema,
  createFinalPreviewEvidence,
  createFingerprint,
} from "../../../src/contracts";
import { productComicVerticalFinalAssemblyData } from "../../../src/projects/product-comic-vertical/final-assembly-data";
import { evaluateDuckEnvelope } from "../../../src/remotion/runtime/global-sound";
import { checkPersistedFinalAssembly } from "../../final-assembly/files";
import { checksumExternalBytes } from "../../external-references/project-files";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../../scene-package/project-files";
import { generateProductComicGlobalAudio } from "./global-audio";
import { buildM9StillManifest, runM9SceneEvidence } from "./scene-evidence";

const execFileAsync = promisify(execFile);
const STORY_ID = "product-comic-vertical";
const COMPOSITION_ID = "ProductComicVertical";
const OUTPUT_ROOT = "out/m9-product-comic-vertical";
const FINAL_REVIEW_ROOT = `${OUTPUT_ROOT}/final-review`;
const EVIDENCE_PATH = `src/projects/${STORY_ID}/generated/final-preview-evidence.generated.json`;
const REVIEW_PATH = `src/projects/${STORY_ID}/reviews/final-assembly-review.json`;

export const M9_FINAL_PREVIEW_PATH =
  `${OUTPUT_ROOT}/product-comic-vertical-final-preview.mp4` as const;
const M9_UNTRIMMED_PREVIEW_PATH =
  `${OUTPUT_ROOT}/.product-comic-vertical-final-preview-untrimmed.mp4` as const;
const M9_NORMALIZED_PREVIEW_PATH =
  `${OUTPUT_ROOT}/.product-comic-vertical-final-preview-normalized.mp4` as const;
export const M9_CONTACT_SHEET_PATH =
  `${FINAL_REVIEW_ROOT}/contact-sheet.png` as const;
export const M9_REVIEW_FRAMES = [
  ...new Set([0, ...buildM9StillManifest().map(({ frame }) => frame), 5115]),
].sort((left, right) => left - right);

const stillPath = (frame: number) =>
  `${FINAL_REVIEW_ROOT}/stills/frame-${String(frame).padStart(4, "0")}.png` as const;

const note = z.string().trim().min(1).max(4_000);
const pass = z.literal("pass");
const FinalAssemblyReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewVersion: z.literal("m9-product-comic-final-assembly-review-v1"),
    storyId: z.literal(STORY_ID),
    compositionId: z.literal(COMPOSITION_ID),
    finalAssemblyFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    sceneEvidenceFingerprint: Sha256DigestSchema,
    previewChecksum: Sha256DigestSchema,
    reviewInputFingerprint: Sha256DigestSchema,
    sourceAccuracy: z
      .object({
        status: pass,
        currentRepositoryOnly: note,
        productProblemAndCapabilities: note,
        workflowAndEvidence: note,
        limitationsAndCallToAction: note,
      })
      .strict(),
    narrativeContinuity: z
      .object({
        status: pass,
        tenSceneProgression: note,
        boundaryFlow: note,
        openingAndEnding: note,
      })
      .strict(),
    comicSystem: z
      .object({
        status: pass,
        panelReadingDirection: note,
        characterAndProductContinuity: note,
        lineHalftoneSpeedlineLanguage: note,
        captionBalloonOnomatopoeiaSeparation: note,
      })
      .strict(),
    mobileReadability: z
      .object({
        status: pass,
        fullResolution: note,
        reducedResolution: note,
        safeAreaAndCallToAction: note,
      })
      .strict(),
    exactReference: z
      .object({
        status: pass,
        selectedMeaningId: z.literal("product-reveal"),
        normalSpeedLegibility: note,
        productInformationPriority: note,
      })
      .strict(),
    soundHierarchy: z
      .object({
        status: pass,
        narration: note,
        sceneLocalCues: note,
        globalAmbienceAndBgm: note,
        duckingAndSync: note,
      })
      .strict(),
    readableHolds: z
      .object({
        status: pass,
        firstAndLast: note,
        sceneBoundaries: note,
        finalCallToAction: note,
      })
      .strict(),
    normalSpeed: z
      .object({
        status: pass,
        playbackRate: z.literal(1),
        completedFullPlayback: z.literal(true),
        previewChecksum: Sha256DigestSchema,
        startToEndObservation: note,
      })
      .strict(),
    aggregateStatus: pass,
  })
  .strict();

export type M9FinalAssemblyReview = z.infer<
  typeof FinalAssemblyReviewSchema
> & { readonly reviewFingerprint: z.infer<typeof Sha256DigestSchema> };

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(checksumExternalBytes(await readFile(path)));

const runTool = async (
  command: string,
  args: readonly string[],
  rootDir: string,
  maxBuffer = 30 * 1024 * 1024,
) =>
  execFileAsync(command, [...args], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer,
  });

const validatePrerequisites = async (rootDir: string) => {
  await generateProductComicGlobalAudio({ rootDir, mode: "check" });
  await checkPersistedFinalAssembly({
    rootDir,
    expectedAssembly: productComicVerticalFinalAssemblyData.finalAssembly,
  });
  const sceneEvidence = await runM9SceneEvidence({ rootDir, mode: "check" });
  return {
    assembly: productComicVerticalFinalAssemblyData,
    sceneEvidence,
  } as const;
};

export const readCurrentM9ReviewIdentities = async (rootDir: string) => {
  const { assembly, sceneEvidence } = await validatePrerequisites(rootDir);
  const previewChecksum = await checksumFile(
    join(rootDir, M9_FINAL_PREVIEW_PATH),
  );
  const input = {
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    finalAssemblyFingerprint: assembly.finalAssembly.finalAssemblyFingerprint,
    resourceCatalogFingerprint: assembly.assemblyCatalog.catalogFingerprint,
    sceneEvidenceFingerprint: sceneEvidence.evidenceFingerprint,
    previewChecksum,
  } as const;
  return {
    ...input,
    reviewInputFingerprint: createFingerprint({
      namespace: "m9-product-comic-final-review-input",
      version: 1,
      value: input,
    }),
  } as const;
};

export const validateM9FinalAssemblyReview = async ({
  rootDir,
  rawReview,
}: {
  readonly rootDir: string;
  readonly rawReview: unknown;
}): Promise<M9FinalAssemblyReview> => {
  if (
    /FinalPreviewApproval|user-approved-current-preview|approvalVersion|approvalReference/iu.test(
      JSON.stringify(rawReview),
    )
  ) {
    throw new Error("M9 Agent review cannot represent user approval.");
  }
  const review = FinalAssemblyReviewSchema.parse(rawReview);
  const current = await readCurrentM9ReviewIdentities(rootDir);
  if (
    review.finalAssemblyFingerprint !== current.finalAssemblyFingerprint ||
    review.resourceCatalogFingerprint !== current.resourceCatalogFingerprint ||
    review.sceneEvidenceFingerprint !== current.sceneEvidenceFingerprint ||
    review.previewChecksum !== current.previewChecksum ||
    review.normalSpeed.previewChecksum !== current.previewChecksum ||
    review.reviewInputFingerprint !== current.reviewInputFingerprint
  ) {
    throw new Error("M9 final assembly review identity is stale.");
  }
  return {
    ...review,
    reviewFingerprint: createFingerprint({
      namespace: "m9-product-comic-final-review",
      version: 1,
      value: review,
    }),
  };
};

const inspectPng = async ({
  rootDir,
  relativePath,
  width,
  height,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly width: number;
  readonly height: number;
}) => {
  const { stdout } = await runTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "json",
      relativePath,
    ],
    rootDir,
  );
  const facts = z
    .object({
      streams: z
        .array(
          z
            .object({
              codec_name: z.string(),
              width: z.number(),
              height: z.number(),
            })
            .passthrough(),
        )
        .length(1),
    })
    .passthrough()
    .parse(JSON.parse(stdout));
  const image = facts.streams[0];
  if (
    image.codec_name !== "png" ||
    image.width !== width ||
    image.height !== height
  ) {
    throw new Error("M9 final review image identity is stale.");
  }
};

const parseLastFinite = (text: string, pattern: RegExp, label: string) => {
  const matches = [...text.matchAll(pattern)];
  const raw = matches.at(-1)?.[1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`M9 ${label} analysis is incomplete.`);
  }
  return value;
};

export const assertM9MasteringMeasurements = ({
  integratedLoudnessLufs,
  truePeakDbtp,
  samplePeakDbfs,
  integratedLoudnessMinLufs,
  integratedLoudnessMaxLufs,
  truePeakCeilingDbtp,
}: {
  readonly integratedLoudnessLufs: number;
  readonly truePeakDbtp: number;
  readonly samplePeakDbfs: number;
  readonly integratedLoudnessMinLufs: number;
  readonly integratedLoudnessMaxLufs: number;
  readonly truePeakCeilingDbtp: number;
}) => {
  if (
    ![
      integratedLoudnessLufs,
      truePeakDbtp,
      samplePeakDbfs,
      integratedLoudnessMinLufs,
      integratedLoudnessMaxLufs,
      truePeakCeilingDbtp,
    ].every(Number.isFinite) ||
    integratedLoudnessLufs < integratedLoudnessMinLufs ||
    integratedLoudnessLufs > integratedLoudnessMaxLufs ||
    truePeakDbtp > truePeakCeilingDbtp ||
    samplePeakDbfs > truePeakCeilingDbtp
  ) {
    throw new Error("M9 final preview loudness or peak is outside the plan.");
  }
};

const measureChannelPeak = async (
  rootDir: string,
  pan: string,
  label: string,
) => {
  const { stderr } = await runTool(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      M9_FINAL_PREVIEW_PATH,
      "-af",
      `${pan},volumedetect`,
      "-f",
      "null",
      "-",
    ],
    rootDir,
    60 * 1024 * 1024,
  );
  return parseLastFinite(
    stderr,
    /max_volume:\s*(-?\d+(?:\.\d+)?)\s+dB/gu,
    `${label} peak`,
  );
};

export const inspectM9FinalPreviewTechnical = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  const { assembly } = await validatePrerequisites(rootDir);
  const { stdout: probeOutput } = await runTool(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      M9_FINAL_PREVIEW_PATH,
    ],
    rootDir,
  );
  const probe = z
    .object({
      streams: z.array(z.record(z.string(), z.unknown())),
      format: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(JSON.parse(probeOutput));
  const videos = probe.streams.filter(
    ({ codec_type }) => codec_type === "video",
  );
  const audios = probe.streams.filter(
    ({ codec_type }) => codec_type === "audio",
  );
  const video = videos[0];
  const audio = audios[0];
  const durationSeconds = Number(probe.format.duration);
  if (
    videos.length !== 1 ||
    audios.length !== 1 ||
    video?.codec_name !== "h264" ||
    video.width !== 1080 ||
    video.height !== 1920 ||
    video.avg_frame_rate !== "30/1" ||
    video.nb_read_frames !== "5116" ||
    audio?.codec_name !== "aac" ||
    audio.sample_rate !== "48000" ||
    audio.channels !== 2 ||
    audio.channel_layout !== "stereo" ||
    !Number.isFinite(durationSeconds) ||
    Math.abs(durationSeconds - 5116 / 30) > 1 / 30
  ) {
    throw new Error("M9 final preview stream identity is stale.");
  }

  await runTool(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      M9_FINAL_PREVIEW_PATH,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-f",
      "null",
      "-",
    ],
    rootDir,
    80 * 1024 * 1024,
  );
  const [
    { stderr: loudnessOutput },
    { stderr: samplePeakOutput },
    leftPeakDbfs,
    rightPeakDbfs,
    centerSumPeakDbfs,
    ffmpegVersion,
    ffprobeVersion,
  ] = await Promise.all([
    runTool(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        M9_FINAL_PREVIEW_PATH,
        "-filter_complex",
        "ebur128=peak=true",
        "-f",
        "null",
        "-",
      ],
      rootDir,
      80 * 1024 * 1024,
    ),
    runTool(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        M9_FINAL_PREVIEW_PATH,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      rootDir,
      80 * 1024 * 1024,
    ),
    measureChannelPeak(rootDir, "pan=mono|c0=c0", "left channel"),
    measureChannelPeak(rootDir, "pan=mono|c0=c1", "right channel"),
    measureChannelPeak(rootDir, "pan=mono|c0=0.5*c0+0.5*c1", "center sum"),
    runTool("ffmpeg", ["-version"], rootDir),
    runTool("ffprobe", ["-version"], rootDir),
  ]);
  const integratedLoudnessLufs = parseLastFinite(
    loudnessOutput,
    /\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/gu,
    "integrated loudness",
  );
  const truePeakDbtp = parseLastFinite(
    loudnessOutput,
    /\bPeak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/gu,
    "true peak",
  );
  const samplePeakDbfs = parseLastFinite(
    samplePeakOutput,
    /max_volume:\s*(-?\d+(?:\.\d+)?)\s+dB/gu,
    "sample peak",
  );
  const mastering = assembly.finalSound.plan.masteringPolicy;
  assertM9MasteringMeasurements({
    integratedLoudnessLufs,
    truePeakDbtp,
    samplePeakDbfs,
    integratedLoudnessMinLufs: mastering.integratedLoudnessMinLufs,
    integratedLoudnessMaxLufs: mastering.integratedLoudnessMaxLufs,
    truePeakCeilingDbtp: mastering.truePeakCeilingDbtp,
  });
  if (
    Math.abs(leftPeakDbfs - rightPeakDbfs) > 0.2 ||
    centerSumPeakDbfs < -60 ||
    centerSumPeakDbfs < Math.max(leftPeakDbfs, rightPeakDbfs) - 6
  ) {
    throw new Error(
      "M9 final preview stereo channels are missing or phase-cancelled.",
    );
  }

  const envelopeInput = {
    ranges: assembly.finalSound.spokenRanges,
    durationInFrames: assembly.finalSound.plan.durationInFrames,
    attackFrames: assembly.finalSound.plan.duckingPolicy.attackFrames,
    releaseFrames: assembly.finalSound.plan.duckingPolicy.releaseFrames,
    spokenGain: assembly.finalSound.plan.duckingPolicy.spokenGain,
    unspokenGain: assembly.finalSound.plan.duckingPolicy.unspokenGain,
  } as const;
  const measurementFrames = [
    0, 6, 15, 302, 303, 574, 575, 579, 580, 5100, 5115,
  ] as const;
  const envelopeMeasurements = measurementFrames.map((frame) => ({
    frame,
    duckGain: evaluateDuckEnvelope({ ...envelopeInput, frame }),
  }));
  const duckingEvidenceFingerprint = createFingerprint({
    namespace: "m9-product-comic-final-mix-evidence",
    version: 1,
    value: {
      duckEnvelopeFingerprint:
        assembly.finalSound.projection.duckEnvelopeFingerprint,
      envelopeMeasurements,
      busGains: mastering,
      globalBusRoles: assembly.finalSound.plan.assets.map(({ role }) => role),
      sceneLocalSfxDucked: false,
      sceneLocalSfxProjectionFingerprint:
        assembly.finalSound.projection.soundDesignProjectionFingerprint,
      ffprobeFactsFingerprint: createFingerprint({
        namespace: "m9-final-ffprobe-json",
        version: 1,
        value: probe,
      }),
      channelAnalysis: {
        leftPeakDbfs,
        rightPeakDbfs,
        centerSumPeakDbfs,
        phaseCancellationDetected: false,
      },
      commands: {
        probe: "ffprobe-count-frames-show-streams-show-format-json-v1",
        decode: "ffmpeg-map-video-audio-error-full-null-eof-v1",
        loudness: "ffmpeg-ebur128-peak-true-v1",
        samplePeak: "ffmpeg-volumedetect-v1",
        channels: "ffmpeg-pan-left-right-center-volumedetect-v1",
      },
      toolVersions: {
        ffmpeg: ffmpegVersion.stdout.split("\n")[0],
        ffprobe: ffprobeVersion.stdout.split("\n")[0],
      },
    },
  });

  return {
    videoCodec: "h264" as const,
    width: 1080 as const,
    height: 1920 as const,
    fpsNumerator: 30 as const,
    fpsDenominator: 1 as const,
    frameCount: 5116 as const,
    durationSeconds,
    audioCodec: "aac",
    sampleRate: 48_000 as const,
    channelLayout: "stereo",
    decodedToEof: true as const,
    integratedLoudnessLufs,
    truePeakDbtp,
    samplePeakDbfs,
    duckingEvidenceFingerprint,
  };
};

const collectM9FinalPreviewEvidence = async (rootDir: string) => {
  const { assembly } = await validatePrerequisites(rootDir);
  const stills = [];
  for (const frame of M9_REVIEW_FRAMES) {
    const relativePath = stillPath(frame);
    await inspectPng({
      rootDir,
      relativePath,
      width: 1080,
      height: 1920,
    });
    stills.push({
      relativePath,
      checksum: await checksumFile(join(rootDir, relativePath)),
      frame,
    });
  }
  await inspectPng({
    rootDir,
    relativePath: M9_CONTACT_SHEET_PATH,
    width: 1080,
    height: 3840,
  });
  const technical = await inspectM9FinalPreviewTechnical({ rootDir });
  const review = await validateM9FinalAssemblyReview({
    rootDir,
    rawReview: await readJsonFile(join(rootDir, REVIEW_PATH)),
  });
  return createFinalPreviewEvidence({
    schemaVersion: 1,
    evidenceVersion: "final-preview-evidence-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    finalAssemblyFingerprint: assembly.finalAssembly.finalAssemblyFingerprint,
    resourceCatalogFingerprint: assembly.assemblyCatalog.catalogFingerprint,
    reviewFingerprint: review.reviewFingerprint,
    media: {
      fullPreview: {
        relativePath: M9_FINAL_PREVIEW_PATH,
        checksum: await checksumFile(join(rootDir, M9_FINAL_PREVIEW_PATH)),
      },
      contactSheet: {
        relativePath: M9_CONTACT_SHEET_PATH,
        checksum: await checksumFile(join(rootDir, M9_CONTACT_SHEET_PATH)),
      },
      representativeStills: stills,
    },
    technical,
    aggregateStatus: "ready-for-user-approval",
  });
};

export const runM9FinalPreviewEvidence = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}) => {
  const evidence = await collectM9FinalPreviewEvidence(rootDir);
  await writeOrCheckSceneArtifact({
    destination: join(rootDir, EVIDENCE_PATH),
    value: evidence,
    mode,
  });
  return evidence;
};

export const renderM9ContactSheet = async (rootDir: string) => {
  const columns = 5;
  const rows = 10;
  const args: string[] = ["-y"];
  for (const frame of M9_REVIEW_FRAMES) {
    args.push("-i", stillPath(frame));
  }
  const blankCount = columns * rows - M9_REVIEW_FRAMES.length;
  const filters = M9_REVIEW_FRAMES.map(
    (_, index) => `[${index}:v]scale=216:384[s${index}]`,
  );
  for (let index = 0; index < blankCount; index += 1) {
    filters.push(`color=c=#171117:s=216x384:d=1[blank${index}]`);
  }
  for (let row = 0; row < rows; row += 1) {
    const cells = Array.from({ length: columns }, (_, column) => {
      const index = row * columns + column;
      if (index < M9_REVIEW_FRAMES.length) return `[s${index}]`;
      return `[blank${index - M9_REVIEW_FRAMES.length}]`;
    }).join("");
    filters.push(`${cells}hstack=inputs=${columns}[row${row}]`);
  }
  filters.push(
    `${Array.from({ length: rows }, (_, row) => `[row${row}]`).join("")}vstack=inputs=${rows}[out]`,
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-frames:v",
    "1",
    M9_CONTACT_SHEET_PATH,
  );
  await runTool("ffmpeg", args, rootDir, 80 * 1024 * 1024);
};

export const renderM9FinalPreviewMedia = async (rootDir: string) => {
  await validatePrerequisites(rootDir);
  if (M9_REVIEW_FRAMES.length < 34 || M9_REVIEW_FRAMES.length > 50) {
    throw new Error("M9 final review frame count must stay between 34 and 50.");
  }
  await mkdir(join(rootDir, FINAL_REVIEW_ROOT, "stills"), { recursive: true });
  const remotion = join(rootDir, "node_modules/.bin/remotion");
  for (const frame of M9_REVIEW_FRAMES) {
    await runTool(
      remotion,
      [
        "still",
        "src/index.ts",
        COMPOSITION_ID,
        stillPath(frame),
        `--frame=${frame}`,
        "--overwrite",
        "--log=error",
      ],
      rootDir,
      60 * 1024 * 1024,
    );
  }
  await renderM9ContactSheet(rootDir);
  await runTool(
    remotion,
    [
      "render",
      "src/index.ts",
      COMPOSITION_ID,
      M9_UNTRIMMED_PREVIEW_PATH,
      "--codec=h264",
      "--audio-codec=aac",
      "--concurrency=3",
      "--overwrite",
      "--log=error",
    ],
    rootDir,
    120 * 1024 * 1024,
  );
  await runTool(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      M9_UNTRIMMED_PREVIEW_PATH,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-t",
      String(5116 / 30),
      "-movflags",
      "+faststart",
      "-y",
      M9_NORMALIZED_PREVIEW_PATH,
    ],
    rootDir,
    120 * 1024 * 1024,
  );
  await rename(
    join(rootDir, M9_NORMALIZED_PREVIEW_PATH),
    join(rootDir, M9_FINAL_PREVIEW_PATH),
  );
  await rm(join(rootDir, M9_UNTRIMMED_PREVIEW_PATH), { force: true });
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  const run = async () => {
    if (process.argv.length !== 3) {
      throw new Error(
        "Expected exactly render, contact-sheet, write, or check.",
      );
    }
    if (mode === "render") {
      await renderM9FinalPreviewMedia(process.cwd());
      return { storyId: STORY_ID, mode, frameCount: M9_REVIEW_FRAMES.length };
    }
    if (mode === "contact-sheet") {
      await renderM9ContactSheet(process.cwd());
      return { storyId: STORY_ID, mode };
    }
    if (mode !== "write" && mode !== "check") {
      throw new Error(
        "Expected exactly render, contact-sheet, write, or check.",
      );
    }
    const evidence = await runM9FinalPreviewEvidence({
      rootDir: process.cwd(),
      mode,
    });
    return {
      storyId: evidence.storyId,
      mode,
      aggregateStatus: evidence.aggregateStatus,
      evidenceFingerprint: evidence.evidenceFingerprint,
    };
  };
  run()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M9 final evidence failed."}\n`,
      );
      process.exitCode = 1;
    });
}
