import type { ProducerTransitionPresetId } from "../transitions";

export type ProducerTransitionSfxRole =
  | "soft-whoosh"
  | "directional-whoosh"
  | "signal-sweep"
  | "impact-bloom";

export const getProducerTransitionSfxRole = (
  id: ProducerTransitionPresetId,
): ProducerTransitionSfxRole => {
  if (id === "editorial-fade") return "soft-whoosh";
  if (id === "directional-slide") return "directional-whoosh";
  if (id === "signal-wipe") return "signal-sweep";
  if (id === "cinematic-film-burn") return "impact-bloom";
  throw new Error(`Unknown Producer transition for SFX mapping: ${String(id)}.`);
};
