import { randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import {
  lstat,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { z } from "zod";

import { serializeCanonicalJson } from "@axmorf/studio/contracts";
import { VoiceProfileIdSchema } from "@axmorf/studio/contracts";
import { measureCanonicalPcmWav } from "../domain/pcm-wav";
import { normalizePromptAudio as normalizePromptAudioBytes } from "./prompt-audio-normalizer";
import {
  VoxcpmPrivateConfigSchema,
  type VoxcpmPrivateConfig,
} from "./private-config";

const LegacyProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    mode: z.enum(["controllable-clone", "high-fidelity-clone"]),
  })
  .passthrough();

const LegacyPrivateConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    baseUrl: z.string(),
    token: z.string().optional(),
    timeoutMs: z.number(),
    modelId: z.string(),
    endpointPath: z.literal("/clone"),
    parameters: z
      .object({
        cfgValue: z.number(),
        inferenceTimesteps: z.number(),
        normalize: z.boolean(),
        denoise: z.boolean(),
        retryBadcase: z.boolean(),
      })
      .strict(),
    voiceProfiles: z.array(LegacyProfileSchema).min(1),
  })
  .strict();

type LegacyProfile = z.infer<typeof LegacyProfileSchema>;
type ConfirmedPromptInputs = Readonly<{
  promptAudioPath: string;
  promptTextPath: string;
}>;

export class VoxcpmPrivateConfigMigrationBlocker extends Error {
  readonly code = "VOXCPM_HIGH_FIDELITY_INPUT_BLOCKED" as const;

  constructor() {
    super(
      "The selected voice profile lacks confirmed high-fidelity prompt inputs.",
    );
    this.name = "VoxcpmPrivateConfigMigrationBlocker";
  }
}

const highFidelityInputs = (profile: LegacyProfile) =>
  profile.promptTranscriptConfirmed === true &&
  typeof profile.promptAudioPath === "string" &&
  profile.promptAudioPath.trim() !== "" &&
  typeof profile.promptTextPath === "string" &&
  profile.promptTextPath.trim() !== ""
    ? {
        promptAudioPath: profile.promptAudioPath,
        promptTextPath: profile.promptTextPath,
      }
    : undefined;

export const migrateVoxcpmPrivateConfigValue = ({
  rawConfig,
  targetProfileId,
  confirmedTargetInputs,
}: {
  readonly rawConfig: unknown;
  readonly targetProfileId: string;
  readonly confirmedTargetInputs?: ConfirmedPromptInputs;
}): VoxcpmPrivateConfig => {
  const current = VoxcpmPrivateConfigSchema.safeParse(rawConfig);
  if (current.success) {
    const matches = current.data.voiceProfiles.filter(
      (profile) => profile.id === targetProfileId,
    );
    if (matches.length !== 1 || matches[0]?.mode !== "high-fidelity-clone") {
      throw new VoxcpmPrivateConfigMigrationBlocker();
    }
    return current.data;
  }

  const legacy = LegacyPrivateConfigSchema.parse(rawConfig);
  const targets = legacy.voiceProfiles.filter(
    (profile) => profile.id === targetProfileId,
  );
  if (targets.length !== 1) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  const target = targets[0];
  const targetInputs = highFidelityInputs(target);
  const referenceAudioPath =
    target.mode === "controllable-clone" &&
    typeof target.referenceAudioPath === "string"
      ? target.referenceAudioPath
      : undefined;
  const matchingInputs = [
    ...(targetInputs === undefined ? [] : [targetInputs]),
    ...(confirmedTargetInputs !== undefined &&
    confirmedTargetInputs.promptAudioPath === referenceAudioPath
      ? [confirmedTargetInputs]
      : []),
    ...legacy.voiceProfiles
      .filter(
        (profile) =>
          profile.id !== targetProfileId &&
          profile.mode === "high-fidelity-clone" &&
          referenceAudioPath !== undefined &&
          profile.promptAudioPath === referenceAudioPath,
      )
      .flatMap((profile) => {
        const inputs = highFidelityInputs(profile);
        return inputs === undefined ? [] : [inputs];
      }),
  ];
  const uniqueInputs = new Map(
    matchingInputs.map((inputs) => [
      `${inputs.promptAudioPath}\u0000${inputs.promptTextPath}`,
      inputs,
    ]),
  );
  if (uniqueInputs.size !== 1) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  const inputs = [...uniqueInputs.values()][0];
  if (inputs === undefined) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }

  return VoxcpmPrivateConfigSchema.parse({
    ...legacy,
    schemaVersion: 2,
    parameters: {
      ...legacy.parameters,
      minLen: 2,
      maxLen: 4096,
      retryBadcaseMaxTimes: 3,
      retryBadcaseRatioThreshold: 6,
    },
    voiceProfiles: legacy.voiceProfiles.map((profile) =>
      profile.id === targetProfileId
        ? {
            id: targetProfileId,
            mode: "high-fidelity-clone",
            promptAudioPath: inputs.promptAudioPath,
            promptTextPath: inputs.promptTextPath,
            promptTranscriptConfirmed: true,
          }
        : profile,
    ),
  });
};

const discoverConfirmedAdjacentTranscript = async ({
  rawConfig,
  targetProfileId,
}: {
  readonly rawConfig: unknown;
  readonly targetProfileId: string;
}): Promise<ConfirmedPromptInputs | undefined> => {
  const legacy = LegacyPrivateConfigSchema.safeParse(rawConfig);
  if (!legacy.success) return undefined;
  const targets = legacy.data.voiceProfiles.filter(
    (profile) => profile.id === targetProfileId,
  );
  const target = targets[0];
  if (
    targets.length !== 1 ||
    target?.mode !== "controllable-clone" ||
    typeof target.referenceAudioPath !== "string" ||
    target.referenceAudioPath.trim() === ""
  ) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  const promptAudioPath = target.referenceAudioPath;
  const promptDirectory = dirname(promptAudioPath);
  const promptTextPath = join(
    promptDirectory,
    `${basename(promptAudioPath, extname(promptAudioPath))}.txt`,
  );
  let entries: readonly Dirent[];
  let promptAudioStat: Stats;
  let promptTextStat: Stats;
  try {
    [entries, promptAudioStat, promptTextStat] = await Promise.all([
      readdir(promptDirectory, { withFileTypes: true }),
      lstat(promptAudioPath),
      lstat(promptTextPath),
    ]);
  } catch {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  const transcriptCandidates = entries.filter(
    (entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".txt",
  );
  if (
    transcriptCandidates.length !== 1 ||
    transcriptCandidates[0]?.name !== basename(promptTextPath) ||
    !promptAudioStat.isFile() ||
    promptAudioStat.isSymbolicLink() ||
    !promptTextStat.isFile() ||
    promptTextStat.isSymbolicLink()
  ) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  return { promptAudioPath, promptTextPath };
};

export const migrateVoxcpmPrivateConfigFile = async ({
  configPath,
  targetProfileId,
  confirmAdjacentTranscript = false,
  normalizePromptAudio = ({ sourceBytes }: { readonly sourceBytes: Buffer }) =>
    normalizePromptAudioBytes({ sourceBytes }),
}: {
  readonly configPath: string;
  readonly targetProfileId: string;
  readonly confirmAdjacentTranscript?: boolean;
  readonly normalizePromptAudio?: (input: {
    readonly sourceBytes: Buffer;
  }) => Promise<Buffer>;
}) => {
  const sourceStat = await lstat(configPath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  const sourceBytes = await readFile(configPath);
  const rawConfig = JSON.parse(sourceBytes.toString("utf8"));
  const confirmedTargetInputs = confirmAdjacentTranscript
    ? await discoverConfirmedAdjacentTranscript({ rawConfig, targetProfileId })
    : undefined;
  const migrated = migrateVoxcpmPrivateConfigValue({
    rawConfig,
    targetProfileId,
    ...(confirmedTargetInputs === undefined ? {} : { confirmedTargetInputs }),
  });
  const target = migrated.voiceProfiles.find(
    (profile) => profile.id === targetProfileId,
  );
  if (target?.mode !== "high-fidelity-clone") {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }
  let promptAudio: Buffer;
  let promptText: Buffer;
  try {
    const [promptAudioStat, promptTextStat] = await Promise.all([
      lstat(target.promptAudioPath),
      lstat(target.promptTextPath),
    ]);
    if (
      !promptAudioStat.isFile() ||
      promptAudioStat.isSymbolicLink() ||
      !promptTextStat.isFile() ||
      promptTextStat.isSymbolicLink()
    ) {
      throw new Error("invalid prompt inputs");
    }
    [promptAudio, promptText] = await Promise.all([
      readFile(target.promptAudioPath),
      readFile(target.promptTextPath),
    ]);
    const transcript = promptText.toString("utf8").trim();
    if (transcript === "" || transcript.includes("\u0000")) {
      throw new Error("invalid transcript");
    }
    const canonicalPrompt = await normalizePromptAudio({
      sourceBytes: promptAudio,
    });
    measureCanonicalPcmWav(canonicalPrompt);
  } catch {
    throw new VoxcpmPrivateConfigMigrationBlocker();
  }

  const destinationBytes = `${serializeCanonicalJson(migrated)}\n`;
  const temporaryPath = join(
    dirname(configPath),
    `.${basename(configPath)}.${randomUUID()}.migration`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", sourceStat.mode & 0o777);
    await handle.writeFile(destinationBytes, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    const currentStat = await lstat(configPath);
    const currentBytes = await readFile(configPath);
    if (
      !currentStat.isFile() ||
      currentStat.isSymbolicLink() ||
      currentBytes.length !== sourceBytes.length ||
      !currentBytes.every((byte, index) => byte === sourceBytes[index])
    ) {
      throw new Error("VoxCPM private config changed during migration.");
    }
    await rename(temporaryPath, configPath);
  } finally {
    await handle?.close();
    await unlink(temporaryPath).catch(() => undefined);
  }

  return {
    status: "migrated",
    schemaVersion: 2,
    mode: "high-fidelity-clone",
  } as const;
};
