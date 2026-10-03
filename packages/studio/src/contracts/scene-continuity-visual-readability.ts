import {
  SceneContinuityVisualSchema,
  type SceneContinuityVisual,
  type SceneContinuityVisualElement,
} from "./scene-continuity-visual";
import { SceneViewportSchema, type SceneViewport } from "./scene-readability";

// SVG's linear matrix is [a c; b d]. Translation cannot change glyph size.
type LinearMatrix = readonly [number, number, number, number];
const IDENTITY: LinearMatrix = [1, 0, 0, 1];

const multiply = (
  [a, b, c, d]: LinearMatrix,
  [e, f, g, h]: LinearMatrix,
): LinearMatrix => [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h];

const transformMatrix = (transform: string | undefined): LinearMatrix => {
  let matrix = IDENTITY;
  // SceneContinuityVisualSchema has already validated operation names, arities
  // and finite arguments. SVG transform lists post-multiply in declared order.
  for (const match of (transform ?? "").matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\(([^()]*)\)/gu,
  )) {
    const values = match[2]
      .trim()
      .split(/[\s,]+/u)
      .map(Number);
    let operation: LinearMatrix = IDENTITY;
    if (match[1] === "matrix") {
      operation = [values[0], values[1], values[2], values[3]];
    } else if (match[1] === "scale") {
      operation = [values[0], 0, 0, values[1] ?? values[0]];
    } else if (match[1] === "rotate") {
      const radians = (values[0] * Math.PI) / 180;
      operation = [
        Math.cos(radians),
        Math.sin(radians),
        -Math.sin(radians),
        Math.cos(radians),
      ];
    } else if (match[1] === "skewX") {
      operation = [1, 0, Math.tan((values[0] * Math.PI) / 180), 1];
    } else if (match[1] === "skewY") {
      operation = [1, Math.tan((values[0] * Math.PI) / 180), 0, 1];
    }
    matrix = multiply(matrix, operation);
  }
  return matrix;
};

const minimumScale = ([a, b, c, d]: LinearMatrix) => {
  const magnitude = Math.max(
    Math.abs(a),
    Math.abs(b),
    Math.abs(c),
    Math.abs(d),
  );
  if (!Number.isFinite(magnitude)) return NaN;
  if (magnitude === 0) return 0;
  const [na, nb, nc, nd] = [a, b, c, d].map((value) => value / magnitude);
  const maximumSingularValue =
    (Math.hypot(na + nd, nb - nc) + Math.hypot(na - nd, nb + nc)) / 2;
  // det / sigma-max avoids subtracting near-equal squared singular values.
  // Column lengths alone miss compression caused by a matrix shear.
  return (magnitude * Math.abs(na * nd - nb * nc)) / maximumSingularValue;
};

/** Prove the frozen SVG's painted text meets the existing viewport minimum. */
export const validateSceneContinuityVisualReadability = ({
  visual: rawVisual,
  sceneViewport: rawSceneViewport,
}: {
  readonly visual: SceneContinuityVisual | unknown;
  readonly sceneViewport: SceneViewport | unknown;
}) => {
  const visual = SceneContinuityVisualSchema.parse(rawVisual);
  const sceneViewport = SceneViewportSchema.parse(rawSceneViewport);
  // SceneContinuityVisual fills the viewport with xMidYMid meet.
  const viewportScale = Math.min(
    sceneViewport.width / visual.viewBox[2],
    sceneViewport.height / visual.viewBox[3],
  );
  const viewportMatrix: LinearMatrix = [viewportScale, 0, 0, viewportScale];
  const visit = (
    element: SceneContinuityVisualElement,
    parentMatrix: LinearMatrix,
    inheritedFontSize: number,
    path: string,
    unprovenGlyphAdjustment: boolean,
  ) => {
    // Definition text can be clipping geometry; it is not painted text. The
    // grammar has no <use>, so no other declaration can paint these descendants.
    if (
      element.tag === "defs" ||
      element.tag === "clipPath" ||
      element.tag === "linearGradient" ||
      element.tag === "radialGradient" ||
      element.tag === "stop"
    )
      return;
    const matrix = multiply(
      parentMatrix,
      transformMatrix(element.attributes.transform),
    );
    const fontSize = element.attributes.fontSize ?? inheritedFontSize;
    const textElement = element.tag === "text" || element.tag === "tspan";
    // A descendant with its own textLength controls its own adjustment; the
    // SVG default lengthAdjust is spacing, which preserves the glyph shapes.
    const glyphAdjustment =
      textElement && element.attributes.textLength !== undefined
        ? element.attributes.lengthAdjust === "spacingAndGlyphs"
        : unprovenGlyphAdjustment;
    const hasText = (element.children ?? []).some(
      (child) => typeof child === "string" && child.trim().length > 0,
    );
    if (hasText) {
      if (glyphAdjustment)
        throw new Error(
          `Continuity visual text at ${path} has unprovable glyph scaling [readability-text-length]. Remove textLength with lengthAdjust="spacingAndGlyphs" or use lengthAdjust="spacing"; font metrics are not frozen by this declaration.`,
        );
      const effectiveFontSizePx = fontSize * minimumScale(matrix);
      if (!Number.isFinite(effectiveFontSizePx))
        throw new Error(
          `Continuity visual text transform at ${path} cannot prove a finite pixel size [readability-transform]. Use finite, numerically bounded transforms for text and its ancestors.`,
        );
      // Ignore only floating-point roundoff from rotations at the exact limit.
      const tolerance =
        Number.EPSILON *
        16 *
        Math.max(1, effectiveFontSizePx, sceneViewport.minFontSizePx);
      if (effectiveFontSizePx + tolerance < sceneViewport.minFontSizePx)
        throw new Error(
          `Continuity visual text size ${effectiveFontSizePx}px at ${path} is below the frozen ${sceneViewport.minFontSizePx}px minimum [readability-font-minimum]. Increase its inherited fontSize or remove the shrinking viewBox/transform.`,
        );
    }
    for (const [index, child] of (element.children ?? []).entries()) {
      if (typeof child !== "string")
        visit(
          child,
          matrix,
          fontSize,
          `${path}.children[${index}]`,
          glyphAdjustment,
        );
    }
  };
  visual.elements.forEach((element, index) =>
    // Match the explicit root fontSize in the public SceneContinuityVisual.
    visit(element, viewportMatrix, 16, `elements[${index}]`, false),
  );
  return {
    viewportFingerprint: sceneViewport.viewportFingerprint,
    minimumEffectiveFontSizePx: sceneViewport.minFontSizePx,
  } as const;
};
