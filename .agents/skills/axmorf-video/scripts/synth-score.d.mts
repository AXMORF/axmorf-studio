// Types for tools that import this score engine; Agents run the .mjs directly.
export declare const generateScore: (recipe: Record<string, unknown>) => {
  timeline: Record<string, unknown> & { durationInFrames: number };
  audio: Buffer;
};
export declare const makeTimeline: (
  recipe: Record<string, unknown>,
) => Record<string, unknown>;
/** Loudness-masters a score WAV using a scratch directory (needs ffmpeg). */
export declare const master: (raw: Buffer, directory: string) => Buffer;
