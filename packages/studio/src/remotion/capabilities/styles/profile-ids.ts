export const producerStyleProfileIds = [
  "editorial-tech",
  "comic-anime",
  "cinematic-3d",
  "retro-terminal",
  "documentary-media",
  "hand-drawn-explainer",
] as const;

export type ProducerStyleProfileId = (typeof producerStyleProfileIds)[number];

export const isProducerStyleProfileId = (value: string): value is ProducerStyleProfileId =>
  (producerStyleProfileIds as readonly string[]).includes(value);
