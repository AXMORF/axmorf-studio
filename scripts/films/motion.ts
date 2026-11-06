import { stripVTControlCharacters } from "node:util";
import ts from "typescript";
import {
  FILM_REVIEW_MOTION_MARKER,
  FilmReviewMotionSchema,
  type FilmReviewMotion,
  type FilmReviewMotionSceneSchema,
  type FilmMotionCurve,
  type FilmMusic,
} from "@axmorf/studio/contracts";
import type { z } from "zod";
import type { FilmMotionWarningSchema } from "@axmorf/studio/contracts";
import { meanAbsoluteDifference } from "./frame-compare";

type Warning = z.infer<typeof FilmMotionWarningSchema>;
// 待校准：0.5s / 0.125-scale grayscale signatures include captions and object motion.
export const MOTION_SAMPLE_SECONDS = 0.5;
// 待校准：旧片的连续平移可达 MAD 35；45 把它和背景硬切（>130）分开。
export const MOTION_CUT_DIFFERENCE = 45;
export const MOTION_HOLD_DIFFERENCE = 1.5;
export const MOTION_HOLD_SAMPLE_SHARE = 0.8;
export const MOTION_HOLD_MEAN_DIFFERENCE = 3;
export const MOTION_ENTER_SHARE = 0.25;
export const MOTION_ENTER_ENERGY_SHARE = 0.65;
export const MOTION_MIN_SCENE_SECONDS = 3;
export const MOTION_HARD_CUT_SHARE = 0.7;
export const MOTION_ON_BEAT_SHARE = 0.5;
export const MOTION_BEAT_TOLERANCE = 2;
export const MOTION_SFX_MIN_SECONDS = 30;
export const MOTION_DENSE_FPS = 6;
export const MOTION_DENSE_MAX_SECONDS = 3;
export const MOTION_DENSE_MAX_FRAMES = 108;
// 待校准：64×64 灰度签名 MAD（0–255），不是内容/语义相同的判定。
export const MOTION_COMPOSITION_DIFFERENCE = 12;
export const MOTION_COMPOSITION_MIN_SECONDS = 1;

type Scene = z.infer<typeof FilmReviewMotionSceneSchema>;
/** Logged scene boundaries plus internal candidate cuts. Ignore transition spikes
 * and sub-second cut fragments; legacy films without a scene track stay unknown. */
export const compositionSegments = (
  scenes: readonly Scene[],
  curve: FilmMotionCurve,
) =>
  scenes.flatMap((scene) => {
    const margin = Math.round(curve.fps * MOTION_COMPOSITION_MIN_SECONDS);
    const from = scene.boundaryFrame;
    const to = scene.endFrame;
    const cuts = curve.cuts
      .filter(
        (cut) =>
          cut.frame >= from + margin &&
          cut.frame <= to - margin &&
          !scenes.some(
            (s) =>
              s.enter &&
              cut.to >= s.enter.startFrame &&
              cut.from <= s.enter.endFrame,
          ),
      )
      .map((cut) => cut.frame)
      .sort((a, b) => a - b);
    const boundaries = [from];
    for (const cut of cuts)
      if (cut - boundaries.at(-1)! >= margin) boundaries.push(cut);
    boundaries.push(to);
    return boundaries.slice(0, -1).map((start, i) => ({
      from: start,
      to: boundaries[i + 1],
      frame: Math.floor((start + boundaries[i + 1] - 1) / 2),
    }));
  });

export const reviewMotionScenes = (records: readonly FilmReviewMotion[]) => {
  const tracks = new Map(
    records
      .flatMap((r) => r.events)
      .filter((e) => e.type === "scene-track")
      .map((e) => [JSON.stringify(e), e]),
  );
  return tracks.size === 1 ? [...tracks.values()][0].scenes : [];
};

/** Same tolerant transport as readability; malformed telemetry never blocks delivery. */
export const extractMotionMeasurements = (output: string) => {
  const records: FilmReviewMotion[] = [];
  let badLines = 0;
  for (const line of stripVTControlCharacters(output).split(/\r?\n/u)) {
    const at = line.indexOf(`${FILM_REVIEW_MOTION_MARKER} `);
    if (at < 0) continue;
    try {
      const parsed = FilmReviewMotionSchema.safeParse(
        JSON.parse(line.slice(at + FILM_REVIEW_MOTION_MARKER.length).trim()),
      );
      if (parsed.success) records.push(parsed.data);
      else badLines++;
    } catch {
      badLines++;
    }
  }
  return { records, badLines };
};

/** Inspect actual syntax, including import aliases; comments and prose are ignored.
 * Any hand-authored audio is ambiguous (it may be music), so report unknown. */
export const scanLegacyMotionAudio = (sources: readonly string[]) =>
  sources.some((source) => {
    const file = ts.createSourceFile(
      "film.tsx",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const audio = new Set(["Audio", "Html5Audio"]);
    const staticFiles = new Set(["staticFile"]);
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const entry of bindings.elements) {
        const name = entry.propertyName?.text ?? entry.name.text;
        if (audio.has(name)) audio.add(entry.name.text);
        if (name === "staticFile") staticFiles.add(entry.name.text);
      }
    }
    let found = false;
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        audio.has(node.tagName.getText(file).split(".").at(-1)!)
      )
        found = true;
      if (
        ts.isCallExpression(node) &&
        staticFiles.has(node.expression.getText(file).split(".").at(-1)!) &&
        node.arguments.some((arg) =>
          arg.getText(file).includes("sound-effects/"),
        )
      )
        found = true;
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  });

export const buildMotionCurve = (
  samples: readonly { frame: number; signature: Uint8Array }[],
  fps: number,
): FilmMotionCurve => {
  const ordered = [...samples].sort((a, b) => a.frame - b.frame);
  const differences = ordered.map((sample, i) => ({
    frame: sample.frame,
    difference:
      i === 0
        ? 0
        : Number(
            meanAbsoluteDifference(
              ordered[i - 1].signature,
              sample.signature,
            ).toFixed(3),
          ),
  }));
  const seconds = new Map<number, number>();
  for (const sample of differences) {
    const second = Math.floor(sample.frame / fps);
    seconds.set(second, (seconds.get(second) ?? 0) + sample.difference);
  }
  return {
    fps,
    sampleSeconds: MOTION_SAMPLE_SECONDS,
    samples: differences,
    seconds: [...seconds].map(([second, difference]) => ({
      second,
      difference: Number(difference.toFixed(3)),
    })),
    // Interval uncertainty is retained; a 0.5s sample cannot locate a cut to one frame.
    cuts: differences.flatMap((sample, i) =>
      i > 0 && sample.difference >= MOTION_CUT_DIFFERENCE
        ? [
            {
              from: ordered[i - 1].frame,
              to: sample.frame,
              frame: sample.frame,
              difference: sample.difference,
            },
          ]
        : [],
    ),
  };
};

export const analyzeMotion = ({
  records,
  frames,
  curve,
  durationInFrames,
  fps,
  hasNarration,
  legacyAudio,
  music,
  stillWarnings,
  compositionSamples = [],
}: {
  readonly records: readonly FilmReviewMotion[];
  readonly frames: readonly number[];
  readonly curve: FilmMotionCurve;
  readonly durationInFrames: number;
  readonly fps: number;
  readonly hasNarration: boolean;
  readonly legacyAudio: boolean;
  readonly music: Pick<FilmMusic, "beatFrames" | "accentFrames"> | null;
  readonly stillWarnings: readonly { frames: readonly [number, number] }[];
  readonly compositionSamples?: readonly {
    frame: number;
    signature: Uint8Array;
  }[];
}) => {
  const measured = new Map<number, FilmReviewMotion>();
  for (const record of records)
    if (frames[record.index] === record.frame)
      measured.set(record.index, record);
  const telemetry = [...measured.values()].sort((a, b) => a.index - b.index);
  const missingFrames = frames.filter((_, i) => !measured.has(i));
  const complete =
    missingFrames.length === 0 && !telemetry.some((r) => r.truncated);
  const events = [
    ...new Map(
      telemetry.flatMap((r) => r.events).map((e) => [JSON.stringify(e), e]),
    ).values(),
  ];
  const tracks = events.filter((e) => e.type === "scene-track");
  const scenes = tracks.length === 1 ? tracks[0].scenes : [];
  const cues = events.flatMap((e) =>
    e.type === "sound-effects" ? e.cues : [],
  );
  const recipes = events.filter((e) => e.type === "recipe");
  const motionWarnings: Warning[] = [];
  const unknown: { rule: Warning["rule"]; reason: string }[] = [];
  const addUnknown = (rule: Warning["rule"], reason: string) =>
    unknown.push({ rule, reason });
  const warn = (
    rule: Warning["rule"],
    from: number,
    to: number,
    message: string,
  ) => motionWarnings.push({ rule, frames: [from, to], message });

  if (!scenes.length || !complete)
    addUnknown(
      "repeated-composition",
      "Requires one complete scene track; legacy films without a track remain unknown.",
    );
  else {
    const segments = compositionSegments(scenes, curve);
    const signatures = new Map(
      compositionSamples.map((s) => [s.frame, s.signature]),
    );
    if (segments.some((segment) => !signatures.has(segment.frame)))
      addUnknown(
        "repeated-composition",
        "Some segment midpoint signatures are missing.",
      );
    else
      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 2; j < segments.length; j++) {
          const a = segments[i],
            b = segments[j];
          const difference = meanAbsoluteDifference(
            signatures.get(a.frame)!,
            signatures.get(b.frame)!,
          );
          if (difference < MOTION_COMPOSITION_DIFFERENCE)
            warn(
              "repeated-composition",
              a.frame,
              b.frame,
              `Non-adjacent segments [${a.from},${a.to}) and [${b.from},${b.to}) have similar midpoint compositions at f${a.frame} / f${b.frame} (MAD ${difference.toFixed(3)} < ${MOTION_COMPOSITION_DIFFERENCE}); inspect framing even during narration.`,
            );
        }
      }
  }

  // A large isolated spike followed by a hold is usable for legacy slide-style scenes.
  // Candidate cuts are approximate evidence, never exact timing for beat judgments.
  const boundaries = scenes.length
    ? scenes.map((s) => s.boundaryFrame)
    : [0, ...curve.cuts.map((c) => c.frame)];
  for (let i = 0; i < boundaries.length; i++) {
    const from = boundaries[i],
      to = boundaries[i + 1] ?? durationInFrames;
    if ((to - from) / fps < MOTION_MIN_SCENE_SECONDS) continue;
    const earlyEnd = from + (to - from) * MOTION_ENTER_SHARE;
    // Exclude the interval crossing a cut; it is not in-scene motion.
    const inside = curve.samples.filter((s) => s.frame > from && s.frame < to);
    const early = inside.filter((s) => s.frame <= earlyEnd);
    const late = inside.filter((s) => s.frame > earlyEnd);
    const energy = (items: typeof inside) =>
      items.reduce((sum, s) => sum + s.difference, 0);
    if (!early.length || late.length < 3) continue;
    if (
      energy(early) > 0 &&
      energy(early) / Math.max(0.001, energy(inside)) >=
        MOTION_ENTER_ENERGY_SHARE &&
      late.filter((s) => s.difference < MOTION_HOLD_DIFFERENCE).length /
        late.length >=
        MOTION_HOLD_SAMPLE_SHARE &&
      energy(late) / late.length < MOTION_HOLD_MEAN_DIFFERENCE
    ) {
      const holdStart = Math.ceil(earlyEnd);
      if (
        !stillWarnings.some((s) => s.frames[0] < to && s.frames[1] > holdStart)
      )
        warn(
          "enter-then-hold",
          from,
          to,
          "Visual change is concentrated near the entrance, followed by a long hold; inspect secondary motion and framing.",
        );
    }
  }
  if (scenes.length > 1) {
    const cross = scenes
      .slice(1)
      .filter(
        (s, i) =>
          s.chapter !== null &&
          scenes[i].chapter !== null &&
          s.chapter !== scenes[i].chapter,
      );
    const transitions = scenes.slice(1).filter((s) => s.enter !== null);
    if (
      !transitions.length ||
      (cross.length > 0 &&
        cross.filter((s) => s.enter === null).length / cross.length >=
          MOTION_HARD_CUT_SHARE)
    )
      warn(
        "hard-cut-heavy",
        0,
        durationInFrames,
        `${transitions.length} transitions; ${cross.filter((s) => s.enter === null).length}/${cross.length} chapter boundaries are hard cuts. Inspect continuity.`,
      );
  } else if (tracks.length > 1) {
    addUnknown(
      "hard-cut-heavy",
      "Multiple scene tracks cannot be treated as one chapter timeline.",
    );
  } else if (complete && curve.cuts.length >= 2) {
    warn(
      "hard-cut-heavy",
      0,
      durationInFrames,
      `${curve.cuts.length} candidate visual cuts and no logged transitions; inspect the curve and dense frames (legacy cut timing is approximate).`,
    );
  } else if (!scenes.length)
    addUnknown(
      "hard-cut-heavy",
      "No unambiguous scene track or sufficient visual cut evidence.",
    );

  if (
    hasNarration &&
    durationInFrames / fps > MOTION_SFX_MIN_SECONDS &&
    cues.length === 0
  ) {
    if (legacyAudio || !complete)
      addUnknown(
        "no-sound-effects",
        legacyAudio
          ? "Hand-authored Audio/Html5Audio or sound-effects/staticFile reference may supply sound effects."
          : "Motion telemetry is incomplete.",
      );
    else
      warn(
        "no-sound-effects",
        0,
        durationInFrames,
        "Narrated film exceeds 30 seconds and has no sound-effect cues; consider sound tied to visible actions.",
      );
  }
  if (music) {
    const grid = [...music.beatFrames, ...music.accentFrames];
    if (!grid.length)
      addUnknown("off-beat-cuts", "Music beat/accent grid is empty.");
    else if (!scenes.length || !complete)
      addUnknown(
        "off-beat-cuts",
        "Exact scene boundaries are unavailable; 0.5s visual cuts cannot resolve ±2 frames.",
      );
    else {
      const points = [
        ...scenes.slice(1).map((s) => s.boundaryFrame),
        ...recipes.map((r) => r.land),
      ].filter((f) => f >= Math.min(...grid) && f <= Math.max(...grid));
      const on = points.filter((f) =>
        grid.some((g) => Math.abs(f - g) <= MOTION_BEAT_TOLERANCE),
      ).length;
      if (points.length && on / points.length < MOTION_ON_BEAT_SHARE)
        warn(
          "off-beat-cuts",
          0,
          durationInFrames,
          `${on}/${points.length} scene boundaries and recipe landings are within ±2 frames of a beat/accent.`,
        );
    }
  }
  if (!scenes.some((s) => s.chapter !== null) || !complete)
    addUnknown(
      "static-camera",
      "Requires a complete FilmSceneTrack with chapter labels; legacy transforms cannot be identified reliably.",
    );
  else {
    const chapters = new Map<string, typeof scenes>();
    for (const scene of scenes)
      if (scene.chapter !== null)
        chapters.set(scene.chapter, [
          ...(chapters.get(scene.chapter) ?? []),
          scene,
        ]);
    for (const [chapter, members] of chapters) {
      const inChapter = telemetry.filter((r) =>
        members.some((s) => r.frame >= s.boundaryFrame && r.frame < s.endFrame),
      );
      if (!inChapter.length) {
        addUnknown("static-camera", `Chapter ${chapter} was not sampled.`);
        continue;
      }
      const camera = inChapter.some((r) =>
        r.events.some(
          (e) =>
            e.type === "world-camera" ||
            (e.type === "recipe" &&
              (e.id === "CameraMove" || e.id === "ParallaxLayers")),
        ),
      );
      if (!camera)
        warn(
          "static-camera",
          members[0].boundaryFrame,
          members.at(-1)!.endFrame,
          `Chapter ${chapter} has no sampled camera preset or WorldCamera; inspect world-space motion.`,
        );
    }
  }
  return {
    motionWarnings,
    boundaryChecks: scenes.slice(1).map((scene) => {
      const start = scene.enter?.startFrame ?? scene.boundaryFrame;
      const end = scene.enter?.endFrame ?? scene.boundaryFrame;
      const cut = curve.cuts.find((cut) => cut.from <= end && cut.to >= start);
      return {
        boundaryFrame: scene.boundaryFrame,
        kind: scene.enter?.kind ?? null,
        candidateCutFrames: cut
          ? ([cut.from, cut.to] as [number, number])
          : null,
      };
    }),
    telemetry,
    missingFrames,
    unknown,
    summary: {
      sampledFrames: curve.samples.length,
      sceneCount: scenes.length,
      cueCount: new Set(cues.map((c) => JSON.stringify(c))).size,
      recipeIds: [...new Set(recipes.map((r) => r.id))],
      cameraPresets: [
        ...new Set(recipes.flatMap((r) => (r.preset ? [r.preset] : []))),
      ],
      worldCameraSamples: telemetry.filter((r) =>
        r.events.some((e) => e.type === "world-camera"),
      ).length,
      detectedCuts: curve.cuts.length,
    },
  };
};

/** Budget is explicit: at most six 3-second ranges, including partial last ranges. */
export const selectDenseMotionFrames = (
  warnings: readonly Warning[],
  fps: number,
) => {
  let remaining = MOTION_DENSE_MAX_FRAMES;
  return warnings.flatMap((w) => {
    if (remaining <= 0) return [];
    const from = w.frames[0],
      to = Math.min(
        w.frames[1],
        from + Math.round(MOTION_DENSE_MAX_SECONDS * fps),
      );
    const frames: number[] = [];
    for (let n = 0; remaining > 0; n++) {
      const frame = from + Math.round((n * fps) / MOTION_DENSE_FPS);
      if (frame >= to) break;
      if (frames.at(-1) === frame) continue;
      frames.push(frame);
      remaining--;
    }
    return frames.length
      ? [{ rule: w.rule, range: [from, to] as [number, number], frames }]
      : [];
  });
};
