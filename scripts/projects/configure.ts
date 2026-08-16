import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  AuthoredPublishingIntentSchema,
  NarrationSpecSchema,
  ProjectAssetManifestSchema,
  RenderSpecSchema,
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
  StoryIdSchema,
  StorySpecSchema,
  VideoBriefSchema,
  buildProductionRequirementsFreeze,
  buildPublishingIntent,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  serializeCanonicalJson,
  ProductionRequirementSchema,
} from "../../src/contracts";
import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";
import { writeTextFileAtomic } from "../shared/atomic-file";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import {
  commitConfiguredSceneTemplates,
  prepareConfiguredSceneTemplates,
} from "./application/instantiate-scene-templates";
import {
  commitProjectSound,
  prepareProjectSound,
} from "./application/localize-project-sound";

const DraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    render: z
      .object({
        compositionId: z.string(),
        leadInFrames: z.number().int().nonnegative(),
        tailFrames: z.number().int().nonnegative(),
        audioChannels: z.union([z.literal(1), z.literal(2)]),
      })
      .strict(),
    publishing: AuthoredPublishingIntentSchema,
    storyCheck: z
      .object({
        decision: z.enum(["proceed", "revise"]),
        checks: z
          .array(
            z
              .object({
                checkId: z.enum(STORY_CHECK_IDS),
                status: z.enum(["pass", "warn", "fail"]),
                note: z.string().trim().min(1),
              })
              .strict(),
          )
          .length(STORY_CHECK_IDS.length),
      })
      .strict(),
    production: z
      .object({
        enhancementSelection: z
          .object({
            storyVisual: z.literal("required"),
            sound: z.enum(["allowed", "none"]),
            globalVisual: z.literal("required"),
          })
          .strict(),
        resourcePolicy: z
          .object({
            selfAuthoredVisualsAllowed: z.literal(true),
            unlistedThirdPartyResources: z.literal("deny"),
          })
          .strict(),
        additionalRequirements: z.array(ProductionRequirementSchema).max(256),
      })
      .strict(),
  })
  .strict();

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const readJsonBytes = async (path: string, label: string) => {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const jsonBytes = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const assertNoConflicts = async (
  files: readonly Readonly<{ path: string; bytes: string }>[],
) => {
  const missing: Array<Readonly<{ path: string; bytes: string }>> = [];
  for (const file of files) {
    try {
      if ((await readFile(file.path, "utf8")) !== file.bytes) {
        throw new Error(
          "New Project configuration conflicts with already frozen output.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      missing.push(file);
    }
  }
  return missing;
};

const runProjectConfigureUnlocked = async ({
  rootDir,
  projectId: rawProjectId,
  inputPath,
  env,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly inputPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const projectDir = join(rootDir, "src/projects", projectId);
  const [briefArtifact, storyArtifact, draftArtifact, config] =
    await Promise.all([
      readJsonBytes(join(projectDir, "brief.json"), "brief.json"),
      readJsonBytes(join(projectDir, "story.json"), "story.json"),
      readJsonBytes(inputPath, "Project producer input"),
      resolveProducerConfigPathFromEnvironment({ rootDir, env }).then(
        (configPath) => readProducerConfig({ configPath }),
      ),
    ]);
  const brief = VideoBriefSchema.parse(briefArtifact.value);
  const sourceStory = StorySpecSchema.parse(storyArtifact.value);
  const draft = DraftSchema.parse(draftArtifact.value);
  if (brief.storyId !== projectId || sourceStory.storyId !== projectId) {
    throw new Error("Project producer input story identity is stale.");
  }
  const materialized = await prepareConfiguredSceneTemplates({
    rootDir,
    projectId,
    story: sourceStory,
    sceneDefaults: config.sceneDefaults,
  });
  const story = materialized.story;
  const baseAssetManifest =
    materialized.commit?.assetManifest ??
    ProjectAssetManifestSchema.parse(
      JSON.parse(
        await readFile(join(projectDir, "assets.manifest.json"), "utf8"),
      ),
    );
  const projectSound = await prepareProjectSound({
    rootDir,
    projectId,
    config,
    baseAssetManifest,
  });
  const narration = NarrationSpecSchema.parse({
    schemaVersion: 2,
    voiceProfileId: config.tts.defaultVoiceProfileId,
    mode: "voice-clone",
  });
  const { audioChannels, ...renderDraft } = draft.render;
  const render = RenderSpecSchema.parse({
    schemaVersion: 1,
    ...renderDraft,
    ...config.renderDefaults,
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels,
    },
  });
  const storyCheck = StoryCheckReportSchema.parse({
    schemaVersion: 1,
    storyId: projectId,
    storyFingerprint: computeStoryFingerprint(story),
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    voiceProfileId: narration.voiceProfileId,
    ...draft.storyCheck,
  });
  const publishingIntent = buildPublishingIntent({
    story,
    authored: draft.publishing,
    publishingCollections: config.publishingCollections,
  });
  const sourceBytes = {
    narration: jsonBytes(narration),
    render: jsonBytes(render),
    storyCheck: jsonBytes(storyCheck),
    publishingIntent: jsonBytes(publishingIntent),
    projectSound: jsonBytes(projectSound.plan),
  } as const;
  const requirements = buildProductionRequirementsFreeze({
    source: {
      brief,
      story,
      narration,
      render,
      storyCheck,
      projectSound: projectSound.plan,
    },
    sourceChecksums: {
      videoBrief: checksum(briefArtifact.bytes),
      storySpec: checksum(Buffer.from(materialized.storyBytes)),
      narrationSpec: checksum(Buffer.from(sourceBytes.narration)),
      renderSpec: checksum(Buffer.from(sourceBytes.render)),
      storyCheck: checksum(Buffer.from(sourceBytes.storyCheck)),
      projectSound: checksum(Buffer.from(sourceBytes.projectSound)),
    },
    ...draft.production,
    readability: { edgeInsetPx: config.readability.edgeInsetPx },
  });
  const files = [
    { path: join(projectDir, "narration.json"), bytes: sourceBytes.narration },
    { path: join(projectDir, "render.json"), bytes: sourceBytes.render },
    {
      path: join(projectDir, "reviews/story-check.json"),
      bytes: sourceBytes.storyCheck,
    },
    {
      path: join(projectDir, "publishing-intent.json"),
      bytes: sourceBytes.publishingIntent,
    },
    {
      path: join(projectDir, "production/requirements.json"),
      bytes: jsonBytes(requirements),
    },
    { path: join(projectDir, "sound.json"), bytes: sourceBytes.projectSound },
  ] as const;
  const missingFiles = await assertNoConflicts(files);
  await commitConfiguredSceneTemplates({
    rootDir,
    projectId,
    prepared: materialized,
  });
  await commitProjectSound({ rootDir, prepared: projectSound });
  await writeTextFileAtomic({
    destination: join(projectDir, "assets.manifest.json"),
    bytes: jsonBytes(projectSound.assetManifest),
    mode: "replace",
  });
  for (const file of missingFiles) {
    await writeTextFileAtomic({
      destination: file.path,
      bytes: file.bytes,
      mode: "create",
    });
  }
  return {
    storyId: projectId,
    requirementsFingerprint: requirements.requirementsFingerprint,
    publishingIntentFingerprint: publishingIntent.intentFingerprint,
    sceneTemplateInstantiationFingerprint:
      materialized.instantiation.instantiationFingerprint,
    copiedSceneMeaningIds: materialized.copiedMeaningIds,
  } as const;
};

export const runProjectConfigure = async (
  input: Parameters<typeof runProjectConfigureUnlocked>[0],
) => {
  const lock = await acquireRepositoryOperationLock({
    rootDir: input.rootDir,
    ownerId: "project-configure",
  });
  try {
    return await runProjectConfigureUnlocked(input);
  } finally {
    await lock.release();
  }
};

export const runProjectConfigureCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    env: Readonly<Record<string, string | undefined>>;
    stdout: (line: string) => void;
  }> = {
    rootDir: process.cwd(),
    env: process.env,
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  if (args.length !== 4 || args[0] !== "--project" || args[2] !== "--input") {
    throw new Error(
      "Expected --project <storyId> --input <repository-relative-json>.",
    );
  }
  const rawInputPath = args[3] ?? "";
  if (
    isAbsolute(rawInputPath) ||
    rawInputPath.includes("\\") ||
    rawInputPath.split("/").includes("..")
  ) {
    throw new Error("Project producer input must be repository-relative.");
  }
  const result = await runProjectConfigure({
    rootDir: context.rootDir,
    projectId: args[1] ?? "",
    inputPath: join(context.rootDir, rawInputPath),
    env: context.env,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectConfigureCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project configuration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
