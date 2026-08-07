import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import {
  FinalAssemblyPlanSchema,
  FinalPreviewEvidenceSchema,
  ResourceCatalogSchema,
  Sha256DigestSchema,
  createFinalPreviewEvidence,
  createFingerprint,
} from "../../../../contracts";
import { evaluateDuckEnvelope } from "../../../../remotion/runtime/global-sound";
import { checkPersistedFinalAssembly } from "../../../../../scripts/final-assembly/files";
import { generateResourceCatalog } from "../../../../../scripts/catalog/generate";
import { checksumExternalBytes } from "../../../../../scripts/external-references/project-files";
import { checkPersistedNarrativeAutoCheck } from "../../../../../scripts/project-check/report-files";
import { runNarrativeAutoCheck } from "../../../../../scripts/project-check/run";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../../../../../scripts/scene-package/project-files";
import { runM7Evidence } from "./scene-evidence";
import { freezeGpsM8Inputs } from "./final-inputs";

const execFileAsync = promisify(execFile);
const STORY_ID = "gps-relativity";
const COMPOSITION_ID = "GpsRelativity";
const OUTPUT_ROOT = "out/m8-gps-final-assembly";
const EVIDENCE_PATH =
  "src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json";
const REVIEW_PATH =
  "src/projects/gps-relativity/reviews/m8-final-assembly-review.json";
const M7_EVIDENCE_PATH =
  "src/projects/gps-relativity/generated/m7-scene-production-evidence.generated.json";
const ASSEMBLY_PATH =
  "src/projects/gps-relativity/generated/final-assembly.generated.json";
const CATALOG_PATH =
  "src/projects/gps-relativity/generated/resource-catalog.generated.json";

export const M8_FINAL_PREVIEW_PATH =
  `${OUTPUT_ROOT}/gps-relativity-m8-final-preview.mp4` as const;
export const M8_CONTACT_SHEET_PATH =
  `${OUTPUT_ROOT}/gps-relativity-m8-contact-sheet.png` as const;
export const M8_REPRESENTATIVE_FRAMES = [
  0, 188, 349, 360, 361, 373, 530, 684, 695, 696, 708, 855, 1006, 1017, 1018,
  1030, 1280, 1409, 1420, 1421, 1432, 1433, 1445, 1580, 1715, 1730,
] as const;

const stillPath = (frame: number) =>
  `${OUTPUT_ROOT}/stills/frame-${frame}.png` as const;

const note = z.string().trim().min(1).max(4_000);
const ReviewStatusSchema = z.literal("pass");
const M8FinalAssemblyReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewVersion: z.literal("m8-final-assembly-review-v1"),
    storyId: z.literal(STORY_ID),
    compositionId: z.literal(COMPOSITION_ID),
    finalAssemblyFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    m7EvidenceFingerprint: Sha256DigestSchema,
    previewChecksum: Sha256DigestSchema,
    reviewInputFingerprint: Sha256DigestSchema,
    globalSound: z
      .object({
        status: ReviewStatusSchema,
        narrationClarity: note,
        duckingBehavior: note,
        ambienceContinuity: note,
        sceneLocalSfx: note,
        boundaryIntegrity: note,
      })
      .strict(),
    globalVisual: z
      .object({
        status: ReviewStatusSchema,
        frameTreatment: note,
        gpsMeaning: note,
        sceneHierarchy: note,
        captionSafety: note,
        motionLegibility: note,
      })
      .strict(),
    finalContinuity: z
      .object({
        status: ReviewStatusSchema,
        sceneFlow: note,
        boundaryAlignment: note,
        spokenFrames: note,
        avSync: note,
      })
      .strict(),
    normalSpeed: z
      .object({
        status: ReviewStatusSchema,
        playbackRate: z.literal(1),
        completedFullPlayback: z.literal(true),
        previewChecksum: Sha256DigestSchema,
        startToEndObservation: note,
      })
      .strict(),
    aggregateStatus: ReviewStatusSchema,
  })
  .strict();

export type M8FinalAssemblyReview = z.infer<
  typeof M8FinalAssemblyReviewSchema
> & { readonly reviewFingerprint: z.infer<typeof Sha256DigestSchema> };

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(checksumExternalBytes(await readFile(path)));

export const readCurrentM8ReviewIdentities = async (rootDir: string) => {
  const [assembly, catalog, m7Evidence, previewChecksum] = await Promise.all([
    readJsonFile(join(rootDir, ASSEMBLY_PATH)).then(
      FinalAssemblyPlanSchema.parse,
    ),
    readJsonFile(join(rootDir, CATALOG_PATH)).then(ResourceCatalogSchema.parse),
    readJsonFile(join(rootDir, M7_EVIDENCE_PATH)).then((raw) =>
      z
        .object({ evidenceFingerprint: Sha256DigestSchema })
        .passthrough()
        .parse(raw),
    ),
    checksumFile(join(rootDir, M8_FINAL_PREVIEW_PATH)),
  ]);
  const input = {
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    m7EvidenceFingerprint: m7Evidence.evidenceFingerprint,
    previewChecksum,
  } as const;
  return {
    ...input,
    reviewInputFingerprint: createFingerprint({
      namespace: "m8-final-assembly-review-input",
      version: 1,
      value: input,
    }),
  } as const;
};

export const validateM8FinalAssemblyReview = async ({
  rootDir,
  rawReview,
}: {
  readonly rootDir: string;
  readonly rawReview: unknown;
}): Promise<M8FinalAssemblyReview> => {
  if (
    /FinalPreviewApproval|user-approved-current-preview|approvalVersion|approvalReference/i.test(
      JSON.stringify(rawReview),
    )
  ) {
    throw new Error("M8 Agent review cannot represent user approval.");
  }
  const review = M8FinalAssemblyReviewSchema.parse(rawReview);
  const current = await readCurrentM8ReviewIdentities(rootDir);
  if (
    review.finalAssemblyFingerprint !== current.finalAssemblyFingerprint ||
    review.resourceCatalogFingerprint !== current.resourceCatalogFingerprint ||
    review.m7EvidenceFingerprint !== current.m7EvidenceFingerprint ||
    review.previewChecksum !== current.previewChecksum ||
    review.normalSpeed.previewChecksum !== current.previewChecksum ||
    review.reviewInputFingerprint !== current.reviewInputFingerprint
  ) {
    throw new Error("M8 final assembly review identity is stale.");
  }
  return {
    ...review,
    reviewFingerprint: createFingerprint({
      namespace: "m8-final-assembly-review",
      version: 1,
      value: review,
    }),
  };
};

const runTool = async (
  command: string,
  args: readonly string[],
  rootDir: string,
  maxBuffer = 20 * 1024 * 1024,
) =>
  execFileAsync(command, [...args], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer,
  });

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
    throw new Error("M8 preview image codec or dimensions are stale.");
  }
};

const parseLastFinite = (text: string, pattern: RegExp, label: string) => {
  const matches = [...text.matchAll(pattern)];
  const raw = matches.at(-1)?.[1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`M8 ${label} analysis is incomplete.`);
  }
  return value;
};

export const assertM8MasteringMeasurements = ({
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
    throw new Error("M8 final preview loudness or peak is outside the plan.");
  }
};

export const inspectM8FinalPreviewTechnical = async ({
  rootDir,
  frozen,
}: {
  readonly rootDir: string;
  readonly frozen: Awaited<ReturnType<typeof freezeGpsM8Inputs>>;
}) => {
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
      M8_FINAL_PREVIEW_PATH,
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
    (stream) => stream.codec_type === "video",
  );
  const audios = probe.streams.filter(
    (stream) => stream.codec_type === "audio",
  );
  const video = videos[0];
  const audio = audios[0];
  const durationSeconds = Number(probe.format.duration);
  if (
    videos.length !== 1 ||
    audios.length !== 1 ||
    video?.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.avg_frame_rate !== "30/1" ||
    video.nb_read_frames !== "1731" ||
    audio?.codec_name !== "aac" ||
    audio.sample_rate !== "48000" ||
    audio.channels !== 2 ||
    audio.channel_layout !== "stereo" ||
    !Number.isFinite(durationSeconds) ||
    Math.abs(durationSeconds - 1731 / 30) > 0.1
  ) {
    throw new Error("M8 final preview stream identity is stale.");
  }

  await runTool(
    "ffmpeg",
    ["-v", "error", "-i", M8_FINAL_PREVIEW_PATH, "-f", "null", "-"],
    rootDir,
    50 * 1024 * 1024,
  );
  const [
    { stderr: loudnessOutput },
    { stderr: samplePeakOutput },
    ffmpegVersion,
    ffprobeVersion,
  ] = await Promise.all([
    runTool(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        M8_FINAL_PREVIEW_PATH,
        "-filter_complex",
        "ebur128=peak=true",
        "-f",
        "null",
        "-",
      ],
      rootDir,
      50 * 1024 * 1024,
    ),
    runTool(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        M8_FINAL_PREVIEW_PATH,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      rootDir,
      50 * 1024 * 1024,
    ),
    runTool("ffmpeg", ["-version"], rootDir),
    runTool("ffprobe", ["-version"], rootDir),
  ]);
  const integratedLoudnessLufs = parseLastFinite(
    loudnessOutput,
    /\bI:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g,
    "integrated loudness",
  );
  const truePeakDbtp = parseLastFinite(
    loudnessOutput,
    /\bPeak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/g,
    "true peak",
  );
  const samplePeakDbfs = parseLastFinite(
    samplePeakOutput,
    /max_volume:\s*(-?\d+(?:\.\d+)?)\s+dB/g,
    "sample peak",
  );
  const mastering = frozen.globalSoundPlan.masteringPolicy;
  assertM8MasteringMeasurements({
    integratedLoudnessLufs,
    truePeakDbtp,
    samplePeakDbfs,
    integratedLoudnessMinLufs: mastering.integratedLoudnessMinLufs,
    integratedLoudnessMaxLufs: mastering.integratedLoudnessMaxLufs,
    truePeakCeilingDbtp: mastering.truePeakCeilingDbtp,
  });

  const envelopeInput = {
    ranges: frozen.finalSound.spokenRanges,
    durationInFrames: frozen.globalSoundPlan.durationInFrames,
    attackFrames: frozen.globalSoundPlan.duckingPolicy.attackFrames,
    releaseFrames: frozen.globalSoundPlan.duckingPolicy.releaseFrames,
    spokenGain: frozen.globalSoundPlan.duckingPolicy.spokenGain,
    unspokenGain: frozen.globalSoundPlan.duckingPolicy.unspokenGain,
  } as const;
  const measurementFrames = [0, 15, 155, 687, 691, 696, 1716, 1730] as const;
  const envelopeMeasurements = measurementFrames.map((frame) => ({
    frame,
    duckGain: evaluateDuckEnvelope({ ...envelopeInput, frame }),
  }));
  const duckingEvidenceFingerprint = createFingerprint({
    namespace: "m8-final-mix-evidence",
    version: 1,
    value: {
      duckEnvelopeFingerprint:
        frozen.finalSound.projection.duckEnvelopeFingerprint,
      envelopeMeasurements,
      busGains: mastering,
      globalBusCount: frozen.globalSoundPlan.assets.length,
      sceneLocalSfxDucked: false,
      sceneLocalSfxProjectionFingerprint:
        frozen.finalSound.projection.soundDesignProjectionFingerprint,
      commands: {
        probe: "ffprobe-count-frames-show-streams-show-format-json-v1",
        decode: "ffmpeg-error-full-null-eof-v1",
        loudness: "ffmpeg-ebur128-peak-true-v1",
        samplePeak: "ffmpeg-volumedetect-v1",
      },
      toolVersions: {
        ffmpeg: ffmpegVersion.stdout.split("\n")[0],
        ffprobe: ffprobeVersion.stdout.split("\n")[0],
      },
    },
  });

  return {
    videoCodec: "h264" as const,
    width: 1920 as const,
    height: 1080 as const,
    fpsNumerator: 30 as const,
    fpsDenominator: 1 as const,
    frameCount: 1731 as const,
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

const validatePrerequisites = async (rootDir: string) => {
  const narrative = await runNarrativeAutoCheck({
    rootDir,
    projectId: STORY_ID,
  });
  if (narrative.aggregateStatus !== "pass") {
    throw new Error("M8 evidence requires a passing narrative check.");
  }
  await checkPersistedNarrativeAutoCheck({
    rootDir,
    expectedReport: narrative,
  });
  await generateResourceCatalog({ rootDir, mode: "check" });
  const frozen = await freezeGpsM8Inputs({ rootDir, mode: "check" });
  await checkPersistedFinalAssembly({
    rootDir,
    expectedAssembly: frozen.finalAssembly,
  });
  const m7Evidence = await runM7Evidence({ rootDir, mode: "check" });
  return { frozen, m7Evidence };
};

const collectM8FinalPreviewEvidence = async (rootDir: string) => {
  const { frozen } = await validatePrerequisites(rootDir);
  const stills = [];
  for (const frame of M8_REPRESENTATIVE_FRAMES) {
    const relativePath = stillPath(frame);
    await inspectPng({
      rootDir,
      relativePath,
      width: 1920,
      height: 1080,
    });
    stills.push({
      relativePath,
      checksum: await checksumFile(join(rootDir, relativePath)),
      frame,
    });
  }
  await inspectPng({
    rootDir,
    relativePath: M8_CONTACT_SHEET_PATH,
    width: 1920,
    height: 1890,
  });
  const technical = await inspectM8FinalPreviewTechnical({ rootDir, frozen });
  const review = await validateM8FinalAssemblyReview({
    rootDir,
    rawReview: await readJsonFile(join(rootDir, REVIEW_PATH)),
  });
  return createFinalPreviewEvidence({
    schemaVersion: 1,
    evidenceVersion: "final-preview-evidence-v1",
    storyId: STORY_ID,
    compositionId: COMPOSITION_ID,
    finalAssemblyFingerprint: frozen.finalAssembly.finalAssemblyFingerprint,
    resourceCatalogFingerprint: frozen.assemblyCatalog.catalogFingerprint,
    reviewFingerprint: review.reviewFingerprint,
    media: {
      fullPreview: {
        relativePath: M8_FINAL_PREVIEW_PATH,
        checksum: await checksumFile(join(rootDir, M8_FINAL_PREVIEW_PATH)),
      },
      contactSheet: {
        relativePath: M8_CONTACT_SHEET_PATH,
        checksum: await checksumFile(join(rootDir, M8_CONTACT_SHEET_PATH)),
      },
      representativeStills: stills,
    },
    technical,
    aggregateStatus: "ready-for-user-approval",
  });
};

export const writeM8FinalPreviewEvidenceArtifact = async ({
  destination,
  evidence,
}: {
  readonly destination: string;
  readonly evidence: unknown;
}) => {
  const parsed = FinalPreviewEvidenceSchema.parse(evidence);
  await writeOrCheckSceneArtifact({
    destination,
    value: parsed,
    mode: "write",
  });
  return parsed;
};

export const runM8FinalPreviewEvidence = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}) => {
  const evidence = await collectM8FinalPreviewEvidence(rootDir);
  const destination = join(rootDir, EVIDENCE_PATH);
  if (mode === "write") {
    await writeM8FinalPreviewEvidenceArtifact({ destination, evidence });
  } else {
    await writeOrCheckSceneArtifact({
      destination,
      value: evidence,
      mode: "check",
    });
  }
  return evidence;
};

export const renderM8ContactSheet = async (rootDir: string) => {
  const args: string[] = ["-y"];
  for (const frame of M8_REPRESENTATIVE_FRAMES) {
    args.push("-i", stillPath(frame));
  }
  const filters = M8_REPRESENTATIVE_FRAMES.map(
    (_, index) => `[${index}:v]scale=480:270[s${index}]`,
  );
  filters.push("color=c=#020817:s=480x270:d=1[blank0]");
  filters.push("color=c=#020817:s=480x270:d=1[blank1]");
  for (let row = 0; row < 7; row += 1) {
    const cells = Array.from({ length: 4 }, (_, column) => {
      const index = row * 4 + column;
      if (index < M8_REPRESENTATIVE_FRAMES.length) return `[s${index}]`;
      return index === 26 ? "[blank0]" : "[blank1]";
    }).join("");
    filters.push(`${cells}hstack=inputs=4[row${row}]`);
  }
  filters.push(
    `${Array.from({ length: 7 }, (_, row) => `[row${row}]`).join("")}vstack=inputs=7[out]`,
  );
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-frames:v",
    "1",
    M8_CONTACT_SHEET_PATH,
  );
  await runTool("ffmpeg", args, rootDir, 50 * 1024 * 1024);
};

export const renderM8FinalPreviewMedia = async (rootDir: string) => {
  await validatePrerequisites(rootDir);
  await mkdir(join(rootDir, OUTPUT_ROOT, "stills"), { recursive: true });
  const remotion = join(rootDir, "node_modules/.bin/remotion");
  for (const frame of M8_REPRESENTATIVE_FRAMES) {
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
      50 * 1024 * 1024,
    );
  }
  await renderM8ContactSheet(rootDir);
  await runTool(
    remotion,
    [
      "render",
      "src/index.ts",
      COMPOSITION_ID,
      M8_FINAL_PREVIEW_PATH,
      "--codec=h264",
      "--audio-codec=aac",
      "--concurrency=4",
      "--overwrite",
      "--log=error",
    ],
    rootDir,
    100 * 1024 * 1024,
  );
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
      await renderM8FinalPreviewMedia(process.cwd());
      return { storyId: STORY_ID, mode };
    }
    if (mode === "contact-sheet") {
      await renderM8ContactSheet(process.cwd());
      return { storyId: STORY_ID, mode };
    }
    if (mode !== "write" && mode !== "check") {
      throw new Error(
        "Expected exactly render, contact-sheet, write, or check.",
      );
    }
    const evidence = await runM8FinalPreviewEvidence({
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
        `${error instanceof Error ? error.message : "M8 evidence failed."}\n`,
      );
      process.exitCode = 1;
    });
}
