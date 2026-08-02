import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  Sha256DigestSchema,
  createFingerprint,
} from "../../src/contracts";
import {
  gpsRelativityCoverage,
  gpsRelativitySoundDesignProjection,
  gpsRelativityStoryVisualProjection,
} from "../../src/projects/gps-relativity/scene-runtime-data";
import { rendererRegistryFingerprint } from "../../src/projects/gps-relativity/renderer-registry.generated";
import { checksumExternalBytes } from "../external-references/project-files";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../scene-package/project-files";

const execFileAsync = promisify(execFile);
const STORY_ID = "gps-relativity";
const COMPOSITION_ID = "GpsRelativity";
const REVIEW_PATH = "src/projects/gps-relativity/reviews/m7-scene-review.json";
const EVIDENCE_PATH =
  "src/projects/gps-relativity/generated/m7-scene-production-evidence.generated.json";
const REVIEW_ROOT = "out/gps-relativity/m7-review";
const CONTACT_SHEET_PATH = `${REVIEW_ROOT}/gps-relativity-m7-contact-sheet.png`;
const REVIEW_VIDEO_PATH = `${REVIEW_ROOT}/gps-relativity-m7-review.mp4`;

const MEANING_IDS = [
  "position-is-time",
  "two-relativistic-effects",
  "net-drift",
  "error-accumulation",
  "practical-conclusion",
] as const;

const note = z.string().trim().min(1).max(2_000);
const ReviewSceneSchema = z
  .object({
    meaningId: z.enum(MEANING_IDS),
    packageFingerprint: Sha256DigestSchema,
    sceneVisualFingerprint: Sha256DigestSchema,
    sceneSoundFingerprint: Sha256DigestSchema,
    visual: z
      .object({
        status: z.literal("pass"),
        semanticObjective: note,
        styleRealization: note,
        composition: note,
        motionLegibility: note,
        captionSafeReadability: note,
        adjacentContinuity: note,
      })
      .strict(),
    sound: z
      .object({
        status: z.literal("pass"),
        cueNecessity: note,
        audibilityUnderNarration: note,
        anchorSync: note,
        volume: note,
        beatBoundary: note,
      })
      .strict(),
  })
  .strict();

const ContinuityReviewSchema = z
  .object({
    fromMeaningId: z.enum(MEANING_IDS),
    toMeaningId: z.enum(MEANING_IDS),
    fromSceneVisualFingerprint: Sha256DigestSchema,
    toSceneVisualFingerprint: Sha256DigestSchema,
    status: z.literal("pass"),
    notes: note,
  })
  .strict();

const M7SceneReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: z.literal(STORY_ID),
    status: z.literal("pass"),
    coverageFingerprint: Sha256DigestSchema,
    registryFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    soundDesignProjectionFingerprint: Sha256DigestSchema,
    scenes: z.array(ReviewSceneSchema).length(5).readonly(),
    continuity: z.array(ContinuityReviewSchema).length(4).readonly(),
  })
  .strict();

export type M7SceneReview = z.infer<typeof M7SceneReviewSchema>;

const loadPackages = async (rootDir: string) =>
  Promise.all(
    MEANING_IDS.map(async (meaningId) =>
      ScenePackageSchema.parse(
        await readJsonFile(
          join(
            rootDir,
            `src/projects/gps-relativity/scenes/${meaningId}/generated/scene-package.generated.json`,
          ),
        ),
      ),
    ),
  );

export const validateM7SceneReview = async ({
  rootDir,
  rawReview,
}: {
  readonly rootDir: string;
  readonly rawReview: unknown;
}): Promise<M7SceneReview> => {
  const review = M7SceneReviewSchema.parse(rawReview);
  const packages = await loadPackages(rootDir);
  const coverage = SceneCoverageMapSchema.parse(
    await readJsonFile(
      join(
        rootDir,
        "src/projects/gps-relativity/generated/scene-coverage.generated.json",
      ),
    ),
  );
  if (
    coverage.coverageFingerprint !==
      gpsRelativityCoverage.coverageFingerprint ||
    review.coverageFingerprint !== coverage.coverageFingerprint ||
    review.registryFingerprint !== rendererRegistryFingerprint ||
    review.storyVisualProjectionFingerprint !==
      gpsRelativityStoryVisualProjection.projectionFingerprint ||
    review.soundDesignProjectionFingerprint !==
      gpsRelativitySoundDesignProjection.soundDesignProjectionFingerprint
  ) {
    throw new Error("M7 Scene review global projection identity is stale.");
  }
  for (const [index, meaningId] of MEANING_IDS.entries()) {
    const sceneReview = review.scenes[index];
    const scenePackage = packages[index];
    const coverageEntry = coverage.entries[index];
    if (
      sceneReview?.meaningId !== meaningId ||
      scenePackage?.meaningId !== meaningId ||
      coverageEntry?.meaningId !== meaningId ||
      coverageEntry.status !== "ready" ||
      sceneReview.packageFingerprint !== scenePackage.packageFingerprint ||
      sceneReview.sceneVisualFingerprint !==
        scenePackage.sceneVisualFingerprint ||
      sceneReview.sceneSoundFingerprint !== scenePackage.sceneSoundFingerprint
    ) {
      throw new Error("M7 Scene review entry is stale or out of order.");
    }
    if (index === 0) continue;
    const boundary = review.continuity[index - 1];
    const prior = packages[index - 1];
    if (
      boundary?.fromMeaningId !== MEANING_IDS[index - 1] ||
      boundary.toMeaningId !== meaningId ||
      boundary.fromSceneVisualFingerprint !== prior.sceneVisualFingerprint ||
      boundary.toSceneVisualFingerprint !== scenePackage.sceneVisualFingerprint
    ) {
      throw new Error("M7 continuity review is stale or out of order.");
    }
  }
  return review;
};

const STILL_PHASES = ["early", "mid", "late"] as const;
const stillManifest = gpsRelativityStoryVisualProjection.entries.flatMap(
  (entry) => {
    const duration = entry.endFrame - entry.startFrame;
    return STILL_PHASES.map((phase, index) => {
      const fraction = (index + 1) / 4;
      const frame = entry.startFrame + Math.floor(duration * fraction);
      return {
        meaningId: entry.meaningId,
        phase,
        frame,
        localPath: `${REVIEW_ROOT}/stills/${entry.meaningId}-${phase}-frame-${frame}.png`,
      } as const;
    });
  },
);

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(checksumExternalBytes(await readFile(path)));

const inspectImage = async ({
  path,
  width,
  height,
}: {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}) => {
  const { stdout } = await execFileAsync(
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
      path,
    ],
    { encoding: "utf8" },
  );
  const facts = JSON.parse(stdout) as {
    streams?: readonly {
      codec_name?: string;
      width?: number;
      height?: number;
    }[];
  };
  const image = facts.streams?.[0];
  if (
    image?.codec_name !== "png" ||
    image.width !== width ||
    image.height !== height
  ) {
    throw new Error("M7 review image dimensions or codec are stale.");
  }
};

const inspectReviewVideo = async (path: string) => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,channels",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  const facts = JSON.parse(stdout) as {
    streams?: readonly {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      nb_read_frames?: string;
      channels?: number;
    }[];
    format?: { duration?: string };
  };
  const videos = facts.streams?.filter(
    ({ codec_type }) => codec_type === "video",
  );
  const audios = facts.streams?.filter(
    ({ codec_type }) => codec_type === "audio",
  );
  const video = videos?.[0];
  const audio = audios?.[0];
  if (
    videos?.length !== 1 ||
    audios?.length !== 1 ||
    video?.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.avg_frame_rate !== "30/1" ||
    video.nb_read_frames !== "1731" ||
    audio?.codec_name !== "aac" ||
    audio.channels !== 2
  ) {
    throw new Error(
      "M7 review video must be 1731-frame H.264 with one AAC mix.",
    );
  }
  return {
    durationInFrames: 1731 as const,
    fps: 30 as const,
    width: 1920 as const,
    height: 1080 as const,
    videoCodec: "h264" as const,
    videoStreams: 1 as const,
    audioCodec: "aac" as const,
    audioStreams: 1 as const,
    audioChannels: 2 as const,
    durationInSeconds: Number(facts.format?.duration),
  };
};

const renderReviewMedia = async (rootDir: string) => {
  await mkdir(join(rootDir, REVIEW_ROOT, "stills"), { recursive: true });
  const remotion = join(rootDir, "node_modules/.bin/remotion");
  for (const still of stillManifest) {
    await execFileAsync(
      remotion,
      [
        "still",
        "src/index.ts",
        COMPOSITION_ID,
        still.localPath,
        `--frame=${still.frame}`,
        "--log=error",
      ],
      { cwd: rootDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  }
  const contactArguments = ["-y"];
  for (const still of stillManifest) {
    contactArguments.push("-i", join(rootDir, still.localPath));
  }
  const scaled = stillManifest
    .map((_, index) => `[${index}:v]scale=640:360[s${index}]`)
    .join(";");
  const rows = Array.from(
    { length: 5 },
    (_, row) =>
      `[s${row * 3}][s${row * 3 + 1}][s${row * 3 + 2}]hstack=inputs=3[r${row}]`,
  ).join(";");
  contactArguments.push(
    "-filter_complex",
    `${scaled};${rows};[r0][r1][r2][r3][r4]vstack=inputs=5[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    join(rootDir, CONTACT_SHEET_PATH),
  );
  await execFileAsync("ffmpeg", contactArguments, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  await execFileAsync(
    remotion,
    [
      "render",
      "src/index.ts",
      COMPOSITION_ID,
      REVIEW_VIDEO_PATH,
      "--codec=h264",
      "--audio-codec=aac",
      "--concurrency=4",
      "--overwrite",
      "--log=error",
    ],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
};

const collectEvidence = async ({
  rootDir,
  review,
}: {
  readonly rootDir: string;
  readonly review: M7SceneReview;
}) => {
  const stills = [];
  for (const still of stillManifest) {
    await inspectImage({
      path: join(rootDir, still.localPath),
      width: 1920,
      height: 1080,
    });
    stills.push({
      ...still,
      checksum: await checksumFile(join(rootDir, still.localPath)),
    });
  }
  await inspectImage({
    path: join(rootDir, CONTACT_SHEET_PATH),
    width: 1920,
    height: 1800,
  });
  const reviewVideoFacts = await inspectReviewVideo(
    join(rootDir, REVIEW_VIDEO_PATH),
  );
  const input = {
    schemaVersion: 1 as const,
    storyId: STORY_ID,
    reviewFingerprint: createFingerprint({
      namespace: "m7-scene-review",
      version: 1,
      value: review,
    }),
    coverageFingerprint: gpsRelativityCoverage.coverageFingerprint,
    registryFingerprint: rendererRegistryFingerprint,
    storyVisualProjectionFingerprint:
      gpsRelativityStoryVisualProjection.projectionFingerprint,
    soundDesignProjectionFingerprint:
      gpsRelativitySoundDesignProjection.soundDesignProjectionFingerprint,
    stills,
    contactSheet: {
      localPath: CONTACT_SHEET_PATH,
      checksum: await checksumFile(join(rootDir, CONTACT_SHEET_PATH)),
      columns: 3 as const,
      rows: 5 as const,
      width: 1920 as const,
      height: 1800 as const,
    },
    reviewVideo: {
      localPath: REVIEW_VIDEO_PATH,
      checksum: await checksumFile(join(rootDir, REVIEW_VIDEO_PATH)),
      ...reviewVideoFacts,
    },
    exactFidelityMeaningIds: [] as const,
  };
  return {
    ...input,
    status: "pass" as const,
    evidenceFingerprint: createFingerprint({
      namespace: "m7-scene-production-evidence",
      version: 1,
      value: input,
    }),
  };
};

export const runM7Evidence = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}) => {
  const review = await validateM7SceneReview({
    rootDir,
    rawReview: await readJsonFile(join(rootDir, REVIEW_PATH)),
  });
  if (mode === "write") await renderReviewMedia(rootDir);
  const evidence = await collectEvidence({ rootDir, review });
  await writeOrCheckSceneArtifact({
    destination: join(rootDir, EVIDENCE_PATH),
    value: evidence,
    mode,
  });
  return evidence;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (mode !== "write" && mode !== "check") {
    process.stderr.write("Expected M7 evidence mode: write|check.\n");
    process.exitCode = 1;
  } else {
    runM7Evidence({ rootDir: process.cwd(), mode })
      .then((evidence) => {
        process.stdout.write(
          `${JSON.stringify({ storyId: evidence.storyId, status: evidence.status, evidenceFingerprint: evidence.evidenceFingerprint })}\n`,
        );
      })
      .catch((error: unknown) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : "M7 evidence failed."}\n`,
        );
        process.exitCode = 1;
      });
  }
}
