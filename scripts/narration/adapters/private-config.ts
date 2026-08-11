import { createHash } from "node:crypto";
import {
  access as accessFromDisk,
  readFile as readFileFromDisk,
} from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

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
import { normalizePromptAudio as normalizePromptAudioBytes } from "./prompt-audio-normalizer";
import { measureCanonicalPcmWav } from "../domain/pcm-wav";

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

const ControllableCloneProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    mode: z.literal("controllable-clone"),
    referenceAudioPath: z.string().trim().min(1),
    controlInstruction: z.string().trim().min(1),
  })
  .strict()
  .readonly();

const HighFidelityCloneProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    mode: z.literal("high-fidelity-clone"),
    promptAudioPath: z.string().trim().min(1),
    promptTextPath: z.string().trim().min(1),
    promptTranscriptConfirmed: z.literal(true),
  })
  .strict()
  .readonly();

const VoxcpmVoiceProfileSchema = z.discriminatedUnion("mode", [
  ControllableCloneProfileSchema,
  HighFidelityCloneProfileSchema,
]);

export const VoxcpmPrivateConfigSchema = z
  .object({
    schemaVersion: z.literal(2),
    baseUrl: HttpUrlSchema,
    token: z.string().trim().min(1).optional(),
    timeoutMs: z.number().int().positive().safe(),
    modelId: z.string().trim().min(1),
    endpointPath: z.literal("/clone"),
    parameters: z
      .object({
        cfgValue: z.number().finite().min(1).max(3),
        inferenceTimesteps: z.number().int().min(4).max(30),
        minLen: z.number().int().min(1).max(8192),
        maxLen: z.number().int().min(2).max(8192),
        normalize: z.boolean(),
        denoise: z.boolean(),
        retryBadcase: z.boolean(),
        retryBadcaseMaxTimes: z.number().int().min(0).max(10),
        retryBadcaseRatioThreshold: z.number().finite().positive(),
      })
      .strict()
      .superRefine((parameters, context) => {
        if (parameters.minLen > parameters.maxLen) {
          context.addIssue({
            code: "custom",
            message: "minLen must not exceed maxLen.",
            path: ["minLen"],
          });
        }
      })
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

export type VoxcpmProfileMetadata = Readonly<{
  baseUrl: string;
  token?: string;
  timeoutMs: number;
  mode: "controllable-clone" | "high-fidelity-clone";
  denoise: boolean;
  profileMatched: true;
}>;

const isInside = (parent: string, candidate: string) => {
  const path = relative(resolve(parent), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

export const resolveVoxcpmProfileMetadata = async ({
  config: rawConfig,
  narration,
  rootDir,
  access = accessFromDisk,
}: {
  readonly config: unknown;
  readonly narration: NarrationSpec;
  readonly rootDir: string;
  readonly access?: (path: string) => Promise<unknown>;
}): Promise<VoxcpmProfileMetadata> => {
  const config = VoxcpmPrivateConfigSchema.parse(rawConfig);
  const matches = config.voiceProfiles.filter(
    ({ id }) => id === narration.voiceProfileId,
  );
  if (matches.length !== 1) {
    throw new Error("The selected VoxCPM profile is unavailable.");
  }
  const profile = matches[0];
  const paths =
    profile.mode === "controllable-clone"
      ? [profile.referenceAudioPath]
      : [profile.promptAudioPath, profile.promptTextPath];
  if (paths.some((path) => !isAbsolute(path))) {
    throw new Error("VoxCPM profile metadata contains an invalid source path.");
  }
  const protectedRoot = resolve(rootDir, "public/voice_profile");
  if (paths.some((path) => isInside(protectedRoot, path))) {
    throw new Error("The selected VoxCPM profile uses a protected source.");
  }
  try {
    for (const path of paths) await access(path);
  } catch (error) {
    throw new Error("The selected VoxCPM profile source is unavailable.", {
      cause: error,
    });
  }
  return {
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    ...(config.token === undefined ? {} : { token: config.token }),
    timeoutMs: config.timeoutMs,
    mode: profile.mode,
    denoise: config.parameters.denoise,
    profileMatched: true,
  };
};

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
  speechRate = 1,
  readFile = readFileFromDisk,
  normalizePromptAudio = ({ sourceBytes }: { readonly sourceBytes: Buffer }) =>
    normalizePromptAudioBytes({ sourceBytes }),
}: {
  readonly config: unknown;
  readonly narration: NarrationSpec;
  readonly speechRate?: number;
  readonly readFile?: BinaryFileReader;
  readonly normalizePromptAudio?: (input: {
    readonly sourceBytes: Buffer;
  }) => Promise<Buffer>;
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
  const checksum = (bytes: Buffer) =>
    Sha256DigestSchema.parse(
      `sha256:${createHash("sha256")
        .update(Uint8Array.from(bytes))
        .digest("hex")}`,
    );

  if (profile.mode === "high-fidelity-clone") {
    if (
      !isAbsolute(profile.promptAudioPath) ||
      ![".m4a", ".wav"].includes(
        extname(profile.promptAudioPath).toLowerCase(),
      ) ||
      !isAbsolute(profile.promptTextPath) ||
      extname(profile.promptTextPath).toLowerCase() !== ".txt"
    ) {
      throw new Error(
        "VoxCPM high-fidelity prompt inputs must be absolute M4A/WAV and TXT paths.",
      );
    }
    let promptSourceBytes: Buffer;
    let promptTextBytes: Buffer;
    try {
      [promptSourceBytes, promptTextBytes] = await Promise.all([
        readFile(profile.promptAudioPath),
        readFile(profile.promptTextPath),
      ]);
    } catch (error) {
      throw new Error("VoxCPM high-fidelity prompt inputs are not readable.", {
        cause: error,
      });
    }
    if (promptSourceBytes.length === 0 || promptTextBytes.length === 0) {
      throw new Error("VoxCPM high-fidelity prompt inputs must not be empty.");
    }
    const promptText = promptTextBytes.toString("utf8").trim();
    if (promptText.length === 0 || promptText.includes("\u0000")) {
      throw new Error("VoxCPM high-fidelity prompt transcript is invalid.");
    }
    const promptAudioBytes = await normalizePromptAudio({
      sourceBytes: promptSourceBytes,
    });
    measureCanonicalPcmWav(promptAudioBytes);
    const promptAudioChecksum = checksum(promptAudioBytes);
    const safeDescriptor: SafeVoxcpmExecutionDescriptor = {
      adapterId: "voxcpm-high-fidelity-clone-http-v2",
      modelId: parsed.modelId,
      mode: profile.mode,
      cfgValue: parsed.parameters.cfgValue,
      inferenceTimesteps: parsed.parameters.inferenceTimesteps,
      minLen: parsed.parameters.minLen,
      maxLen: parsed.parameters.maxLen,
      normalize: parsed.parameters.normalize,
      denoise: parsed.parameters.denoise,
      retryBadcase: parsed.parameters.retryBadcase,
      retryBadcaseMaxTimes: parsed.parameters.retryBadcaseMaxTimes,
      retryBadcaseRatioThreshold: parsed.parameters.retryBadcaseRatioThreshold,
      voiceProfileId: profile.id,
      speechRate,
      promptSourceChecksum: checksum(promptSourceBytes),
      promptTextChecksum: checksum(promptTextBytes),
      promptAudioChecksum,
      referenceAudioChecksum: promptAudioChecksum,
    };
    return {
      baseUrl: parsed.baseUrl.replace(/\/+$/, ""),
      endpointPath: "/clone_with_prompt",
      ...(parsed.token === undefined ? {} : { token: parsed.token }),
      timeoutMs: parsed.timeoutMs,
      referenceAudioBytes: promptAudioBytes,
      promptAudioBytes,
      promptText,
      parameters: parsed.parameters,
      safeDescriptor,
    };
  }

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
    throw new Error("VoxCPM reference audio is not readable.", {
      cause: error,
    });
  }
  if (referenceAudioBytes.length === 0) {
    throw new Error("VoxCPM reference audio must not be empty.");
  }
  const referenceAudioChecksum = checksum(referenceAudioBytes);
  const safeDescriptor: SafeVoxcpmExecutionDescriptor = {
    adapterId: "voxcpm-controllable-clone-http-v2",
    modelId: parsed.modelId,
    mode: profile.mode,
    cfgValue: parsed.parameters.cfgValue,
    inferenceTimesteps: parsed.parameters.inferenceTimesteps,
    minLen: parsed.parameters.minLen,
    maxLen: parsed.parameters.maxLen,
    normalize: parsed.parameters.normalize,
    denoise: parsed.parameters.denoise,
    retryBadcase: parsed.parameters.retryBadcase,
    retryBadcaseMaxTimes: parsed.parameters.retryBadcaseMaxTimes,
    retryBadcaseRatioThreshold: parsed.parameters.retryBadcaseRatioThreshold,
    voiceProfileId: profile.id,
    speechRate,
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
