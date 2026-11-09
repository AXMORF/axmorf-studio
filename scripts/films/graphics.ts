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

type ObjectMeasurement = FilmReviewGraphics["objects"][number];
export type GraphicWarning = {
  rule: "graphic-overlap" | "too-many-subjects" | "unlabeled-graphic";
  frame: number;
  objects: ObjectMeasurement[];
  transitionWindow: boolean;
  overlapRatio?: number;
  subjectCount?: number;
  unlabeledAreaRatio?: number;
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
    subjectCount: number;
    unlabeledCount: number;
    unlabeledAreaRatio: number;
  }[] = [];
  for (const [index, frame] of frames.entries()) {
    const record = byIndex.get(index);
    const graphics = record?.graphics;
    if (!record || record.error || !graphics) {
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
    const subjects = graphics.objects.filter(
      (object) => object.role === "subject",
    );
    const unlabeledAreaRatio = graphics.unlabeledArea / (width * height);
    measured.push({
      frame,
      transitionWindow,
      objects: graphics.objects,
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
  return {
    graphicWarnings,
    graphics: {
      thresholds: {
        overlapRatio: GRAPHIC_OVERLAP_RATIO,
        unlabeledAreaRatio: UNLABELED_GRAPHIC_RATIO,
        maxSubjects: MAX_GRAPHIC_SUBJECTS,
      },
      frames: measured,
      measuredFrames: measured.length,
      unknown,
      analysisMs: Math.round(performance.now() - start),
    },
  };
};
