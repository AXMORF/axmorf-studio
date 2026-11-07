import { STUDIO_INSTRUMENTS } from "./studio-score.mjs";

// Shared by BPM feasibility and film:music's anchor-miss warnings.
export const SCORE_ANCHOR_TOLERANCE_FRAMES = 3;

const fields = (value, allowed, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new Error(`Unknown ${label} field: ${key}`);
};
const frame = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`Invalid ${label}: use a nonnegative frame`);
  return value;
};
const unique = (frames) => [...new Set(frames)].sort((a, b) => a - b);
export const usesStoryboardScore = (recipe) =>
  recipe &&
  (["bpmRange", "hits", "breaks", "ending", "durationInFrames"].some(
    (key) => recipe[key] !== undefined,
  ) ||
    recipe.arrangement?.sections?.some(
      (section) => section?.from !== undefined,
    ));

/** Prefer feasible tempos near bpm/midpoint; otherwise minimize bar-normalized residuals. */
export const alignStoryboardSections = ({
  sections,
  fps,
  beatsPerBar,
  bpm,
  bpmRange,
  bars,
  durationInFrames,
}) => {
  const range = bpmRange ?? [bpm, bpm];
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    range.some((n) => !Number.isFinite(n) || n < 50 || n > 180) ||
    range[0] > range[1]
  )
    throw new Error("Invalid score bpmRange: use [min, max] within 50–180");
  const midpoint = (range[0] + range[1]) / 2;
  const preferredBpm = bpm ?? midpoint;
  const hasAnchors = sections.some((section) => section.from !== undefined);
  const candidates = new Set([range[0], range[1], midpoint]);
  for (
    let value = Math.ceil(range[0] * 100);
    value <= Math.floor(range[1] * 100);
    value++
  )
    candidates.add(value / 100);
  let best;
  let bestFeasible = false;
  let bestNormalizedError = Infinity;
  for (const candidate of candidates) {
    const framesPerBar = (beatsPerBar * 60 * fps) / candidate;
    const starts = new Array(sections.length);
    const boundaries = [];
    let previousAnchor = -1;
    let fixedBars = 0;
    let valid = true;
    for (let index = 0; index < sections.length; index++) {
      const section = sections[index];
      if (section.from !== undefined) {
        const startBar =
          previousAnchor < 0
            ? fixedBars
            : Math.round(section.from / framesPerBar);
        if (
          previousAnchor >= 0 &&
          startBar - starts[previousAnchor] - fixedBars < 1
        ) {
          valid = false;
          break;
        }
        starts[index] = startBar;
        if (previousAnchor >= 0) {
          let cursor = startBar;
          for (let j = index - 1; j > previousAnchor; j--) {
            cursor -= sections[j].bars;
            starts[j] = cursor;
          }
        }
        const actualFrame = Math.round(startBar * framesPerBar);
        boundaries.push({
          sectionIndex: index,
          requestedFrame: section.from,
          actualFrame,
          residualFrames: actualFrame - section.from,
        });
        previousAnchor = index;
        fixedBars = 0;
      } else {
        if (previousAnchor < 0) starts[index] = fixedBars;
        fixedBars += section.bars;
      }
    }
    if (
      !valid ||
      (durationInFrames !== undefined &&
        boundaries.some((boundary) => boundary.actualFrame >= durationInFrames))
    )
      continue;
    const totalBars =
      bars ??
      (hasAnchors
        ? Math.ceil(durationInFrames / framesPerBar)
        : sections.reduce((sum, section) => sum + section.bars, 0));
    if (!Number.isInteger(totalBars) || totalBars < 1 || totalBars > 64)
      continue;
    if (previousAnchor >= 0) {
      let cursor = totalBars;
      for (let j = sections.length - 1; j > previousAnchor; j--) {
        cursor -= sections[j].bars;
        starts[j] = cursor;
      }
      if (cursor - starts[previousAnchor] < 1) continue;
    } else if (fixedBars !== totalBars) continue;
    if (
      starts.some(
        (start, index) =>
          start < 0 ||
          start >= totalBars ||
          (index > 0 && start <= starts[index - 1]),
      )
    )
      continue;
    const error = boundaries.reduce(
      (sum, boundary) => sum + boundary.residualFrames ** 2,
      0,
    );
    const feasible = boundaries.every(
      (boundary) =>
        Math.abs(boundary.residualFrames) <= SCORE_ANCHOR_TOLERANCE_FRAMES,
    );
    const normalizedError = boundaries.reduce(
      (sum, boundary) => sum + (boundary.residualFrames / framesPerBar) ** 2,
      0,
    );
    const distance = Math.abs(candidate - preferredBpm);
    const preferable =
      !best ||
      distance < best.distance - 1e-9 ||
      (Math.abs(distance - best.distance) <= 1e-9 &&
        (error < best.error || (error === best.error && candidate < best.bpm)));
    if (
      !best ||
      (feasible && !bestFeasible) ||
      (feasible === bestFeasible &&
        (feasible
          ? preferable
          : normalizedError < bestNormalizedError ||
            (normalizedError === bestNormalizedError && preferable)))
    ) {
      best = {
        bpm: candidate,
        bars: totalBars,
        starts,
        boundaries,
        error,
        distance,
      };
      bestFeasible = feasible;
      bestNormalizedError = normalizedError;
    }
  }
  if (!best)
    throw new Error(
      "Score anchors cannot form positive sections within 64 bars; adjust anchors, bars or bpmRange.",
    );
  return best;
};

export const makeStoryboardTimeline = (recipe, makeLegacyTimeline) => {
  if (!["studio-v2", "studio-v3"].includes(recipe.engine))
    throw new Error(
      'Storyboard score controls require engine "studio-v2" or "studio-v3"',
    );
  fields(
    recipe,
    [
      "fps",
      "bpm",
      "beatsPerBar",
      "bars",
      "style",
      "seed",
      "engine",
      "arrangement",
      "bpmRange",
      "hits",
      "breaks",
      "ending",
      "durationInFrames",
    ],
    "score",
  );
  fields(
    recipe.arrangement,
    ["tonic", "mode", "progression", "swing", "sections"],
    "arrangement",
  );
  const sections = recipe.arrangement.sections;
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 64)
    throw new Error("Invalid arrangement sections");
  for (const section of sections) {
    fields(
      section,
      ["from", "bars", "instruments", "density", "energy"],
      "arrangement section",
    );
    if ((section.from === undefined) === (section.bars === undefined))
      throw new Error("Each section needs exactly one of from or bars");
    if (section.from !== undefined)
      frame(
        section.from,
        "section from (resolve sentence ids using film:music)",
      );
    if (
      section.bars !== undefined &&
      (!Number.isInteger(section.bars) || section.bars < 1)
    )
      throw new Error("Invalid arrangement section bars");
  }
  const fps = recipe.fps ?? 30;
  const beatsPerBar = recipe.beatsPerBar ?? 4;
  const bpm = recipe.bpm ?? 100;
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 120 ||
    !Number.isInteger(beatsPerBar) ||
    beatsPerBar < 2 ||
    beatsPerBar > 7 ||
    !Number.isFinite(bpm) ||
    bpm < 50 ||
    bpm > 180
  )
    throw new Error("Invalid score fps, beatsPerBar or bpm");
  const anchored = sections.some((section) => section.from !== undefined);
  if (
    recipe.bars !== undefined &&
    (!Number.isInteger(recipe.bars) || recipe.bars < 1 || recipe.bars > 64)
  )
    throw new Error("Invalid score bars");
  if (
    anchored &&
    recipe.durationInFrames === undefined &&
    recipe.bars === undefined
  )
    throw new Error("Anchored score needs film duration or total bars");
  if (
    recipe.durationInFrames !== undefined &&
    frame(recipe.durationInFrames, "score durationInFrames") < 1
  )
    throw new Error("Invalid score durationInFrames");
  const aligned = alignStoryboardSections({
    sections,
    fps,
    beatsPerBar,
    // A default BPM must not override the midpoint preference for an authored range.
    bpm: recipe.bpmRange === undefined ? bpm : recipe.bpm,
    bpmRange: recipe.bpmRange,
    bars: recipe.bars ?? (anchored ? undefined : 8),
    durationInFrames: recipe.durationInFrames,
  });
  const legacyRecipe = Object.fromEntries(
    Object.entries(recipe).filter(
      ([key]) =>
        !["bpmRange", "hits", "breaks", "ending", "durationInFrames"].includes(
          key,
        ),
    ),
  );
  const timeline = makeLegacyTimeline({
    ...legacyRecipe,
    bpm: aligned.bpm,
    bars: aligned.bars,
    arrangement: {
      ...recipe.arrangement,
      sections: sections.map((section, index) => ({
        ...Object.fromEntries(
          Object.entries(section).filter(([key]) => key !== "from"),
        ),
        bars:
          (aligned.starts[index + 1] ?? aligned.bars) - aligned.starts[index],
      })),
    },
  });
  const window = recipe.durationInFrames ?? timeline.durationInFrames;
  if (window > timeline.durationInFrames)
    throw new Error(
      "Storyboard score bars do not cover the film; increase bars or omit bars for automatic coverage.",
    );
  if (
    sections.some(
      (section) => section.from !== undefined && section.from >= window,
    )
  )
    throw new Error("Section anchor is outside the film music window");
  const hits = recipe.hits ?? [];
  if (!Array.isArray(hits) || hits.length > 128)
    throw new Error("Invalid score hits");
  for (const hit of hits) {
    fields(hit, ["frame", "kind", "intensity"], "score hit");
    if (
      frame(hit.frame, "hit frame") >= window ||
      !["stinger", "lift", "drop", "swell"].includes(hit.kind) ||
      !Number.isFinite(hit.intensity) ||
      hit.intensity <= 0 ||
      hit.intensity > 1
    )
      throw new Error(
        "Invalid score hit: check frame, kind and intensity (0–1)",
      );
  }
  const breaks = recipe.breaks ?? [];
  if (!Array.isArray(breaks) || breaks.length > 128)
    throw new Error("Invalid score breaks");
  for (const gap of breaks) {
    fields(gap, ["from", "to", "keep"], "score break");
    if (
      frame(gap.from, "break from") >= frame(gap.to, "break to") ||
      gap.to > window ||
      !Array.isArray(gap.keep) ||
      gap.keep.some((type) => !STUDIO_INSTRUMENTS.includes(type)) ||
      new Set(gap.keep).size !== gap.keep.length
    )
      throw new Error("Invalid score break");
  }
  const orderedBreaks = [...breaks].sort((a, b) => a.from - b.from);
  if (
    orderedBreaks.some(
      (gap, index) => index > 0 && gap.from < orderedBreaks[index - 1].to,
    )
  )
    throw new Error("Score breaks cannot overlap");
  const ending = recipe.ending;
  if (ending !== undefined) {
    fields(ending, ["landFrame", "cadence"], "score ending");
    if (
      frame(ending.landFrame, "ending landFrame") >= window ||
      !["resolve", "cut", "ring"].includes(ending.cadence)
    )
      throw new Error("Invalid score ending");
    if (
      hits.some((hit) => hit.frame >= ending.landFrame) ||
      aligned.boundaries.some(
        (boundary) => boundary.actualFrame >= ending.landFrame,
      )
    )
      throw new Error("Score hits and sections must arrive before the ending");
  }
  const music = timeline.music.filter((event) => {
    if (event.frame >= window || (ending && event.frame >= ending.landFrame))
      return false;
    return !breaks.some(
      (gap) =>
        event.frame >= gap.from &&
        event.frame < gap.to &&
        !gap.keep.includes(event.type),
    );
  });
  const add = (type, at, note, gain, frames) =>
    music.push({
      type,
      frame: at,
      durationInFrames: Math.max(1, Math.min(window - at, Math.round(frames))),
      note,
      gain,
    });
  const tonic =
    48 +
    {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11,
    }[recipe.arrangement.tonic];
  for (const hit of hits) {
    const length = fps * (hit.kind === "swell" ? 1.2 : 0.6);
    if (hit.kind === "drop") {
      add("kick", hit.frame, 36, hit.intensity, length);
      add("bass", hit.frame, tonic - 12, hit.intensity * 0.8, length);
    } else if (hit.kind === "stinger") {
      add("crash", hit.frame, 49, hit.intensity * 0.65, length);
      add("pluck", hit.frame, tonic + 12, hit.intensity, length);
    } else if (hit.kind === "lift") {
      add("crash", hit.frame, 49, hit.intensity * 0.45, length);
      add("lead", hit.frame, tonic + 24, hit.intensity * 0.8, length);
    } else {
      add("pad", hit.frame, tonic + 12, hit.intensity * 0.5, length);
      add("riser", hit.frame, 60, hit.intensity * 0.6, length);
    }
  }
  if (ending?.cadence === "resolve") {
    const length = window - ending.landFrame;
    for (const interval of [0, recipe.arrangement.mode === "minor" ? 3 : 4, 7])
      add("pad", ending.landFrame, tonic + interval, 0.2, length * 0.6);
    add("pluck", ending.landFrame, tonic + 12, 0.55, length * 0.5);
  }
  music.sort((a, b) => a.frame - b.frame);
  return {
    ...timeline,
    music,
    accentFrames: unique([
      ...timeline.accentFrames,
      ...hits.map((hit) => hit.frame),
      ...(ending?.cadence === "resolve" ? [ending.landFrame] : []),
    ]),
    loop: false,
    alignment: { bpm: aligned.bpm, boundaries: aligned.boundaries },
    hits,
    breaks,
    ...(ending ? { ending } : {}),
    musicWindowInFrames: window,
  };
};

/** These frames are rounded from the same sample starts used by the DSP. */
export const scoreOnsets = (timeline) => {
  if (timeline.engine === "studio-v3") {
    const audible = (frame) =>
      timeline.accents.some((entry) => entry.frame === frame);
    return {
      ...Object.fromEntries(
        ["kick", "snare", "clap", "hat", "bass"].map((type) => [
          type,
          unique(
            timeline.music
              .filter((event) => event.type === type && event.gain > 0)
              .map((event) => event.frame),
          ),
        ]),
      ),
      hits: unique(
        (timeline.hits ?? []).map((hit) => hit.frame).filter(audible),
      ),
      sections: unique(
        (timeline.sections ?? [])
          .map((section) => section.startFrame)
          .filter(audible),
      ),
      fills: timeline.fills,
      breaks: timeline.breaks.map(({ from, to }) => ({ from, to })),
      accents: timeline.accents,
    };
  }
  const result = {
    kick: [],
    snare: [],
    clap: [],
    hat: [],
    bass: [],
    hits: (timeline.hits ?? []).map((hit) => hit.frame),
    sections: (timeline.sections ?? []).map((section) => section.startFrame),
  };
  for (const event of timeline.music) {
    if (!Object.hasOwn(result, event.type) || event.gain <= 0) continue;
    const seconds =
      event.beat === undefined
        ? event.frame / timeline.fps
        : (event.beat * 60) / timeline.bpm;
    result[event.type].push(
      Math.round((Math.round(seconds * 48000) * timeline.fps) / 48000),
    );
  }
  return Object.fromEntries(
    Object.entries(result).map(([type, frames]) => [type, unique(frames)]),
  );
};
