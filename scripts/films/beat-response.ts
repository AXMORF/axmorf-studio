import type {
  FilmMusic,
  FilmReviewMotionEvent,
} from "@axmorf/studio/contracts";

// Three object-borne actions per chapter is a review hint, never a delivery gate.
export const MIN_CHAPTER_RESPONSE_KINDS = 3;
const rule = "beat-response-monotone" as const;
export const analyzeBeatResponses = ({
  events,
  complete,
  music,
  durationInFrames,
}: {
  events: readonly FilmReviewMotionEvent[];
  complete: boolean;
  music: Partial<Pick<FilmMusic, "sectionFrames">> | null;
  durationInFrames: number;
}) => {
  const unknown: { rule: typeof rule; reason: string }[] = [];
  const motionWarnings: {
    rule: typeof rule;
    frames: [number, number];
    message: string;
  }[] = [];
  const summary: {
    chapter: string;
    startFrame: number;
    endFrame: number;
    kinds: string[];
    objects: string[];
    globalKinds: string[];
  }[] = [];
  const tracks = events.filter((e) => e.type === "scene-track");
  const responses = events.filter((e) => e.type === "rhythm-response");
  if (!complete || !responses.length || tracks.length > 1) {
    unknown.push({
      rule,
      reason: !complete
        ? "Motion telemetry is missing or truncated."
        : !responses.length
          ? "No object response telemetry; legacy pulse/resolveBreathScale does not prove object variety. Report global light/scale explicitly or use useBreathScale."
          : "Multiple scene tracks make chapter boundaries ambiguous.",
    });
    return { motionWarnings, unknown, summary: null };
  }
  const chapters: { chapter: string; startFrame: number; endFrame: number }[] =
    [];
  if (tracks[0]?.scenes.length) {
    for (const scene of tracks[0].scenes) {
      const chapter = scene.chapter ?? scene.id;
      const last = chapters.at(-1);
      if (
        last &&
        last.chapter === chapter &&
        last.endFrame === scene.boundaryFrame
      )
        last.endFrame = scene.endFrame;
      else
        chapters.push({
          chapter,
          startFrame: scene.boundaryFrame,
          endFrame: scene.endFrame,
        });
    }
  } else if (music?.sectionFrames?.length) {
    const bounds = [
      ...new Set([
        0,
        ...music.sectionFrames.filter((f) => f >= 0 && f < durationInFrames),
        durationInFrames,
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < bounds.length - 1; i++)
      chapters.push({
        chapter: `section-${i + 1}`,
        startFrame: bounds[i],
        endFrame: bounds[i + 1],
      });
  }
  if (!chapters.length) {
    unknown.push({
      rule,
      reason: "Requires scene/chapter or score section boundaries.",
    });
    return { motionWarnings, unknown, summary: null };
  }
  for (const chapter of chapters) {
    const local = responses.filter((response) =>
      response.frames.some(
        (f) => f >= chapter.startFrame && f < chapter.endFrame,
      ),
    );
    if (!local.length) {
      unknown.push({
        rule,
        reason: `Chapter ${chapter.chapter} f${chapter.startFrame}–${chapter.endFrame} has no response telemetry.`,
      });
      continue;
    }
    const global = (response: (typeof local)[number]) =>
      response.scope === "global" ||
      response.object === "global" ||
      ["global-light", "global-scale", "breath-scale"].includes(response.kind);
    const objects = local.filter((response) => !global(response));
    const entry = {
      ...chapter,
      kinds: [...new Set(objects.map((response) => response.kind))],
      objects: [...new Set(objects.map((response) => response.object))],
      globalKinds: [
        ...new Set(local.filter(global).map((response) => response.kind)),
      ],
    };
    summary.push(entry);
    if (entry.kinds.length < MIN_CHAPTER_RESPONSE_KINDS)
      motionWarnings.push({
        rule,
        frames: [chapter.startFrame, chapter.endFrame],
        message: `章节 ${chapter.chapter} f${chapter.startFrame}–${chapter.endFrame} 只有 ${entry.kinds.length} 种物件节拍反应（至少3种）；物件：${entry.objects.join("、") || "无"}；全局反应：${entry.globalKinds.join("、") || "无"}。光闪/全局缩放只作补充，轮换具体物件上的动作；上报不证明过程可见。`,
      });
  }
  return { motionWarnings, unknown, summary };
};
