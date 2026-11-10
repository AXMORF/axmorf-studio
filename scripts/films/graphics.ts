import type {
  FilmReviewGraphics,
  FilmReviewMeasurement,
  FilmReviewRect,
} from "@axmorf/studio/contracts";

// Review hints, not delivery gates: flag overlap only above 15% of the smaller
// visible subject box. Exactly 15% can be intentional contact between objects.
export const GRAPHIC_OVERLAP_RATIO = 0.15;
// Unexplained painted-element bounds occupying over 10% of a frame deserve a
// semantic review. Sum bounds (not a pixel union); dense art can exceed 100%.
export const UNLABELED_GRAPHIC_RATIO = 0.1;
export const MAX_GRAPHIC_SUBJECTS = 3;
export const CAPTION_BAND_PADDING_PX = 24;

type ObjectMeasurement = FilmReviewGraphics["objects"][number];
export type GraphicWarning = {
  rule:
    | "graphic-overlap"
    | "too-many-subjects"
    | "unlabeled-graphic"
    | "graphic-in-caption-band"
    | "text-card-only";
  frame: number;
  /** Inclusive bounds of consecutive matching samples, not unsampled-frame proof. */
  frames?: [number, number];
  sampledFrames?: number[];
  objects: ObjectMeasurement[];
  transitionWindow: boolean;
  overlapRatio?: number;
  subjectCount?: number;
  unlabeledAreaRatio?: number;
  captionRect?: FilmReviewRect;
  captionBand?: FilmReviewRect;
  message: string;
};
const area = (rect: FilmReviewRect) => rect.width * rect.height;
const overlap = (a: FilmReviewRect, b: FilmReviewRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Consumes only the existing readability sample telemetry: no extra render. */
export const analyzeReviewGraphics = ({
  records,
  frames,
  width,
  height,
}: {
  records: readonly FilmReviewMeasurement[];
  frames: readonly number[];
  width: number;
  height: number;
}) => {
  const start = performance.now();
  const byIndex = new Map(records.map((record) => [record.index, record]));
  const graphicWarnings: GraphicWarning[] = [];
  const unknown: { frame: number; reason: string }[] = [];
  const measured: {
    frame: number;
    transitionWindow: boolean;
    objects: ObjectMeasurement[];
    captionRects: FilmReviewRect[];
    subjectCount: number;
    unlabeledCount: number;
    unlabeledAreaRatio: number;
  }[] = [];
  let cardRun: {
    frames: number[];
    objects: ObjectMeasurement[];
    transitionWindow: boolean;
  } | null = null;
  const finishCardRun = () => {
    if (!cardRun) return;
    const first = cardRun.frames[0];
    const last = cardRun.frames.at(-1)!;
    graphicWarnings.push({
      rule: "text-card-only",
      frame: first,
      frames: [first, last],
      sampledFrames: cardRun.frames,
      objects: cardRun.objects,
      transitionWindow: cardRun.transitionWindow,
      message: `f${first}–f${last}：连续命中采样段的可见 subject 全部为 card（采样帧 ${cardRun.frames.join(", ")}，不推定未采样帧）。每镜头主信息须由插画、图解或有意义的实物承载；文字卡片只放数字、原话和短标签。${cardRun.transitionWindow ? " 转场窗口内；请人工核对。" : ""}`,
    });
    cardRun = null;
  };
  // Preserve telemetry indices while reporting ranges chronologically.
  for (const [index, frame] of [...frames.entries()].sort(
    (a, b) => a[1] - b[1],
  )) {
    const record = byIndex.get(index);
    const graphics = record?.graphics;
    if (!record || record.error || !graphics) {
      finishCardRun();
      unknown.push({
        frame,
        reason:
          record?.error ??
          "Graphic measurements are unavailable (missing or legacy telemetry).",
      });
      continue;
    }
    if (graphics.truncated)
      unknown.push({
        frame,
        reason: "Graphic measurements were truncated; inspect the frame.",
      });
    unknown.push(...graphics.unknown.map((reason) => ({ frame, reason })));
    const transitionWindow = record.transitionWindow ?? false;
    const suffix = transitionWindow ? " 转场窗口内；请人工核对。" : "";
    const captionRects = [
      ...new Map(
        record.texts
          .filter((text) => text.caption)
          .map((text) => {
            const rect = text.captionRect ?? text.rect;
            return [JSON.stringify(rect), rect] as const;
          }),
      ).values(),
    ];
    for (const captionRect of captionRects) {
      const captionBand = {
        x: captionRect.x - CAPTION_BAND_PADDING_PX,
        y: captionRect.y - CAPTION_BAND_PADDING_PX,
        width: captionRect.width + 2 * CAPTION_BAND_PADDING_PX,
        height: captionRect.height + 2 * CAPTION_BAND_PADDING_PX,
      };
      const intruders = graphics.objects.filter(
        (object) =>
          object.role !== "background" && overlap(object.rect, captionBand) > 0,
      );
      if (intruders.length)
        graphicWarnings.push({
          rule: "graphic-in-caption-band",
          frame,
          objects: intruders,
          transitionWindow,
          captionRect,
          captionBand,
          message: `f${frame}：${intruders.map((object) => JSON.stringify(object.label)).join("、")} 的可见包围盒伸进字幕框外扩 ${CAPTION_BAND_PADDING_PX}px 的保护区；手和道具不能伸进字幕带。${suffix}`,
        });
    }
    const subjects = graphics.objects.filter(
      (object) => object.role === "subject",
    );
    const cardOnly =
      !graphics.truncated &&
      graphics.unknown.length === 0 &&
      subjects.length > 0 &&
      subjects.every((object) => object.kind === "card");
    if (cardOnly) {
      cardRun ??= { frames: [], objects: subjects, transitionWindow: false };
      cardRun.frames.push(frame);
      cardRun.transitionWindow ||= transitionWindow;
    } else finishCardRun();
    const unlabeledAreaRatio = graphics.unlabeledArea / (width * height);
    measured.push({
      frame,
      transitionWindow,
      objects: graphics.objects,
      captionRects,
      subjectCount: subjects.length,
      unlabeledCount: graphics.unlabeledCount,
      unlabeledAreaRatio,
    });
    for (const [i, a] of subjects.entries()) {
      for (const b of subjects.slice(i + 1)) {
        if (
          a.label === b.label ||
          a.ancestors.includes(b.id) ||
          b.ancestors.includes(a.id)
        )
          continue;
        const overlapRatio =
          overlap(a.rect, b.rect) / Math.min(area(a.rect), area(b.rect));
        if (overlapRatio > GRAPHIC_OVERLAP_RATIO)
          graphicWarnings.push({
            rule: "graphic-overlap",
            frame,
            objects: [a, b],
            transitionWindow,
            overlapRatio,
            message: `f${frame}：${JSON.stringify(a.label)} 与 ${JSON.stringify(b.label)} 的可见包围盒交叠 ${(overlapRatio * 100).toFixed(1)}%（较小者，阈值 >15%）；避免无意义交叉或重叠。${suffix}`,
          });
      }
    }
    if (subjects.length > MAX_GRAPHIC_SUBJECTS)
      graphicWarnings.push({
        rule: "too-many-subjects",
        frame,
        objects: subjects,
        transitionWindow,
        subjectCount: subjects.length,
        message: `f${frame}：可见非文字主体 ${subjects.length} 个（最多 3 个）：${subjects.map((object) => object.label).join("、")}；精简或分镜。${suffix}`,
      });
    if (unlabeledAreaRatio > UNLABELED_GRAPHIC_RATIO)
      graphicWarnings.push({
        rule: "unlabeled-graphic",
        frame,
        objects: [],
        transitionWindow,
        unlabeledAreaRatio,
        message: `f${frame}：未标注图形包围盒面积总和占画面 ${(unlabeledAreaRatio * 100).toFixed(1)}%（阈值 >10%）；说不出代表什么的图形不画；能说出来就加 data-axmorf-object。${suffix}`,
      });
  }
  finishCardRun();
  return {
    graphicWarnings,
    graphics: {
      thresholds: {
        overlapRatio: GRAPHIC_OVERLAP_RATIO,
        unlabeledAreaRatio: UNLABELED_GRAPHIC_RATIO,
        maxSubjects: MAX_GRAPHIC_SUBJECTS,
        captionBandPaddingPx: CAPTION_BAND_PADDING_PX,
      },
      frames: measured,
      measuredFrames: measured.length,
      unknown,
      analysisMs: Math.round(performance.now() - start),
    },
  };
};
