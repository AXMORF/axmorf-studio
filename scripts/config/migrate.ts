import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildProducerConfig } from "../../src/contracts";
import {
  VoxcpmPrivateConfigSchema,
  type VoxcpmPrivateConfig,
} from "../narration/adapters/private-config";
import {
  resolveProducerConfigPathFromEnvironment,
  writeProducerConfig,
} from "./producer-config";

const canonicalPath = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

const toPortableVoicePath = ({
  rootDir,
  sourcePath,
}: {
  readonly rootDir: string;
  readonly sourcePath: string;
}) => {
  if (!isAbsolute(sourcePath)) return sourcePath;
  const repositoryPath = relative(
    canonicalPath(rootDir),
    canonicalPath(sourcePath),
  );
  if (
    repositoryPath !== "" &&
    !repositoryPath.startsWith("..") &&
    !isAbsolute(repositoryPath)
  ) {
    return repositoryPath;
  }
  throw new Error(
    "Voice files must be moved under the repository before migration.",
  );
};

export const migrateVoxcpmConfigToProducerConfig = ({
  legacy,
  rootDir,
}: {
  readonly legacy: VoxcpmPrivateConfig;
  readonly rootDir: string;
}) =>
  buildProducerConfig({
    schemaVersion: 2,
    contractVersion: "producer-config-v2",
    renderDefaults: {
      width: 1080,
      height: 1920,
      fps: 30,
      locale: "zh-CN",
    },
    readability: { edgeInsetPx: 90 },
    sceneDefaults: {
      introSceneTemplateId: "axmorf-brand-reveal-v1",
      outroSceneTemplateId: "axmorf-source-follow-v1",
    },
    audioDefaults: { globalBgm: null },
    publishingCollections: [
      {
        id: "default",
        name: "默认合集",
        description: "尚未归入更具体合集的视频。",
      },
    ],
    tts: {
      defaultProviderId: "local-voxcpm",
      defaultVoiceProfileId: legacy.voiceProfiles[0]?.id,
      speech: { rate: 1, targetLoudnessLufs: -16 },
      providers: [
        {
          id: "local-voxcpm",
          kind: "voxcpm",
          name: "本地 VoxCPM",
          connection: {
            baseUrl: legacy.baseUrl,
            ...(legacy.token === undefined ? {} : { token: legacy.token }),
            timeoutMs: legacy.timeoutMs,
          },
          modelId: legacy.modelId,
          routes: {
            controllableClone: "/clone",
            highFidelityClone: "/clone_with_prompt",
          },
          parameters: legacy.parameters,
          voiceProfiles: legacy.voiceProfiles.map((profile) =>
            profile.mode === "controllable-clone"
              ? {
                  ...profile,
                  name: profile.id,
                  referenceAudioPath: toPortableVoicePath({
                    rootDir,
                    sourcePath: profile.referenceAudioPath,
                  }),
                }
              : {
                  ...profile,
                  name: profile.id,
                  promptAudioPath: toPortableVoicePath({
                    rootDir,
                    sourcePath: profile.promptAudioPath,
                  }),
                  promptTextPath: toPortableVoicePath({
                    rootDir,
                    sourcePath: profile.promptTextPath,
                  }),
                },
          ),
        },
      ],
    },
  });

export const runProducerConfigMigration = async ({
  rootDir,
  env = {},
}: {
  readonly rootDir: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}) => {
  const legacyPath = join(rootDir, "voxcpm/voxcpm.private.json");
  const destinationPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const legacy = VoxcpmPrivateConfigSchema.parse(
    JSON.parse(await readFile(legacyPath, "utf8")),
  );
  const config = migrateVoxcpmConfigToProducerConfig({ legacy, rootDir });
  await writeProducerConfig({
    configPath: destinationPath,
    value: config,
    overwrite: false,
  });
  return { destinationPath, configFingerprint: config.configFingerprint };
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProducerConfigMigration({ rootDir: process.cwd(), env: process.env })
    .then(({ destinationPath }) => {
      process.stdout.write(`Producer config written to ${destinationPath}.\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Config migration failed."}\n`,
      );
      process.exitCode = 1;
    });
}
