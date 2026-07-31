import { checkerboard } from "@remotion/effects/checkerboard";
import { halftone } from "@remotion/effects/halftone";
import { paper } from "@remotion/effects/paper";
import { pixelate } from "@remotion/effects/pixelate";
import { roughenEdges } from "@remotion/effects/roughen-edges";
import { scanlines } from "@remotion/effects/scanlines";
import { interpolate, type EffectDescriptor } from "remotion";

export type ProducerEffectPresetId = "comic-print" | "cyber-scan" | "paper-grain" | "pixel-grid";

export const producerEffectPresets = [
  {
    id: "comic-print",
    label: "Comic print",
    useWhen: "Printed panels and editorial emphasis",
  },
  {
    id: "cyber-scan",
    label: "Cyber scan",
    useWhen: "Terminal, signal, and system-state beats",
  },
  {
    id: "paper-grain",
    label: "Paper grain",
    useWhen: "Document and hand-drawn explainer beats",
  },
  {
    id: "pixel-grid",
    label: "Pixel grid",
    useWhen: "Digital abstraction and state-change beats",
  },
] as const satisfies readonly {
  readonly id: ProducerEffectPresetId;
  readonly label: string;
  readonly useWhen: string;
}[];

export const getProducerEffectPreset = ({
  id,
  frame,
}: {
  readonly id: ProducerEffectPresetId;
  readonly frame: number;
}): EffectDescriptor<unknown>[] => {
  if (!Number.isFinite(frame)) throw new Error("frame must be finite");

  if (id === "comic-print") {
    return [
      checkerboard({ colors: ["#ffe6a7", "#ef476f"], cellSize: 42, angle: -8 }),
      halftone({ colorMode: "source", dotSize: 12, dotSpacing: 16, rotation: 8 }),
      roughenEdges({ amount: 0.42, border: 18, scale: 0.09, seed: 231.2 }),
    ];
  }

  if (id === "cyber-scan") {
    return [
      checkerboard({ colors: ["#061826", "#00d9ff"], cellSize: 32, angle: 3 }),
      scanlines({
        amount: 0.34,
        spacing: 5,
        thickness: 2,
        offset: interpolate(frame, [0, 180], [0, 90], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }),
    ];
  }

  if (id === "paper-grain") {
    return [
      checkerboard({ colors: ["#f5eddc", "#d8c5a4"], cellSize: 76, angle: 2 }),
      paper({
        amount: 0.72,
        colorFront: "#f7f0df",
        colorBack: "#b79d78",
        contrast: 0.32,
        roughness: 0.46,
        fiber: 0.4,
        seed: 17,
        scale: 0.58,
      }),
    ];
  }

  return [
    checkerboard({
      colors: ["#382c6e", "#f72585", "#4cc9f0"],
      cellSize: 26,
      angle: 12,
    }),
    pixelate({
      blockSize: interpolate(frame, [0, 60], [28, 8], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    }),
  ];
};

export const getProducerMediaEffectPreset = ({
  id,
  frame,
}: {
  readonly id: ProducerEffectPresetId;
  readonly frame: number;
}): EffectDescriptor<unknown>[] => {
  if (!Number.isFinite(frame)) throw new Error("frame must be finite");

  if (id === "comic-print") {
    return [
      halftone({ colorMode: "source", dotSize: 2, dotSpacing: 6, rotation: 6 }),
      roughenEdges({ amount: 0.1, border: 6, scale: 0.05, seed: 231.2 }),
    ];
  }

  if (id === "cyber-scan") {
    return [
      scanlines({
        amount: 0.2,
        spacing: 8,
        thickness: 2,
        offset: interpolate(frame, [0, 180], [0, 48], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }),
    ];
  }

  if (id === "paper-grain") {
    return [
      paper({
        amount: 0.28,
        colorFront: "#f7f0df",
        colorBack: "#b79d78",
        contrast: 0.12,
        roughness: 0.2,
        fiber: 0.16,
        seed: 17,
        scale: 0.7,
      }),
    ];
  }

  return [
    pixelate({
      blockSize: interpolate(frame, [0, 60], [6, 3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    }),
  ];
};
