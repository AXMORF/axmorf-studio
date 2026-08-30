import { filmBurn, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide, type SlideDirection } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";

export type ProducerTransitionPresetId =
  | "editorial-fade"
  | "directional-slide"
  | "signal-wipe"
  | "cinematic-film-burn";

type ProducerTransitionPresetBaseOptions = {
  readonly durationInFrames: number;
};

export type ProducerTransitionPresetOptions =
  | (ProducerTransitionPresetBaseOptions & {
      readonly id: "editorial-fade";
      readonly direction?: never;
    })
  | (ProducerTransitionPresetBaseOptions & {
      readonly id: "directional-slide";
      readonly direction?: SlideDirection;
    })
  | (ProducerTransitionPresetBaseOptions & {
      readonly id: "signal-wipe";
      readonly direction?: never;
    })
  | (ProducerTransitionPresetBaseOptions & {
      readonly id: "cinematic-film-burn";
      readonly direction?: never;
    });

export const producerTransitionPresets = [
  {
    id: "editorial-fade",
    label: "Editorial fade",
    useWhen: "Restrained editorial scene changes",
  },
  {
    id: "directional-slide",
    label: "Directional slide",
    useWhen: "Spatial progression with an explicit direction",
  },
  {
    id: "signal-wipe",
    label: "Signal wipe",
    useWhen: "System-state or signal handoffs",
  },
  {
    id: "cinematic-film-burn",
    label: "Cinematic film burn",
    useWhen: "A deliberate high-energy cinematic chapter break",
  },
] as const satisfies readonly {
  readonly id: ProducerTransitionPresetId;
  readonly label: string;
  readonly useWhen: string;
}[];

const requirePositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
};

const requireSupportedDirection = (
  id: ProducerTransitionPresetId,
  direction: SlideDirection | undefined,
): void => {
  if (id !== "directional-slide" && direction !== undefined) {
    throw new Error("direction is supported only by directional-slide");
  }
};

type ProducerTransitionTiming = ReturnType<typeof linearTiming>;
type ProducerTransitionPresetResult =
  | { readonly presentation: ReturnType<typeof fade>; readonly timing: ProducerTransitionTiming }
  | { readonly presentation: ReturnType<typeof slide>; readonly timing: ProducerTransitionTiming }
  | { readonly presentation: ReturnType<typeof wipe>; readonly timing: ProducerTransitionTiming }
  | {
      readonly presentation: ReturnType<typeof filmBurn>;
      readonly timing: ProducerTransitionTiming;
    };

export function getProducerTransitionPreset(
  options: Extract<ProducerTransitionPresetOptions, { readonly id: "editorial-fade" }>,
): { readonly presentation: ReturnType<typeof fade>; readonly timing: ProducerTransitionTiming };
export function getProducerTransitionPreset(
  options: Extract<ProducerTransitionPresetOptions, { readonly id: "directional-slide" }>,
): { readonly presentation: ReturnType<typeof slide>; readonly timing: ProducerTransitionTiming };
export function getProducerTransitionPreset(
  options: Extract<ProducerTransitionPresetOptions, { readonly id: "signal-wipe" }>,
): { readonly presentation: ReturnType<typeof wipe>; readonly timing: ProducerTransitionTiming };
export function getProducerTransitionPreset(
  options: Extract<ProducerTransitionPresetOptions, { readonly id: "cinematic-film-burn" }>,
): {
  readonly presentation: ReturnType<typeof filmBurn>;
  readonly timing: ProducerTransitionTiming;
};
export function getProducerTransitionPreset(
  options: ProducerTransitionPresetOptions,
): ProducerTransitionPresetResult;
export function getProducerTransitionPreset({
  id,
  durationInFrames,
  direction,
}: ProducerTransitionPresetOptions): ProducerTransitionPresetResult {
  requirePositiveInteger(durationInFrames, "durationInFrames");

  requireSupportedDirection(id, direction);

  const timing = linearTiming({ durationInFrames });

  if (id === "editorial-fade") {
    return { presentation: fade(), timing };
  }

  if (id === "directional-slide") {
    return { presentation: slide({ direction: direction ?? "from-right" }), timing };
  }

  if (id === "signal-wipe") {
    return { presentation: wipe({ direction: "from-left" }), timing };
  }

  return { presentation: filmBurn({ seed: 6 }), timing };
}
