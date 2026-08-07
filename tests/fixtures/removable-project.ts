import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import {
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
} from "../../src/contracts";
import {
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
  validVideoBrief,
} from "./narrative";

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const createRemovableProjectRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-removable-project-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  return rootDir;
};

export const writeRemovableProject = async ({
  rootDir,
  slug,
  compositionId,
}: {
  readonly rootDir: string;
  readonly slug: string;
  readonly compositionId: string;
}) => {
  const projectDir = join(rootDir, "src/projects", slug);
  const brief = { ...validVideoBrief, storyId: slug, title: slug };
  const story = { ...validStorySpec, storyId: slug, title: slug };
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const render = RenderSpecSchema.parse({
    ...validRenderSpec,
    compositionId,
  });
  const parsedStory = StorySpecSchema.parse(story);
  const pcm = {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId: slug,
    narrationSpec: narration,
    generationInputFingerprint: computeGenerationInputFingerprint(
      parsedStory,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk" as const,
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "A",
        localPath: `public/projects/${slug}/narration/chunks/opening-01.wav`,
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 52_800,
      },
      {
        kind: "pause" as const,
        afterChunkId: "opening-01",
        meaningId: "opening",
        pauseMs: 250,
        sampleFrameCount: 12_000,
      },
      {
        kind: "chunk" as const,
        chunkId: "conclusion-01",
        meaningId: "conclusion",
        ttsText: "B",
        localPath: `public/projects/${slug}/narration/chunks/conclusion-01.wav`,
        checksum: `sha256:${"b".repeat(64)}`,
        pcm,
        sampleFrameCount: 45_600,
      },
    ],
    completeAudio: {
      localPath: `public/projects/${slug}/narration/complete.wav`,
      checksum: `sha256:${"c".repeat(64)}`,
      pcm,
      sampleFrameCount: 110_400,
    },
  } as const;
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const semanticTiming = generateSemanticTiming({
    story: parsedStory,
    narration,
    render,
    sealedNarration,
  });

  await Promise.all([
    writeJson(join(projectDir, "brief.json"), brief),
    writeJson(join(projectDir, "story.json"), story),
    writeJson(join(projectDir, "narration.json"), narration),
    writeJson(join(projectDir, "render.json"), render),
    writeJson(
      join(projectDir, "generated/sealed-narration.generated.json"),
      sealedNarration,
    ),
    writeJson(
      join(projectDir, "generated/semantic-timing.generated.json"),
      semanticTiming,
    ),
  ]);
  await writeFile(
    join(projectDir, "Composition.tsx"),
    "const Composition = () => null; export default Composition;\n",
  );
  return projectDir;
};
