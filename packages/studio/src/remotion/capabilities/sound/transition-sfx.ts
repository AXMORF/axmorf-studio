import type { FilmSceneTransitionKind } from "../../film/scene-track";

import type { ProducerTransitionPresetId } from "../transitions";

export type ProducerTransitionSfxRole =
  | "soft-whoosh"
  | "directional-whoosh"
  | "signal-sweep"
  | "impact-bloom";

export type ProducerSceneTransitionSfxRole =
  | ProducerTransitionSfxRole
  | "whip"
  | "shimmer"
  | "low-impact";

export function getProducerTransitionSfxRole(
  id: ProducerTransitionPresetId,
): ProducerTransitionSfxRole;
export function getProducerTransitionSfxRole(
  id: FilmSceneTransitionKind,
): ProducerSceneTransitionSfxRole;
export function getProducerTransitionSfxRole(
  id: ProducerTransitionPresetId | FilmSceneTransitionKind,
): ProducerSceneTransitionSfxRole {
  if (id === "editorial-fade") return "soft-whoosh";
  if (id === "directional-slide") return "directional-whoosh";
  if (id === "signal-wipe") return "signal-sweep";
  if (id === "cinematic-film-burn") return "impact-bloom";
  if (id === "fade") return "soft-whoosh";
  if (id === "slide" || id === "wipe" || id === "mask-wipe")
    return "directional-whoosh";
  if (id === "iris" || id === "light-leak") return "shimmer";
  if (id === "flash" || id === "match-scale") return "low-impact";
  if (
    id === "zoom-blur" ||
    id === "linear-blur" ||
    id === "cross-zoom" ||
    id === "whip-blur"
  )
    return "whip";
  throw new Error(
    `Unknown Producer transition for SFX mapping: ${String(id)}.`,
  );
}
