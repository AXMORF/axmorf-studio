import { random } from "remotion";
import { lastAtOrBefore } from "./resolve";

/** Deterministic shuffled cycle: adjacent bars differ, including cycle seams.
 * Empty input has no response. One distinct response cannot satisfy rotation. */
export const pickRhythmResponse = <T extends string>(
  barIndex: number,
  responses: readonly T[],
  { seed = "rhythm-response" }: { readonly seed?: string | number } = {},
): T | null => {
  if (!Number.isInteger(barIndex) || barIndex < 0)
    throw new Error("barIndex must be a nonnegative integer.");
  const choices = [...new Set(responses)];
  if (choices.length === 0) return null;
  if (choices.length === 1)
    throw new Error("Rhythm rotation needs at least two distinct responses.");
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random(`${seed}:${i}`) * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices[barIndex % choices.length];
};

export type BoilSeedOptions = Readonly<{
  fps?: number;
  stepFrames?: number;
  /** Sorted absolute beat frames. An explicitly empty grid stays still. */
  beats?: readonly number[];
}>;
/** Pure drawing index, never random global state. At 30fps the default is 3 frames.
 * Pass fps for other frame rates; useBoilSeed reads it from the composition. */
export const resolveBoilSeed = (
  frame: number,
  {
    fps = 30,
    stepFrames = Math.max(1, Math.round(fps / 12)),
    beats,
  }: BoilSeedOptions = {},
) => {
  if (
    !Number.isFinite(frame) ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    !Number.isInteger(stepFrames) ||
    stepFrames < 1
  )
    throw new Error(
      "Boil frame/fps must be finite and stepFrames a positive integer.",
    );
  if (beats !== undefined) {
    if (
      beats.some(
        (beat, i) =>
          !Number.isInteger(beat) || beat < 0 || (i > 0 && beat < beats[i - 1]),
      )
    )
      throw new Error("Boil beats must be sorted nonnegative integer frames.");
    // Use the beat frame itself as seed: duplicate beats do not add a drawing.
    const beat = lastAtOrBefore(frame, beats);
    return Number.isFinite(beat) ? beat + 1 : 0;
  }
  return Math.max(0, Math.floor(frame / stepFrames));
};
