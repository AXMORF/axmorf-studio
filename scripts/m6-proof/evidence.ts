import { execFile } from "node:child_process";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";

import {
  Sha256DigestSchema,
  createFingerprint,
  serializeCanonicalJson,
} from "../../src/contracts";
import {
  m6ProofCoverage,
  m6ProofFidelityReceipt,
  m6ProofScenePackage,
  m6ProofSoundDesignProjection,
  m6ProofStoryVisualProjection,
} from "../../src/remotion/proofs/m6-scene-runtime/proof-data";
import { rendererRegistryFingerprint } from "../../src/remotion/proofs/m6-scene-runtime/renderer-registry.generated";
import { checksumExternalBytes } from "../external-references/project-files";

const execFileAsync = promisify(execFile);

const M6ProofEvidenceInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    proofId: z.literal("M6SceneRuntimeProof"),
    scenePackageFingerprint: Sha256DigestSchema,
    coverageFingerprint: Sha256DigestSchema,
    rendererRegistryFingerprint: Sha256DigestSchema,
    fidelityReceiptFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    soundDesignProjectionFingerprint: Sha256DigestSchema,
    still: z
      .object({
        localPath: z.literal("out/m6-scene-runtime-proof/frame-72.png"),
        checksum: Sha256DigestSchema,
        frame: z.literal(72),
        alphaMin: z.literal(255),
        alphaMax: z.literal(255),
      })
      .strict(),
    render: z
      .object({
        localPath: z.literal("out/m6-scene-runtime-proof/proof.mp4"),
        checksum: Sha256DigestSchema,
        durationInFrames: z.literal(120),
        fps: z.literal(30),
        width: z.literal(1920),
        height: z.literal(1080),
        audioStreams: z.literal(1),
      })
      .strict(),
  })
  .strict();

export const M6ProofEvidenceReceiptSchema = M6ProofEvidenceInputSchema.extend({
  status: z.literal("pass"),
  evidenceFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((receipt, context) => {
    const input = { ...receipt } as Record<string, unknown>;
    delete input.status;
    delete input.evidenceFingerprint;
    const expected = createFingerprint({
      namespace: "m6-scene-runtime-proof-evidence",
      version: 1,
      value: M6ProofEvidenceInputSchema.parse(input),
    });
    if (receipt.evidenceFingerprint !== expected) {
      context.addIssue({
        code: "custom",
        message: "M6 proof evidence fingerprint is stale.",
        path: ["evidenceFingerprint"],
      });
    }
  });

export const createM6ProofEvidenceReceipt = (rawInput: unknown) => {
  const input = M6ProofEvidenceInputSchema.parse(rawInput);
  return M6ProofEvidenceReceiptSchema.parse({
    ...input,
    status: "pass",
    evidenceFingerprint: createFingerprint({
      namespace: "m6-scene-runtime-proof-evidence",
      version: 1,
      value: input,
    }),
  });
};

export const writeM6ProofEvidenceReceiptAtomic = async ({
  destination,
  receipt: rawReceipt,
}: {
  readonly destination: string;
  readonly receipt: unknown;
}): Promise<void> => {
  const receipt = M6ProofEvidenceReceiptSchema.parse(rawReceipt);
  const contents = `${serializeCanonicalJson(receipt)}\n`;
  try {
    if ((await readFile(destination, "utf8")) === contents) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const inspectStill = async (path: string) => {
  const { stdout: factsOutput } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  const facts = JSON.parse(factsOutput) as {
    streams?: readonly { width?: number; height?: number }[];
  };
  const width = facts.streams?.[0]?.width;
  const height = facts.streams?.[0]?.height;
  if (width !== 1920 || height !== 1080) {
    throw new Error("M6 proof still dimensions are stale.");
  }
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: 20 * 1024 * 1024 },
  );
  const pixels = stdout as unknown as Uint8Array;
  if (pixels.length !== width * height * 4) {
    throw new Error("M6 proof still pixel bytes are incomplete.");
  }
  let alphaMin = 255;
  let alphaMax = 0;
  let visibleCenterPixels = 0;
  let captionBrightPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const pixelIndex = offset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const alpha = pixels[offset + 3] ?? 0;
    alphaMin = Math.min(alphaMin, alpha);
    alphaMax = Math.max(alphaMax, alpha);
    if (x > 600 && x < 1320 && y > 250 && y < 800 && red + green + blue > 180) {
      visibleCenterPixels += 1;
    }
    if (y > 820 && red > 190 && green > 190 && blue > 190) {
      captionBrightPixels += 1;
    }
  }
  if (
    alphaMin !== 255 ||
    alphaMax !== 255 ||
    visibleCenterPixels < 1_000 ||
    captionBrightPixels < 100
  ) {
    throw new Error(
      "M6 proof still does not show current Scene and caption layering.",
    );
  }
  return { alphaMin: 255 as const, alphaMax: 255 as const };
};

const inspectRender = async (path: string) => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,width,height,r_frame_rate,nb_read_frames",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  const facts = JSON.parse(stdout) as {
    streams?: readonly {
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      nb_read_frames?: string;
    }[];
  };
  const video = facts.streams?.find((stream) => stream.codec_type === "video");
  const audioStreams =
    facts.streams?.filter((stream) => stream.codec_type === "audio").length ??
    0;
  if (
    video?.width !== 1920 ||
    video.height !== 1080 ||
    video.r_frame_rate !== "30/1" ||
    video.nb_read_frames !== "120" ||
    audioStreams !== 1
  ) {
    throw new Error("M6 proof render media facts are stale.");
  }
  return { audioStreams: 1 as const };
};

export const collectM6ProofEvidence = async (rootDir: string) => {
  const stillPath = "out/m6-scene-runtime-proof/frame-72.png";
  const renderPath = "out/m6-scene-runtime-proof/proof.mp4";
  const [stillBytes, renderBytes, stillFacts, renderFacts] = await Promise.all([
    readFile(join(rootDir, stillPath)),
    readFile(join(rootDir, renderPath)),
    inspectStill(join(rootDir, stillPath)),
    inspectRender(join(rootDir, renderPath)),
  ]);
  return createM6ProofEvidenceReceipt({
    schemaVersion: 1,
    proofId: "M6SceneRuntimeProof",
    scenePackageFingerprint: m6ProofScenePackage.packageFingerprint,
    coverageFingerprint: m6ProofCoverage.coverageFingerprint,
    rendererRegistryFingerprint,
    fidelityReceiptFingerprint: m6ProofFidelityReceipt.receiptFingerprint,
    storyVisualProjectionFingerprint:
      m6ProofStoryVisualProjection.projectionFingerprint,
    soundDesignProjectionFingerprint:
      m6ProofSoundDesignProjection.soundDesignProjectionFingerprint,
    still: {
      localPath: stillPath,
      checksum: checksumExternalBytes(stillBytes),
      frame: 72,
      ...stillFacts,
    },
    render: {
      localPath: renderPath,
      checksum: checksumExternalBytes(renderBytes),
      durationInFrames: 120,
      fps: 30,
      width: 1920,
      height: 1080,
      ...renderFacts,
    },
  });
};

const receiptPath = (rootDir: string) =>
  join(
    rootDir,
    "src/remotion/proofs/m6-scene-runtime/generated/m6-proof-evidence.generated.json",
  );

export const checkM6ProofEvidence = async (rootDir: string) => {
  const current = await collectM6ProofEvidence(rootDir);
  const persistedBytes = await readFile(receiptPath(rootDir), "utf8");
  const persisted = M6ProofEvidenceReceiptSchema.parse(
    JSON.parse(persistedBytes),
  );
  const expected = `${serializeCanonicalJson(current)}\n`;
  if (
    persistedBytes !== expected ||
    serializeCanonicalJson(persisted) !== serializeCanonicalJson(current)
  ) {
    throw new Error("M6 proof evidence receipt bytes are stale.");
  }
  return persisted;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (command !== "write" && command !== "check")
  ) {
    throw new Error("Expected exactly write or check.");
  }
  (command === "write"
    ? collectM6ProofEvidence(process.cwd()).then(async (receipt) => {
        await writeM6ProofEvidenceReceiptAtomic({
          destination: receiptPath(process.cwd()),
          receipt,
        });
        return receipt;
      })
    : checkM6ProofEvidence(process.cwd())
  )
    .then((receipt) => process.stdout.write(`${receipt.evidenceFingerprint}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M6 evidence failed."}\n`,
      );
      process.exitCode = 1;
    });
}
