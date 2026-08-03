import type {
  ChunkAudioGenerator,
  ResolvedVoxcpmProfile,
} from "../domain/provider-input";

const WAV_CONTENT_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave"]);

const getMediaType = (contentType: string): string => {
  const parameterStart = contentType.indexOf(";");
  return (
    parameterStart === -1 ? contentType : contentType.slice(0, parameterStart)
  )
    .trim()
    .toLowerCase();
};

export const createVoxcpmChunkGenerator = ({
  resolved,
  fetchImpl = fetch,
}: {
  readonly resolved: ResolvedVoxcpmProfile;
  readonly fetchImpl?: typeof fetch;
}): ChunkAudioGenerator => {
  if (
    resolved.safeDescriptor.mode !== "controllable-clone" &&
    resolved.safeDescriptor.mode !== "high-fidelity-clone"
  ) {
    throw new Error("Unsupported VoxCPM mode for the M2 narration adapter.");
  }

  return async (request) => {
    const form = new FormData();
    form.set("text", request.ttsText);
    if (resolved.safeDescriptor.mode === "controllable-clone") {
      if (resolved.controlInstruction === undefined) {
        throw new Error("Controllable clone instruction is missing.");
      }
      form.set("control", resolved.controlInstruction);
    } else {
      if (
        resolved.promptText === undefined ||
        resolved.promptAudioBytes === undefined
      ) {
        throw new Error("High-fidelity clone prompt inputs are missing.");
      }
      form.set("prompt_text", resolved.promptText);
      form.set(
        "prompt_audio",
        new Blob([Uint8Array.from(resolved.promptAudioBytes)], {
          type: "audio/wav",
        }),
        "prompt.wav",
      );
    }
    form.set("cfg_value", String(resolved.parameters.cfgValue));
    form.set(
      "inference_timesteps",
      String(resolved.parameters.inferenceTimesteps),
    );
    form.set("normalize", String(resolved.parameters.normalize));
    form.set("denoise", String(resolved.parameters.denoise));
    if (resolved.safeDescriptor.mode === "controllable-clone") {
      form.set("retry_badcase", String(resolved.parameters.retryBadcase));
      form.set("save", "false");
    }
    form.set(
      "reference_audio",
      new Blob([Uint8Array.from(resolved.referenceAudioBytes)], {
        type: "audio/wav",
      }),
      "reference.wav",
    );

    const headers = new Headers();
    if (resolved.token !== undefined) {
      headers.set("authorization", `Bearer ${resolved.token}`);
    }

    let response: Response;
    try {
      response = await fetchImpl(
        `${resolved.baseUrl}${resolved.endpointPath}`,
        {
          method: "POST",
          headers,
          body: form,
          signal: AbortSignal.timeout(resolved.timeoutMs),
        },
      );
    } catch (error) {
      throw new Error(`VoxCPM request failed for chunk ${request.chunkId}.`, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(
        `VoxCPM request failed with HTTP status ${response.status} for chunk ${request.chunkId}.`,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!WAV_CONTENT_TYPES.has(getMediaType(contentType))) {
      throw new Error(
        `VoxCPM returned an unsupported content type for chunk ${request.chunkId}.`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error(
        `VoxCPM returned empty audio for chunk ${request.chunkId}.`,
      );
    }
    return bytes;
  };
};
