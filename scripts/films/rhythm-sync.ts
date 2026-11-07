import type { z } from "zod";
import type {
  FilmMotionWarningSchema,
  FilmMusic,
  FilmReviewMotionEvent,
} from "@axmorf/studio/contracts";

type Warning = z.infer<typeof FilmMotionWarningSchema>;
export type RhythmSyncMusic = Pick<FilmMusic, "beatFrames" | "accentFrames"> &
  Partial<Pick<FilmMusic, "barFrames" | "sectionFrames" | "onsets">>;
// Review tolerates ±2 frames for diagnostics only. Direction still requires exact L3 landings.
export const RHYTHM_SYNC_TOLERANCE_FRAMES = 2;
// Half-open bars need at least one actual L2+ change, in speech and beat-only passages alike.
export const RHYTHM_MIN_CHANGES_PER_BAR = 1;

/** Only exact logged events are compared; sampled pixel differences cannot resolve frame sync. */
export const analyzeRhythmSync = ({
  events,
  complete,
  music,
  durationInFrames,
  legacyAudio,
}: {
  readonly events: readonly FilmReviewMotionEvent[];
  readonly complete: boolean;
  readonly music: RhythmSyncMusic | null;
  readonly durationInFrames: number;
  readonly legacyAudio: boolean;
}) => {
  const motionWarnings: Warning[] = [];
  const unknown: { rule: Warning["rule"]; reason: string }[] = [];
  const rules = [
    "accent-without-visual",
    "visual-without-sound",
    "sound-without-visual",
    "bar-without-change",
  ] as const;
  const summary: {
    accents: { total: number; matched: number } | null;
    landings: { total: number; matched: number } | null;
    sounds: { total: number; matched: number } | null;
    bars: { total: number; matched: number } | null;
  } = { accents: null, landings: null, sounds: null, bars: null };
  const unique = (frames: readonly number[]) =>
    [...new Set(frames)]
      .filter((f) => f >= 0 && f < durationInFrames)
      .sort((a, b) => a - b);
  const near = (frame: number, candidates: readonly number[]) =>
    candidates.some((f) => Math.abs(frame - f) <= RHYTHM_SYNC_TOLERANCE_FRAMES);
  const warn = (
    rule: Warning["rule"],
    from: number,
    to: number,
    message: string,
  ) => motionWarnings.push({ rule, frames: [from, to], message });
  const tracks = events.filter((e) => e.type === "scene-track");
  const recipes = events.filter((e) => e.type === "recipe");
  const rhythm = events.filter((e) => e.type === "rhythm");
  const hasVisual =
    (tracks.length === 1 && tracks[0].scenes.length > 0) ||
    recipes.length > 0 ||
    rhythm.some((e) => e.kind === "impact" || e.kind === "bar-camera");
  if (!music || !complete || !hasVisual || tracks.length > 1) {
    const reason = !music
      ? "Requires music event grids."
      : !complete
        ? "Motion telemetry is missing or truncated."
        : tracks.length > 1
          ? "Multiple scene tracks make the visual timeline ambiguous."
          : "Requires exact visual event telemetry; legacy transforms remain unknown.";
    for (const rule of rules) unknown.push({ rule, reason });
    return { motionWarnings, unknown, summary };
  }
  const scenes = tracks.flatMap((e) => e.scenes);
  const transitions = scenes.flatMap((s) =>
    s.enter ? [s.enter.startFrame, s.enter.endFrame] : [],
  );
  const impacts = rhythm.flatMap((e) => (e.kind === "impact" ? e.frames : []));
  const landings = unique([...impacts, ...recipes.map((r) => r.land)]);
  const bigVisuals = unique([
    ...landings,
    ...scenes.map((s) => s.boundaryFrame),
    ...transitions,
  ]);
  const changes = unique([
    ...bigVisuals,
    ...recipes.map((r) => r.move),
    ...rhythm.flatMap((e) => (e.kind === "bar-camera" ? e.frames : [])),
  ]);
  const allVisuals = unique([
    ...changes,
    ...recipes.map((r) => r.anticipate),
    ...rhythm.flatMap((e) => (e.kind === "pulse" ? e.frames : [])),
  ]);
  const accents = unique([
    ...music.accentFrames,
    ...(music.sectionFrames ?? []),
    ...(music.onsets?.hits ?? []),
    ...(music.onsets?.sections ?? []),
  ]);
  summary.accents = {
    total: accents.length,
    matched: accents.filter((f) => near(f, bigVisuals)).length,
  };
  for (const frame of accents)
    if (!near(frame, bigVisuals))
      warn(
        "accent-without-visual",
        frame,
        frame + 1,
        `Music accent/hit/section at f${frame} has no impact, recipe landing, scene boundary or transition within ±${RHYTHM_SYNC_TOLERANCE_FRAMES} frames; inspect L3.`,
      );

  const audio = events.filter((e) => e.type === "sound-effects");
  if (!audio.length || legacyAudio) {
    const reason = legacyAudio
      ? "Hand-authored audio may supply unlogged sound effects."
      : "Sound-effect telemetry is unavailable.";
    for (const rule of [
      "visual-without-sound",
      "sound-without-visual",
    ] as const)
      unknown.push({ rule, reason });
  } else {
    // Legacy records only know starts; do not guess a center/end anchor from duration.
    const cues = unique(
      audio.flatMap((e) => e.cues.map((c) => c.alignmentFrame ?? c.frame)),
    );
    summary.landings = {
      total: landings.length,
      matched: landings.filter((f) => near(f, cues)).length,
    };
    summary.sounds = {
      total: cues.length,
      matched: cues.filter((f) => near(f, allVisuals)).length,
    };
    for (const frame of landings)
      if (!near(frame, cues))
        warn(
          "visual-without-sound",
          frame,
          frame + 1,
          `Impact/recipe landing at f${frame} has no sound-effect cue within ±${RHYTHM_SYNC_TOLERANCE_FRAMES} frames; add sound or explain the silence.`,
        );
    for (const frame of cues)
      if (!near(frame, allVisuals))
        warn(
          "sound-without-visual",
          frame,
          frame + 1,
          `Sound-effect cue at f${frame} has no logged visual event within ±${RHYTHM_SYNC_TOLERANCE_FRAMES} frames; inspect its visible action.`,
        );
  }
  if (!music.barFrames?.length)
    unknown.push({
      rule: "bar-without-change",
      reason: "Music bar grid is unavailable.",
    });
  else {
    const bars = unique(music.barFrames);
    let matched = 0;
    bars.forEach((from, i) => {
      const to = bars[i + 1] ?? durationInFrames;
      const count = changes.filter((f) => f >= from && f < to).length;
      if (count >= RHYTHM_MIN_CHANGES_PER_BAR) matched++;
      else
        warn(
          "bar-without-change",
          from,
          to,
          `Bar [${from},${to}) has no L2+ visual event during narration or a beat-only passage; inspect composition changes.`,
        );
    });
    summary.bars = { total: bars.length, matched };
  }
  return { motionWarnings, unknown, summary };
};
