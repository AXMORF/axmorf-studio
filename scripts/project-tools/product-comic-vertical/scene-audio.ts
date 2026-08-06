import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { z } from "zod";

import {
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  serializeCanonicalJson,
} from "../../../src/contracts";
import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../catalog/domain";

const PROJECT_ID = "product-comic-vertical";
const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const SCENE_ASSET_PREFIX = "asset.product-comic-vertical.scene.";

export const PRODUCT_COMIC_SCENE_AUDIO_SPECS = [
  {
    meaningId: "problem-hook",
    fileName: "identity-break-pulse.wav",
    title: "Identity break pulse",
    durationSeconds: 0.34,
    frequencyHz: 196,
    overtoneHz: 294,
  },
  {
    meaningId: "problem-friction",
    fileName: "drift-warning-tick.wav",
    title: "Drift warning tick",
    durationSeconds: 0.28,
    frequencyHz: 233,
    overtoneHz: 174,
  },
  {
    meaningId: "product-reveal",
    fileName: "ink-close-snap.wav",
    title: "Ink close snap",
    durationSeconds: 0.3,
    frequencyHz: 330,
    overtoneHz: 495,
  },
  {
    meaningId: "core-capabilities",
    fileName: "authority-stack-chime.wav",
    title: "Authority stack chime",
    durationSeconds: 0.42,
    frequencyHz: 262,
    overtoneHz: 392,
  },
  {
    meaningId: "workflow-input",
    fileName: "source-check-tick.wav",
    title: "Source check tick",
    durationSeconds: 0.26,
    frequencyHz: 294,
    overtoneHz: 440,
  },
  {
    meaningId: "workflow-create",
    fileName: "seal-lock-pulse.wav",
    title: "Seal lock pulse",
    durationSeconds: 0.36,
    frequencyHz: 247,
    overtoneHz: 370,
  },
  {
    meaningId: "workflow-result",
    fileName: "evidence-stamp.wav",
    title: "Evidence stamp",
    durationSeconds: 0.32,
    frequencyHz: 220,
    overtoneHz: 440,
  },
  {
    meaningId: "differentiated-value",
    fileName: "invalidation-crack.wav",
    title: "Invalidation crack",
    durationSeconds: 0.3,
    frequencyHz: 185,
    overtoneHz: 277,
  },
  {
    meaningId: "proof-and-fit",
    fileName: "handoff-confirm.wav",
    title: "Handoff confirm",
    durationSeconds: 0.34,
    frequencyHz: 349,
    overtoneHz: 523,
  },
  {
    meaningId: "call-to-action",
    fileName: "process-start-chime.wav",
    title: "Process start chime",
    durationSeconds: 0.4,
    frequencyHz: 294,
    overtoneHz: 587,
  },
] as const;

type SceneAudioSpec = (typeof PRODUCT_COMIC_SCENE_AUDIO_SPECS)[number];

const checksumBytes = (bytes: Buffer) =>
  `sha256:${createHash("sha256")
    .update(bytes.toString("latin1"), "latin1")
    .digest("hex")}`;

const writeWaveHeader = (buffer: Buffer, sampleFrames: number) => {
  const dataBytes = sampleFrames * CHANNELS * (BITS_PER_SAMPLE / 8);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
};

const renderSceneCue = (spec: SceneAudioSpec): Buffer => {
  const sampleFrames = Math.round(spec.durationSeconds * SAMPLE_RATE);
  const buffer = Buffer.alloc(44 + sampleFrames * 2);
  writeWaveHeader(buffer, sampleFrames);
  for (let index = 0; index < sampleFrames; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = index / Math.max(1, sampleFrames - 1);
    const attack = Math.min(1, progress / 0.045);
    const release = Math.min(1, (1 - progress) / 0.38);
    const envelope =
      Math.sin(Math.PI * Math.min(1, attack)) *
      Math.pow(Math.max(0, release), 1.7);
    const fundamental = Math.sin(2 * Math.PI * spec.frequencyHz * time);
    const overtone = Math.sin(
      2 * Math.PI * spec.overtoneHz * time + Math.PI / 7,
    );
    const transient =
      Math.sin(2 * Math.PI * (spec.overtoneHz * 1.7) * time) *
      Math.exp(-time * 19);
    const sample = Math.max(
      -1,
      Math.min(
        1,
        (fundamental * 0.66 + overtone * 0.24 + transient * 0.1) *
          envelope *
          0.22,
      ),
    );
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return buffer;
};

const assetId = (spec: SceneAudioSpec) =>
  `${SCENE_ASSET_PREFIX}${spec.meaningId}.${spec.fileName.replace(/\.wav$/u, "")}`;

const localPath = (spec: SceneAudioSpec) =>
  `public/projects/${PROJECT_ID}/scene-audio/${spec.meaningId}/${spec.fileName}`;

const buildDescriptor = (spec: SceneAudioSpec, bytes: Buffer) => {
  const checksum = checksumBytes(bytes);
  return ResourceDescriptorSchema.parse({
    schemaVersion: 1,
    id: assetId(spec),
    kind: "asset",
    status: "approved",
    title: spec.title,
    description: `Project-authored mono PCM cue for the ${spec.meaningId} Scene's visible semantic state change.`,
    useCases: [`${spec.meaningId} scene-local cue`],
    tags: ["m9", "product-comic-vertical", spec.meaningId, "sfx"].sort(),
    authority: {
      kind: "repository-file",
      repositoryPath: `src/projects/${PROJECT_ID}/resource-catalog.json`,
    },
    allowedUse: "runtime-approved",
    assetKind: "audio",
    mediaRole: "scene-sfx",
    localPath: localPath(spec),
    checksum,
    license: {
      id: "Project-Authored",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-08-03T00:00:00.000Z",
      sourceEvidenceFingerprint: checksum,
    },
    media: {
      durationInSeconds: spec.durationSeconds,
      codec: "pcm_s16le",
      sampleRate: SAMPLE_RATE,
    },
  });
};

const ProjectOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.literal(PROJECT_ID),
    overlayVersion: z.literal("product-comic-vertical-m9-resource-overlay-v1"),
    baseCatalogFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    descriptors: z.array(ResourceDescriptorSchema),
  })
  .strict();

const readExpectedSceneDescriptors = () =>
  PRODUCT_COMIC_SCENE_AUDIO_SPECS.map((spec) => ({
    spec,
    bytes: renderSceneCue(spec),
  }));

const assertWaveFacts = (bytes: Buffer, spec: SceneAudioSpec) => {
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE" ||
    bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== CHANNELS ||
    bytes.readUInt32LE(24) !== SAMPLE_RATE ||
    bytes.readUInt16LE(34) !== BITS_PER_SAMPLE ||
    bytes.length !== 44 + Math.round(spec.durationSeconds * SAMPLE_RATE) * 2
  ) {
    throw new Error(
      `Scene cue is not the fixed 48 kHz mono s16le PCM: ${spec.meaningId}.`,
    );
  }
};

export const validateProductComicSceneAudio = async ({
  rootDir,
  overlay: rawOverlay,
  catalog: rawCatalog,
}: {
  readonly rootDir: string;
  readonly overlay: unknown;
  readonly catalog: unknown;
}) => {
  const overlay = ProjectOverlaySchema.parse(rawOverlay);
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  const sceneDescriptors = overlay.descriptors.filter((descriptor) =>
    descriptor.id.startsWith(SCENE_ASSET_PREFIX),
  );
  if (sceneDescriptors.length !== PRODUCT_COMIC_SCENE_AUDIO_SPECS.length) {
    throw new Error(
      "Project Catalog must contain exactly ten Scene audio descriptors.",
    );
  }
  const expected = readExpectedSceneDescriptors();
  for (const { spec, bytes: expectedBytes } of expected) {
    const descriptor = sceneDescriptors.find(
      (candidate) => candidate.id === assetId(spec),
    );
    if (
      !descriptor ||
      descriptor.kind !== "asset" ||
      descriptor.mediaRole !== "scene-sfx" ||
      descriptor.assetKind !== "audio" ||
      descriptor.license.verificationStatus !== "verified" ||
      descriptor.localPath !== localPath(spec) ||
      descriptor.media?.sampleRate !== SAMPLE_RATE ||
      descriptor.media.codec !== "pcm_s16le"
    ) {
      throw new Error(
        `Scene audio descriptor is missing or invalid: ${spec.meaningId}.`,
      );
    }
    const bytes = await readFile(resolve(rootDir, descriptor.localPath));
    assertWaveFacts(bytes, spec);
    if (
      checksumBytes(bytes) !== descriptor.checksum ||
      checksumBytes(bytes) !== checksumBytes(expectedBytes)
    ) {
      throw new Error(
        `Scene audio bytes or checksum drifted: ${spec.meaningId}.`,
      );
    }
    const catalogEntry = catalog.entries.find(
      (entry) => entry.descriptor.id === descriptor.id,
    );
    if (
      !catalogEntry ||
      serializeCanonicalJson(catalogEntry.descriptor) !==
        serializeCanonicalJson(descriptor)
    ) {
      throw new Error(`Merged Catalog identity drifted: ${spec.meaningId}.`);
    }
  }
  return { overlay, catalog };
};

const writeAtomic = async (destination: string, contents: Buffer | string) => {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporary = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let renamed = false;
  try {
    const handle = await open(temporary, "wx");
    try {
      if (typeof contents === "string") {
        await handle.writeFile(contents, "utf8");
      } else {
        await handle.writeFile(contents.toString("latin1"), "latin1");
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    renamed = true;
  } finally {
    if (!renamed) await unlink(temporary).catch(() => undefined);
  }
};

const run = async (mode: "write" | "check") => {
  const rootDir = resolve(import.meta.dirname, "../../..");
  const projectRoot = resolve(rootDir, `src/projects/${PROJECT_ID}`);
  const overlayPath = resolve(projectRoot, "resource-catalog.json");
  const generatedCatalogPath = resolve(
    projectRoot,
    "generated/resource-catalog.generated.json",
  );
  const baseCatalog = ResourceCatalogSchema.parse(
    JSON.parse(
      await readFile(
        resolve(
          rootDir,
          "src/remotion/catalog/resource-catalog.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  const currentOverlay = ProjectOverlaySchema.parse(
    JSON.parse(await readFile(overlayPath, "utf8")),
  );
  if (
    currentOverlay.baseCatalogFingerprint !== baseCatalog.catalogFingerprint
  ) {
    throw new Error(
      "Project Catalog overlay points at a stale shared Catalog.",
    );
  }
  const rendered = readExpectedSceneDescriptors();
  const sceneDescriptors = rendered.map(({ spec, bytes }) =>
    buildDescriptor(spec, bytes),
  );
  const otherDescriptors = currentOverlay.descriptors.filter(
    (descriptor) => !descriptor.id.startsWith(SCENE_ASSET_PREFIX),
  );
  const expectedOverlay = ProjectOverlaySchema.parse({
    ...currentOverlay,
    descriptors: [...otherDescriptors, ...sceneDescriptors].sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
  });
  const expectedCatalog = buildResourceCatalog([
    ...baseCatalog.entries.map((entry) => entry.descriptor),
    ...expectedOverlay.descriptors,
  ]);
  if (mode === "write") {
    for (const { spec, bytes } of rendered) {
      await writeAtomic(resolve(rootDir, localPath(spec)), bytes);
    }
    await writeAtomic(
      overlayPath,
      `${serializeCanonicalJson(expectedOverlay)}\n`,
    );
    await writeAtomic(
      generatedCatalogPath,
      renderResourceCatalogJson(expectedCatalog),
    );
  }
  const [actualOverlay, actualCatalog] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(generatedCatalogPath, "utf8"),
  ]);
  if (
    actualOverlay !== `${serializeCanonicalJson(expectedOverlay)}\n` ||
    actualCatalog !== renderResourceCatalogJson(expectedCatalog)
  ) {
    throw new Error("Project Scene audio Catalog bytes are stale.");
  }
  await validateProductComicSceneAudio({
    rootDir,
    overlay: JSON.parse(actualOverlay),
    catalog: JSON.parse(actualCatalog),
  });
  process.stdout.write(
    `M9 Scene audio current: ${rendered.length} PCM cues.\n`,
  );
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const mode = process.argv[2];
  if (mode !== "write" && mode !== "check") {
    process.stderr.write("Expected write or check.\n");
    process.exitCode = 1;
  } else {
    run(mode).catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Scene audio failed."}\n`,
      );
      process.exitCode = 1;
    });
  }
}
