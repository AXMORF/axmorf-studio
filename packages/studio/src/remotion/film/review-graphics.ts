import {
  FILM_REVIEW_MAX_OBJECTS,
  type FilmReviewGraphics,
  type FilmReviewRect,
} from "../../contracts/film";

const EXCLUDED =
  "[data-axmorf-captions], [data-axmorf-status-tag], [data-axmorf-text-group], .axmorf-review-overlay, defs, clipPath, mask, pattern, marker";

const intersect = (a: FilmReviewRect, b: FilmReviewRect): FilmReviewRect => ({
  x: Math.max(a.x, b.x),
  y: Math.max(a.y, b.y),
  width: Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  ),
  height: Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  ),
});
const union = (a: FilmReviewRect, b: FilmReviewRect): FilmReviewRect => {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** Review-only DOM geometry, in delivered pixels. Never mutates painted content.
 * Bounds are clipped to the viewport and overflow/inset ancestors, not silhouettes
 * or a claim about meaning. Complex masks/clips remain explicitly unknown. */
export const measureReviewGraphics = (
  root: HTMLDivElement,
  width: number,
  height: number,
): FilmReviewGraphics => {
  const origin = root.getBoundingClientRect();
  const scale = origin.width / width;
  if (!(scale > 0)) throw new Error("Review graphic viewport has no size.");
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const styleOf = (element: Element) => {
    if (!styles.has(element)) styles.set(element, getComputedStyle(element));
    return styles.get(element)!;
  };
  const unknown = new Set<string>();
  const note = (reason: string) => {
    if (unknown.size < 20) unknown.add(reason);
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const colors = canvas.getContext("2d", { willReadFrequently: true });
  if (!colors) note("Graphic paint alpha is unavailable; inspect the frame.");
  const hasColor = (color: string) => {
    if (color === "none" || color === "transparent") return false;
    if (!colors || !CSS.supports("color", color)) return true;
    colors.clearRect(0, 0, 1, 1);
    colors.fillStyle = color;
    colors.fillRect(0, 0, 1, 1);
    return colors.getImageData(0, 0, 1, 1).data[3] > 0;
  };
  const rectOf = (element: Element): FilmReviewRect => {
    const rect = element.getBoundingClientRect();
    return {
      x: (rect.left - origin.left) / scale,
      y: (rect.top - origin.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };
  const visible = (element: Element) => {
    if (styleOf(element).visibility !== "visible") return false;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = styleOf(node);
      if (
        style.display === "none" ||
        Number(style.opacity) === 0 ||
        style.contentVisibility === "hidden"
      )
        return false;
    }
    return true;
  };
  const painted = (element: Element) => {
    const style = styleOf(element);
    if (element instanceof SVGElement) {
      if (element instanceof SVGImageElement) return true;
      if (
        !(
          element instanceof SVGGeometryElement ||
          element instanceof SVGUseElement
        )
      )
        return false;
      return (
        (Number(style.fillOpacity) > 0 && hasColor(style.fill)) ||
        (Number(style.strokeOpacity) > 0 &&
          Number.parseFloat(style.strokeWidth) > 0 &&
          hasColor(style.stroke))
      );
    }
    return (
      ["IMG", "VIDEO", "CANVAS"].includes(element.tagName) ||
      style.backgroundImage !== "none" ||
      hasColor(style.backgroundColor) ||
      ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          Number.parseFloat(
            style.getPropertyValue(`border-${side.toLowerCase()}-width`),
          ) > 0 &&
          hasColor(
            style.getPropertyValue(`border-${side.toLowerCase()}-color`),
          ),
      )
    );
  };
  const clipped = (element: Element) => {
    let rect = rectOf(element);
    // getBoundingClientRect omits SVG strokes (including horizontal/vertical lines).
    const style = styleOf(element);
    if (
      element instanceof SVGGraphicsElement &&
      hasColor(style.stroke) &&
      Number(style.strokeOpacity) > 0
    ) {
      const matrix = element.getScreenCTM();
      const stroke = Number.parseFloat(style.strokeWidth) / 2;
      if (matrix && stroke > 0) {
        const dx = (stroke * Math.hypot(matrix.a, matrix.c)) / scale;
        const dy = (stroke * Math.hypot(matrix.b, matrix.d)) / scale;
        rect = {
          x: rect.x - dx,
          y: rect.y - dy,
          width: rect.width + 2 * dx,
          height: rect.height + 2 * dy,
        };
      }
    }
    for (
      let node: Element | null = element;
      node && root.contains(node);
      node = node.parentElement
    ) {
      const style = styleOf(node);
      const box = rectOf(node);
      if (node !== element) {
        const x = ["hidden", "clip", "scroll", "auto"].includes(
          style.overflowX,
        );
        const y = ["hidden", "clip", "scroll", "auto"].includes(
          style.overflowY,
        );
        if (x || y)
          rect = intersect(rect, {
            x: x ? box.x : rect.x,
            y: y ? box.y : rect.y,
            width: x ? box.width : rect.width,
            height: y ? box.height : rect.height,
          });
      }
      if (style.clipPath !== "none") {
        const match = /^inset\(([^)]+)\)$/u.exec(style.clipPath);
        const values = match?.[1].split(/\s+round\s+/u)[0].split(/\s+/u);
        if (
          values?.length &&
          values.length <= 4 &&
          values.every((value) => /^-?[\d.]+(?:px|%)$/u.test(value))
        ) {
          const [t, r = t, b = t, l = r] = values;
          // CSS inset px are local to the element, while box is already in
          // delivered pixels. Retain authored scaling and remove preview scale.
          const localWidth =
            node instanceof HTMLElement ? node.offsetWidth : box.width;
          const localHeight =
            node instanceof HTMLElement ? node.offsetHeight : box.height;
          const inset = (value: string, size: number, localSize: number) =>
            Number.parseFloat(value) *
            (value.endsWith("%") ? size / 100 : size / (localSize || size));
          const top = inset(t, box.height, localHeight),
            right = inset(r, box.width, localWidth),
            bottom = inset(b, box.height, localHeight),
            left = inset(l, box.width, localWidth);
          rect = intersect(rect, {
            x: box.x + left,
            y: box.y + top,
            width: Math.max(0, box.width - left - right),
            height: Math.max(0, box.height - top - bottom),
          });
        } else
          note("Complex clip-path: graphic bounds require frame inspection.");
      }
      if (style.maskImage !== "none")
        note("Masked graphics: visible paint requires frame inspection.");
    }
    return intersect(rect, { x: 0, y: 0, width, height });
  };
  const nodes = [root, ...root.querySelectorAll("*")];
  const annotations = nodes.filter(
    (node) =>
      node.hasAttribute("data-axmorf-object") && !node.closest(EXCLUDED),
  );
  const meta = new Map<
    Element,
    Omit<FilmReviewGraphics["objects"][number], "rect">
  >();
  let truncated = annotations.length > FILM_REVIEW_MAX_OBJECTS;
  for (const [id, node] of annotations
    .slice(0, FILM_REVIEW_MAX_OBJECTS)
    .entries()) {
    const label = node.getAttribute("data-axmorf-object")!.trim();
    const role = node.getAttribute("data-axmorf-object-role") ?? "subject";
    const kind = node.getAttribute("data-axmorf-object-kind") ?? "prop";
    if (
      !label ||
      label.length > 160 ||
      !["subject", "relation", "background"].includes(role) ||
      !["illustration", "diagram", "prop", "card"].includes(kind)
    ) {
      note(
        "Invalid graphic annotation: use a meaning (1–160 characters) subject/relation/background role, and illustration/diagram/prop/card kind.",
      );
      continue;
    }
    meta.set(node, {
      id,
      label,
      role: role as "subject" | "relation" | "background",
      kind: kind as "illustration" | "diagram" | "prop" | "card",
      ancestors: [],
    });
  }
  for (const [node, object] of meta)
    for (
      let parent = node.parentElement;
      parent && root.contains(parent);
      parent = parent.parentElement
    )
      if (meta.has(parent)) object.ancestors.push(meta.get(parent)!.id);
  const bounds = new Map<Element, FilmReviewRect>();
  let unlabeledArea = 0,
    unlabeledCount = 0;
  // Bound traversal too: unmeasured art must be unknown rather than silently pass.
  const maxNodes = 10_000;
  if (nodes.length > maxNodes) truncated = true;
  for (const node of nodes.slice(0, maxNodes)) {
    if (node.closest(EXCLUDED) || !visible(node) || !painted(node)) continue;
    const rect = clipped(node);
    if (!(rect.width > 0 && rect.height > 0)) continue;
    let labeled = false;
    for (
      let parent: Element | null = node;
      parent && root.contains(parent);
      parent = parent.parentElement
    ) {
      if (!meta.has(parent)) continue;
      labeled = true;
      bounds.set(
        parent,
        bounds.has(parent) ? union(bounds.get(parent)!, rect) : rect,
      );
    }
    if (labeled) continue;
    // Plain full-frame background plates are not unexplained subjects. A path's
    // full-frame bounding box alone does not make it a background (e.g. a zigzag).
    const fullFrame =
      rect.x <= 0 &&
      rect.y <= 0 &&
      rect.width >= width &&
      rect.height >= height;
    if (
      fullFrame &&
      (!(node instanceof SVGElement) || node instanceof SVGRectElement)
    )
      continue;
    unlabeledArea += rect.width * rect.height;
    unlabeledCount++;
  }
  return {
    objects: [...bounds].map(([node, rect]) => ({ ...meta.get(node)!, rect })),
    unlabeledArea,
    unlabeledCount,
    truncated,
    unknown: [...unknown],
  };
};
