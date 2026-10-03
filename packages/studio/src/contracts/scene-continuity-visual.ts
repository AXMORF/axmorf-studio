import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";

const MAX_ELEMENTS = 256;
const MAX_DEPTH = 16;
const MAX_BYTES = 128 * 1024;
const Coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const Length = Coordinate.nonnegative();
const Opacity = z.number().finite().min(0).max(1);
const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u);
const Color = z.union([
  z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu),
  z.enum(["black", "white", "transparent"]),
]);
const LocalUrl = z.string().regex(/^url\(#[A-Za-z][A-Za-z0-9_-]{0,63}\)$/u);
const LocalHref = z.string().regex(/^#[A-Za-z][A-Za-z0-9_-]{0,63}$/u);
const Paint = z.union([Color, LocalUrl, z.literal("none")]);
const Percent = z
  .string()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/u)
  .refine((value) => Math.abs(Number(value.slice(0, -1))) <= 1_000_000);
const GradientCoordinate = z.union([Coordinate, Percent]);
const Offset = z.union([
  Opacity,
  Percent.refine((value) => {
    const percentage = Number(value.slice(0, -1));
    return percentage >= 0 && percentage <= 100;
  }),
]);
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const TRANSFORM_ARITIES: Readonly<Record<string, readonly number[]>> = {
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
};
const Transform = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => {
    let remaining = value.trim();
    let count = 0;
    while (remaining.length > 0) {
      const match =
        /^(matrix|translate|scale|rotate|skewX|skewY)\(([^()]*)\)\s*/u.exec(
          remaining,
        );
      if (!match || ++count > 16) return false;
      const rawArguments = match[2].trim();
      if (
        rawArguments.startsWith(",") ||
        rawArguments.endsWith(",") ||
        /,\s*,/u.test(rawArguments)
      )
        return false;
      const arguments_ = rawArguments.split(/[\s,]+/u);
      if (
        !TRANSFORM_ARITIES[match[1]].includes(arguments_.length) ||
        !arguments_.every(
          (argument) =>
            NUMBER_PATTERN.test(argument) &&
            Number.isFinite(Number(argument)) &&
            Math.abs(Number(argument)) <= 1_000_000,
        )
      )
        return false;
      remaining = remaining.slice(match[0].length);
    }
    return count > 0;
  }, "Transforms must contain only finite SVG matrix/translate/scale/rotate/skew operations.");

const Identity = { id: Id.optional() };
const Presentation = {
  ...Identity,
  transform: Transform.optional(),
  fill: Paint.optional(),
  fillOpacity: Opacity.optional(),
  fillRule: z.enum(["nonzero", "evenodd"]).optional(),
  stroke: Paint.optional(),
  strokeWidth: Length.optional(),
  strokeOpacity: Opacity.optional(),
  strokeLinecap: z.enum(["butt", "round", "square"]).optional(),
  strokeLinejoin: z.enum(["miter", "round", "bevel"]).optional(),
  strokeMiterlimit: Length.optional(),
  strokeDasharray: z.array(Length).min(1).max(32).readonly().optional(),
  strokeDashoffset: Coordinate.optional(),
  opacity: Opacity.optional(),
  clipPath: LocalUrl.optional(),
  clipRule: z.enum(["nonzero", "evenodd"]).optional(),
  vectorEffect: z.enum(["none", "non-scaling-stroke"]).optional(),
  shapeRendering: z
    .enum(["auto", "crispEdges", "geometricPrecision", "optimizeSpeed"])
    .optional(),
  fontFamily: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[\p{L}\p{N} ,_'"-]+$/u)
    .optional(),
  fontSize: Length.positive().optional(),
  fontWeight: z
    .union([z.number().int().min(1).max(1000), z.enum(["normal", "bold"])])
    .optional(),
  fontStyle: z.enum(["normal", "italic", "oblique"]).optional(),
  textAnchor: z.enum(["start", "middle", "end"]).optional(),
  dominantBaseline: z
    .enum([
      "auto",
      "middle",
      "central",
      "hanging",
      "text-before-edge",
      "text-after-edge",
      "alphabetic",
      "ideographic",
      "mathematical",
    ])
    .optional(),
  letterSpacing: Coordinate.optional(),
  wordSpacing: Coordinate.optional(),
};
const TextPosition = {
  x: Coordinate.optional(),
  y: Coordinate.optional(),
  dx: Coordinate.optional(),
  dy: Coordinate.optional(),
  rotate: Coordinate.optional(),
  textLength: Length.optional(),
  lengthAdjust: z.enum(["spacing", "spacingAndGlyphs"]).optional(),
};
const Gradient = {
  ...Identity,
  href: LocalHref.optional(),
  gradientUnits: z.enum(["objectBoundingBox", "userSpaceOnUse"]).optional(),
  gradientTransform: Transform.optional(),
  spreadMethod: z.enum(["pad", "reflect", "repeat"]).optional(),
};
const Point = z.tuple([Coordinate, Coordinate]).readonly();
const attributes = <Shape extends z.ZodRawShape>(tag: string, shape: Shape) =>
  z
    .object(shape)
    .strict()
    .readonly()
    .meta({ id: `SceneContinuityVisualAttributes-${tag}` });
const Attributes = {
  g: attributes("g", Presentation),
  path: attributes("path", {
    ...Presentation,
    d: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[Mm][MmZzLlHhVvCcSsQqTtAaEe\d+.,\s-]*$/u)
      .refine((value) =>
        [
          ...value.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/gu),
        ].every(
          ([number]) =>
            Number.isFinite(Number(number)) &&
            Math.abs(Number(number)) <= 1_000_000,
        ),
      ),
    pathLength: Length.positive().optional(),
  }),
  rect: attributes("rect", {
    ...Presentation,
    x: Coordinate.optional(),
    y: Coordinate.optional(),
    width: Length,
    height: Length,
    rx: Length.optional(),
    ry: Length.optional(),
    pathLength: Length.positive().optional(),
  }),
  circle: attributes("circle", {
    ...Presentation,
    cx: Coordinate.optional(),
    cy: Coordinate.optional(),
    r: Length,
    pathLength: Length.positive().optional(),
  }),
  ellipse: attributes("ellipse", {
    ...Presentation,
    cx: Coordinate.optional(),
    cy: Coordinate.optional(),
    rx: Length,
    ry: Length,
    pathLength: Length.positive().optional(),
  }),
  line: attributes("line", {
    ...Presentation,
    x1: Coordinate,
    y1: Coordinate,
    x2: Coordinate,
    y2: Coordinate,
    pathLength: Length.positive().optional(),
  }),
  polyline: attributes("polyline", {
    ...Presentation,
    points: z.array(Point).min(2).max(256).readonly(),
    pathLength: Length.positive().optional(),
  }),
  polygon: attributes("polygon", {
    ...Presentation,
    points: z.array(Point).min(3).max(256).readonly(),
    pathLength: Length.positive().optional(),
  }),
  text: attributes("text", { ...Presentation, ...TextPosition }),
  tspan: attributes("tspan", { ...Presentation, ...TextPosition }),
  defs: attributes("defs", Identity),
  clipPath: attributes("clipPath", {
    ...Identity,
    transform: Transform.optional(),
    clipPathUnits: z.enum(["objectBoundingBox", "userSpaceOnUse"]).optional(),
  }),
  linearGradient: attributes("linearGradient", {
    ...Gradient,
    x1: GradientCoordinate.optional(),
    y1: GradientCoordinate.optional(),
    x2: GradientCoordinate.optional(),
    y2: GradientCoordinate.optional(),
  }),
  radialGradient: attributes("radialGradient", {
    ...Gradient,
    cx: GradientCoordinate.optional(),
    cy: GradientCoordinate.optional(),
    r: GradientCoordinate.optional(),
    fx: GradientCoordinate.optional(),
    fy: GradientCoordinate.optional(),
    fr: GradientCoordinate.optional(),
  }),
  stop: attributes("stop", {
    ...Identity,
    offset: Offset,
    stopColor: Color,
    stopOpacity: Opacity.optional(),
  }),
} as const;
type Tag = keyof typeof Attributes;
export type SceneContinuityVisualElement = {
  [Name in Tag]: Readonly<{
    tag: Name;
    attributes: z.infer<(typeof Attributes)[Name]>;
    children?: readonly (SceneContinuityVisualElement | string)[];
  }>;
}[Tag];

const DRAWING_TAGS: readonly Tag[] = [
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
];
const GRADIENT_TAGS: readonly Tag[] = ["linearGradient", "radialGradient"];
const allowedChildren = (tag: Tag): readonly Tag[] => {
  if (tag === "g" || tag === "clipPath") return DRAWING_TAGS;
  if (tag === "defs") return ["clipPath", ...GRADIENT_TAGS];
  if (tag === "text" || tag === "tspan") return ["tspan"];
  if (GRADIENT_TAGS.includes(tag)) return ["stop"];
  return [];
};
const validateChildren = (
  element: SceneContinuityVisualElement,
  context: z.RefinementCtx,
) => {
  for (const [index, child] of (element.children ?? []).entries()) {
    const allowed =
      typeof child === "string"
        ? element.tag === "text" || element.tag === "tspan"
        : allowedChildren(element.tag).includes(child.tag);
    if (!allowed)
      context.addIssue({
        code: "custom",
        message: "Invalid SVG child for its declared parent.",
        path: ["children", index],
      });
  }
};

// A finite schema graph rejects deep/cyclic inputs before recursive parsing.
// Named shared schemas keep the public input JSON schema bounded as well.
const buildElementSchema = (
  depth: number,
): z.ZodType<SceneContinuityVisualElement> => {
  const next = depth > 1 ? buildElementSchema(depth - 1) : null;
  const text = z.string().min(1).max(4096);
  const children = z
    .array(next === null ? text : z.union([text, next]))
    .min(1)
    .max(MAX_ELEMENTS)
    .readonly()
    .meta({ id: `SceneContinuityVisualChildren-${depth}` });
  const node = <Name extends Tag>(tag: Name) =>
    z
      .object({
        tag: z.literal(tag),
        attributes: Attributes[tag],
        children: children.optional(),
      })
      .strict();
  return z
    .discriminatedUnion("tag", [
      node("g"),
      node("path"),
      node("rect"),
      node("circle"),
      node("ellipse"),
      node("line"),
      node("polyline"),
      node("polygon"),
      node("text"),
      node("tspan"),
      node("defs"),
      node("clipPath"),
      node("linearGradient"),
      node("radialGradient"),
      node("stop"),
    ])
    .superRefine(validateChildren)
    .readonly()
    .meta({ id: `SceneContinuityVisualElement-${depth}` });
};

/** Frozen SVG subject data, with no media, HTML, executable or frame expressions. */
export const SceneContinuityVisualSchema = z
  .object({
    schemaVersion: z.literal(1),
    viewBox: z
      .tuple([Coordinate, Coordinate, Length.positive(), Length.positive()])
      .readonly(),
    elements: z
      .array(buildElementSchema(MAX_DEPTH))
      .min(1)
      .max(MAX_ELEMENTS)
      .readonly(),
  })
  .strict()
  .superRefine((visual, context) => {
    try {
      if (
        new TextEncoder().encode(serializeCanonicalJson(visual)).byteLength >
        MAX_BYTES
      )
        context.addIssue({
          code: "custom",
          message: "Continuity visual exceeds its declaration byte budget.",
        });
    } catch {
      context.addIssue({
        code: "custom",
        message: "Continuity visual must contain only canonical JSON values.",
      });
    }
    const ids = new Map<string, SceneContinuityVisualElement>();
    const references: {
      from: SceneContinuityVisualElement;
      id: string;
      tags: readonly Tag[];
    }[] = [];
    const dependencies = new Map<
      SceneContinuityVisualElement,
      SceneContinuityVisualElement[]
    >();
    const pending = [...visual.elements];
    let count = 0;
    for (const element of visual.elements) {
      if (![...DRAWING_TAGS, "defs"].includes(element.tag))
        context.addIssue({
          code: "custom",
          message: "Root elements must be SVG drawings or definitions.",
          path: ["elements"],
        });
    }
    while (pending.length > 0) {
      const element = pending.pop()!;
      if (++count > MAX_ELEMENTS) {
        context.addIssue({
          code: "custom",
          message: "Continuity visual exceeds its total element budget.",
          path: ["elements"],
        });
        break;
      }
      const { id } = element.attributes;
      if (id !== undefined) {
        if (ids.has(id))
          context.addIssue({
            code: "custom",
            message: "Continuity SVG IDs must be unique.",
            path: ["elements"],
          });
        ids.set(id, element);
      }
      for (const [attribute, value] of Object.entries(element.attributes)) {
        if (typeof value !== "string") continue;
        if (
          (attribute === "fill" ||
            attribute === "stroke" ||
            attribute === "clipPath") &&
          value.startsWith("url(#")
        ) {
          references.push({
            from: element,
            id: value.slice(5, -1),
            tags: attribute === "clipPath" ? ["clipPath"] : GRADIENT_TAGS,
          });
        } else if (attribute === "href") {
          references.push({
            from: element,
            id: value.slice(1),
            tags: GRADIENT_TAGS,
          });
        }
      }
      const children = (element.children ?? []).filter(
        (child) => typeof child !== "string",
      );
      dependencies.set(element, children);
      pending.push(...children);
    }
    for (const reference of references) {
      const target = ids.get(reference.id);
      if (target === undefined || !reference.tags.includes(target.tag)) {
        context.addIssue({
          code: "custom",
          message:
            "SVG references must resolve to a correctly typed local definition.",
          path: ["elements"],
        });
      } else dependencies.get(reference.from)?.push(target);
    }
    const active = new Set<SceneContinuityVisualElement>();
    const complete = new Set<SceneContinuityVisualElement>();
    const hasCycle = (element: SceneContinuityVisualElement): boolean => {
      if (active.has(element)) return true;
      if (complete.has(element)) return false;
      active.add(element);
      if ((dependencies.get(element) ?? []).some(hasCycle)) return true;
      active.delete(element);
      complete.add(element);
      return false;
    };
    if ([...dependencies.keys()].some(hasCycle)) {
      context.addIssue({
        code: "custom",
        message:
          "SVG local references cannot cycle through definitions or their children.",
        path: ["elements"],
      });
    }
  })
  .readonly();
export type SceneContinuityVisual = z.infer<typeof SceneContinuityVisualSchema>;

export const computeSceneContinuityVisualFingerprint = (visual: unknown) =>
  createFingerprint({
    namespace: "scene-continuity-visual",
    version: 1,
    value: SceneContinuityVisualSchema.parse(visual),
  });
