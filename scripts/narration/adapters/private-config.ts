import { createHash } from "node:crypto";
import { readFile as readFileFromDisk } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";

import { z } from "zod";

import type { NarrationSpec } from "../../../src/contracts/narration";
import {
  VoiceProfileIdSchema,
  Sha256DigestSchema,
} from "../../../src/contracts/primitives";
import type {
  ResolvedVoxcpmProfile,
  SafeVoxcpmExecutionDescriptor,
} from "../domain/provider-input";

type BinaryFileReader = (path: string) => Promise<Buffer>;

const HttpUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "baseUrl must be a valid HTTP URL." },
);

const VoxcpmVoiceProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    mode: z.literal("controllable-clone"),
    referenceAudioPath: z.string().trim().min(1),
    controlInstruction: z.string().trim().min(1),
  })
  .strict()
  .readonly();

export const VoxcpmPrivateConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    baseUrl: HttpUrlSchema,
    token: z.string().trim().min(1).optional(),
    timeoutMs: z.number().int().positive().safe(),
    modelId: z.string().trim().min(1),
    endpointPath: z.literal("/clone"),
    parameters: z
      .object({
        cfgValue: z.number().positive().finite(),
        inferenceTimesteps: z.number().int().positive().safe(),
        normalize: z.boolean(),
        denoise: z.boolean(),
        retryBadcase: z.boolean(),
      })
      .strict()
      .readonly(),
    voiceProfiles: z.array(VoxcpmVoiceProfileSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((config, context) => {
    const profileIds = new Set<string>();
    config.voiceProfiles.forEach((profile, index) => {
      if (profileIds.has(profile.id)) {
        context.addIssue({
          code: "custom",
          message: "VoxCPM voice profile IDs must be unique.",
          path: ["voiceProfiles", index, "id"],
        });
      }
      profileIds.add(profile.id);
    });
  })
  .readonly();

export type VoxcpmPrivateConfig = z.infer<typeof VoxcpmPrivateConfigSchema>;

export const readVoxcpmPrivateConfig = async ({
  configPath,
  readFile = readFileFromDisk,
}: {
  readonly configPath: string;
  readonly readFile?: BinaryFileReader;
}): Promise<VoxcpmPrivateConfig> => {
  if (!isAbsolute(configPath)) {
    throw new Error("VoxCPM private config path must be absolute.");
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(configPath);
  } catch (error) {
    throw new Error("VoxCPM private config is not readable.", { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error("VoxCPM private config must contain valid JSON.", {
      cause: error,
    });
  }
  return VoxcpmPrivateConfigSchema.parse(value);
};

export const resolveVoxcpmProfile = async ({
  config,
  narration,
  readFile = readFileFromDisk,
}: {
  readonly config: unknown;
  readonly narration: NarrationSpec;
  readonly readFile?: BinaryFileReader;
}): Promise<ResolvedVoxcpmProfile> => {
  const parsed = VoxcpmPrivateConfigSchema.parse(config);
  const matches = parsed.voiceProfiles.filter(
    (profile) => profile.id === narration.voiceProfileId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Unknown voice profile: ${narration.voiceProfileId}. Exactly one private profile is required.`,
    );
  }
  const profile = matches[0];
  if (
    !isAbsolute(profile.referenceAudioPath) ||
    extname(profile.referenceAudioPath).toLowerCase() !== ".wav"
  ) {
    throw new Error("VoxCPM reference audio must be an absolute WAV path.");
  }

  let referenceAudioBytes: Buffer;
  try {
    referenceAudioBytes = await readFile(profile.referenceAudioPath);
  } catch (error) {
    throw new Error("VoxCPM reference audio is not readable.", { cause: error });
  }
  if (referenceAudioBytes.length === 0) {
    throw new Error("VoxCPM reference audio must not be empty.");
  }
  const referenceAudioChecksum = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(referenceAudioBytes))
      .digest("hex")}`,
  );
  const safeDescriptor: SafeVoxcpmExecutionDescriptor = {
    adapterId: "voxcpm-controllable-clone-http-v1",
    modelId: parsed.modelId,
    mode: profile.mode,
    cfgValue: parsed.parameters.cfgValue,
    inferenceTimesteps: parsed.parameters.inferenceTimesteps,
    normalize: parsed.parameters.normalize,
    denoise: parsed.parameters.denoise,
    retryBadcase: parsed.parameters.retryBadcase,
    voiceProfileId: profile.id,
    referenceAudioChecksum,
    controlInstruction: profile.controlInstruction,
  };

  return {
    baseUrl: parsed.baseUrl.replace(/\/+$/, ""),
    endpointPath: parsed.endpointPath,
    ...(parsed.token === undefined ? {} : { token: parsed.token }),
    timeoutMs: parsed.timeoutMs,
    referenceAudioBytes,
    controlInstruction: profile.controlInstruction,
    parameters: parsed.parameters,
    safeDescriptor,
  };
};
