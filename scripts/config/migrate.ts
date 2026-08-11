import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

export const migrateVoxcpmConfigToProducerConfig = ({
  legacy,
}: {
  readonly legacy: VoxcpmPrivateConfig;
}) =>
  buildProducerConfig({
    schemaVersion: 1,
    contractVersion: "producer-config-v1",
    renderDefaults: {
      width: 1080,
      height: 1920,
      fps: 30,
      locale: "zh-CN",
    },
    readability: { edgeInsetPx: 90 },
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
          voiceProfiles: legacy.voiceProfiles.map((profile) => ({
            ...profile,
            name: profile.id,
          })),
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
  const config = migrateVoxcpmConfigToProducerConfig({ legacy });
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
