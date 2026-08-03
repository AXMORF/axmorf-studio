import {execFile} from "node:child_process";
import {mkdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";

import {z} from "zod";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  Sha256DigestSchema,
  createFingerprint,
} from "../../src/contracts";
import {
  productComicVerticalCoverage,
  productComicVerticalSoundDesignProjection,
  productComicVerticalStoryVisualProjection,
} from "../../src/projects/product-comic-vertical/scene-runtime-data";
import {rendererRegistryFingerprint} from "../../src/projects/product-comic-vertical/renderer-registry.generated";
import {checksumExternalBytes} from "../external-references/project-files";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../scene-package/project-files";

const execFileAsync = promisify(execFile);
const STORY_ID = "product-comic-vertical";
const COMPOSITION_ID = "ProductComicVertical";
const REVIEW_PATH =
  "src/projects/product-comic-vertical/reviews/scene-review.json";
const EVIDENCE_PATH =
  "src/projects/product-comic-vertical/generated/m9-scene-production-evidence.generated.json";
const REVIEW_ROOT = "out/m9-product-comic-vertical/scene-review";
const CONTACT_SHEET_PATH = `${REVIEW_ROOT}/scene-contact-sheet.png`;
const REVIEW_VIDEO_PATH = `${REVIEW_ROOT}/scene-review.mp4`;

export const M9_MEANING_IDS = [
  "problem-hook",
  "problem-friction",
  "product-reveal",
  "core-capabilities",
  "workflow-input",
  "workflow-create",
  "workflow-result",
  "differentiated-value",
  "proof-and-fit",
  "call-to-action",
] as const;

const MeaningIdSchema = z.enum(M9_MEANING_IDS);
const note = z.string().trim().min(1).max(2_000);
const ReviewSceneSchema = z
  .object({
    meaningId: MeaningIdSchema,
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
    fromMeaningId: MeaningIdSchema,
    toMeaningId: MeaningIdSchema,
    fromSceneVisualFingerprint: Sha256DigestSchema,
    toSceneVisualFingerprint: Sha256DigestSchema,
    status: z.literal("pass"),
    notes: note,
  })
  .strict();

const M9SceneReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: z.literal(STORY_ID),
    status: z.literal("pass"),
    coverageFingerprint: Sha256DigestSchema,
    registryFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    soundDesignProjectionFingerprint: Sha256DigestSchema,
    scenes: z.array(ReviewSceneSchema).length(10).readonly(),
    continuity: z.array(ContinuityReviewSchema).length(9).readonly(),
  })
  .strict();

export type M9SceneReview = z.infer<typeof M9SceneReviewSchema>;

const loadPackages = async (rootDir: string) =>
  Promise.all(
    M9_MEANING_IDS.map(async (meaningId) =>
      ScenePackageSchema.parse(
        await readJsonFile(
          join(
            rootDir,
            `src/projects/product-comic-vertical/scenes/${meaningId}/generated/scene-package.generated.json`,
          ),
        ),
      ),
    ),
  );

export const validateM9SceneReview = async ({
  rootDir,
  rawReview,
}: {
  readonly rootDir: string;
  readonly rawReview: unknown;
}): Promise<M9SceneReview> => {
  const review = M9SceneReviewSchema.parse(rawReview);
  const packages = await loadPackages(rootDir);
  const coverage = SceneCoverageMapSchema.parse(
    await readJsonFile(
      join(
        rootDir,
        "src/projects/product-comic-vertical/generated/scene-coverage.generated.json",
      ),
    ),
  );
  if (
    coverage.coverageFingerprint !==
      productComicVerticalCoverage.coverageFingerprint ||
    review.coverageFingerprint !== coverage.coverageFingerprint ||
    review.registryFingerprint !== rendererRegistryFingerprint ||
    review.storyVisualProjectionFingerprint !==
      productComicVerticalStoryVisualProjection.projectionFingerprint ||
    review.soundDesignProjectionFingerprint !==
      productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint
  ) {
    throw new Error("M9 Scene review global projection identity is stale.");
  }
  for (const [index, meaningId] of M9_MEANING_IDS.entries()) {
    const sceneReview = review.scenes[index];
    const scenePackage = packages[index];
    const coverageEntry = coverage.entries[index];
    if (
      sceneReview?.meaningId !== meaningId ||
      scenePackage?.meaningId !== meaningId ||
      coverageEntry?.meaningId !== meaningId ||
      coverageEntry.status !== "ready" ||
      sceneReview.packageFingerprint !== scenePackage.packageFingerprint ||
      sceneReview.sceneVisualFingerprint !== scenePackage.sceneVisualFingerprint ||
      sceneReview.sceneSoundFingerprint !== scenePackage.sceneSoundFingerprint
    ) {
      throw new Error("M9 Scene review entry is stale or out of order.");
    }
    if (index === 0) continue;
    const boundary = review.continuity[index - 1];
    const prior = packages[index - 1];
    if (
      boundary?.fromMeaningId !== M9_MEANING_IDS[index - 1] ||
      boundary.toMeaningId !== meaningId ||
      boundary.fromSceneVisualFingerprint !== prior?.sceneVisualFingerprint ||
      boundary.toSceneVisualFingerprint !== scenePackage.sceneVisualFingerprint
    ) {
      throw new Error("M9 continuity review is stale or out of order.");
    }
  }
  return review;
};

type StillEvidence = Readonly<{
  meaningId: (typeof M9_MEANING_IDS)[number];
  purpose: string;
  frame: number;
  localPath: string;
}>;

export const buildM9StillManifest = (): readonly StillEvidence[] => {
  const manifest: StillEvidence[] = [];
  for (const entry of productComicVerticalStoryVisualProjection.entries) {
    const meaningId = MeaningIdSchema.parse(entry.meaningId);
    const duration = entry.endFrame - entry.startFrame;
    for (const [purpose, frame] of [
      ["entry", entry.startFrame],
      ["middle", entry.startFrame + Math.floor(duration / 2)],
      ["exit", entry.endFrame - 1],
    ] as const) {
      manifest.push({
        meaningId,
        purpose,
        frame,
        localPath: `${REVIEW_ROOT}/stills/${String(frame).padStart(4, "0")}-${meaningId}-${purpose}.png`,
      });
    }
    const soundEntry = productComicVerticalSoundDesignProjection.entries.find(
      (candidate) => candidate.meaningId === meaningId,
    );
    if (soundEntry?.status !== "ready") {
      throw new Error("M9 Scene sound evidence projection is missing.");
    }
    const cue = soundEntry.sceneSoundProjection.contributions[0];
    if (cue === undefined) {
      throw new Error("M9 Scene review requires one audible Scene cue.");
    }
    manifest.push({
      meaningId,
      purpose: "scene-cue-peak",
      frame: entry.startFrame + cue.startFrame,
      localPath: `${REVIEW_ROOT}/stills/${String(entry.startFrame + cue.startFrame).padStart(4, "0")}-${meaningId}-scene-cue-peak.png`,
    });
  }
  const reveal = productComicVerticalStoryVisualProjection.entries.find(
    ({meaningId}) => meaningId === "product-reveal",
  );
  if (reveal === undefined) throw new Error("M9 exact Scene is missing.");
  for (const localFrame of [46, 89, 163] as const) {
    const frame = reveal.startFrame + localFrame;
    manifest.push({
      meaningId: "product-reveal",
      purpose: `exact-phase-${localFrame}`,
      frame,
      localPath: `${REVIEW_ROOT}/stills/${String(frame).padStart(4, "0")}-product-reveal-exact-phase-${localFrame}.png`,
    });
  }
  const workflow = productComicVerticalStoryVisualProjection.entries.find(
    ({meaningId}) => meaningId === "workflow-create",
  );
  if (workflow === undefined) throw new Error("M9 workflow Scene is missing.");
  for (const [purpose, localFrame] of [
    ["panel-handoff-reference", 360],
    ["panel-handoff-registry", 590],
  ] as const) {
    const frame = workflow.startFrame + localFrame;
    manifest.push({
      meaningId: "workflow-create",
      purpose,
      frame,
      localPath: `${REVIEW_ROOT}/stills/${String(frame).padStart(4, "0")}-workflow-create-${purpose}.png`,
    });
  }
  return manifest.sort(
    (left, right) => left.frame - right.frame || left.purpose.localeCompare(right.purpose),
  );
};

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
  const {stdout} = await execFileAsync(
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
    {encoding: "utf8"},
  );
  const facts = JSON.parse(stdout) as {
    streams?: readonly {codec_name?: string; width?: number; height?: number}[];
  };
  const image = facts.streams?.[0];
  if (
    image?.codec_name !== "png" ||
    image.width !== width ||
    image.height !== height
  ) {
    throw new Error("M9 review image dimensions or codec are stale.");
  }
};

const inspectReviewVideo = async (path: string) => {
  const {stdout} = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,channels,sample_rate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      path,
    ],
    {encoding: "utf8", maxBuffer: 10 * 1024 * 1024},
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
      sample_rate?: string;
    }[];
    format?: {duration?: string};
  };
  const videos = facts.streams?.filter(({codec_type}) => codec_type === "video");
  const audios = facts.streams?.filter(({codec_type}) => codec_type === "audio");
  const video = videos?.[0];
  const audio = audios?.[0];
  if (
    videos?.length !== 1 ||
    audios?.length !== 1 ||
    video?.codec_name !== "h264" ||
    video.width !== 1080 ||
    video.height !== 1920 ||
    video.avg_frame_rate !== "30/1" ||
    video.nb_read_frames !== "5116" ||
    audio?.codec_name !== "aac" ||
    audio.channels !== 2 ||
    audio.sample_rate !== "48000"
  ) {
    throw new Error(
      "M9 review video must be 5116-frame portrait H.264 with one 48 kHz AAC mix.",
    );
  }
  return {
    durationInFrames: 5116 as const,
    fps: 30 as const,
    width: 1080 as const,
    height: 1920 as const,
    videoCodec: "h264" as const,
    videoStreams: 1 as const,
    audioCodec: "aac" as const,
    audioStreams: 1 as const,
    audioChannels: 2 as const,
    audioSampleRate: 48000 as const,
    durationInSeconds: Number(facts.format?.duration),
  };
};

const renderReviewMedia = async (rootDir: string) => {
  const manifest = buildM9StillManifest();
  if (manifest.length !== 45) {
    throw new Error("M9 review manifest must contain exactly 45 ordered stills.");
  }
  await mkdir(join(rootDir, REVIEW_ROOT, "stills"), {recursive: true});
  const remotion = join(rootDir, "node_modules/.bin/remotion");
  for (const still of manifest) {
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
      {cwd: rootDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024},
    );
  }
  const contactArguments = ["-y"];
  for (const still of manifest) {
    contactArguments.push("-i", join(rootDir, still.localPath));
  }
  const scaled = manifest
    .map((_, index) => `[${index}:v]scale=216:384[s${index}]`)
    .join(";");
  const rows = Array.from({length: 9}, (_, row) => {
    const inputs = Array.from(
      {length: 5},
      (_, column) => `[s${row * 5 + column}]`,
    ).join("");
    return `${inputs}hstack=inputs=5[r${row}]`;
  }).join(";");
  const rowInputs = Array.from({length: 9}, (_, row) => `[r${row}]`).join("");
  contactArguments.push(
    "-filter_complex",
    `${scaled};${rows};${rowInputs}vstack=inputs=9[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    join(rootDir, CONTACT_SHEET_PATH),
  );
  await execFileAsync("ffmpeg", contactArguments, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
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
      "--concurrency=3",
      "--overwrite",
      "--log=error",
    ],
    {cwd: rootDir, encoding: "utf8", maxBuffer: 50 * 1024 * 1024},
  );
};

const collectEvidence = async ({
  rootDir,
  review,
}: {
  readonly rootDir: string;
  readonly review: M9SceneReview;
}) => {
  const stills = [];
  const manifest = buildM9StillManifest();
  for (const still of manifest) {
    await inspectImage({path: join(rootDir, still.localPath), width: 1080, height: 1920});
    stills.push({...still, checksum: await checksumFile(join(rootDir, still.localPath))});
  }
  await inspectImage({path: join(rootDir, CONTACT_SHEET_PATH), width: 1080, height: 3456});
  const reviewVideoFacts = await inspectReviewVideo(join(rootDir, REVIEW_VIDEO_PATH));
  const input = {
    schemaVersion: 1 as const,
    storyId: STORY_ID,
    reviewFingerprint: createFingerprint({
      namespace: "m9-scene-review",
      version: 1,
      value: review,
    }),
    coverageFingerprint: productComicVerticalCoverage.coverageFingerprint,
    registryFingerprint: rendererRegistryFingerprint,
    storyVisualProjectionFingerprint:
      productComicVerticalStoryVisualProjection.projectionFingerprint,
    soundDesignProjectionFingerprint:
      productComicVerticalSoundDesignProjection.soundDesignProjectionFingerprint,
    stills,
    contactSheet: {
      localPath: CONTACT_SHEET_PATH,
      checksum: await checksumFile(join(rootDir, CONTACT_SHEET_PATH)),
      columns: 5 as const,
      rows: 9 as const,
      width: 1080 as const,
      height: 3456 as const,
    },
    reviewVideo: {
      localPath: REVIEW_VIDEO_PATH,
      checksum: await checksumFile(join(rootDir, REVIEW_VIDEO_PATH)),
      ...reviewVideoFacts,
    },
    exactFidelityMeaningIds: ["product-reveal"] as const,
  };
  return {
    ...input,
    status: "pass" as const,
    evidenceFingerprint: createFingerprint({
      namespace: "m9-scene-production-evidence",
      version: 1,
      value: input,
    }),
  };
};

export const runM9SceneEvidence = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}) => {
  const review = await validateM9SceneReview({
    rootDir,
    rawReview: await readJsonFile(join(rootDir, REVIEW_PATH)),
  });
  const evidence = await collectEvidence({rootDir, review});
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
  if (mode === "render") {
    renderReviewMedia(process.cwd())
      .then(() => process.stdout.write("M9 Scene review media rendered.\n"))
      .catch((error: unknown) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : "M9 Scene review render failed."}\n`,
        );
        process.exitCode = 1;
      });
  } else if (mode === "write" || mode === "check") {
    runM9SceneEvidence({rootDir: process.cwd(), mode})
      .then((evidence) => {
        process.stdout.write(
          `${JSON.stringify({storyId: evidence.storyId, status: evidence.status, evidenceFingerprint: evidence.evidenceFingerprint})}\n`,
        );
      })
      .catch((error: unknown) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : "M9 Scene evidence failed."}\n`,
        );
        process.exitCode = 1;
      });
  } else {
    process.stderr.write("Expected M9 Scene evidence mode: render|write|check.\n");
    process.exitCode = 1;
  }
}
