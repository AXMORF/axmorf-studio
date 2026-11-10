import { useLayoutEffect, useRef, type ReactNode } from "react";
import { continueRender, delayRender, useVideoConfig } from "remotion";

import {
  FILM_REVIEW_MAX_TEXTS,
  FILM_REVIEW_FOREGROUND_COLUMNS,
  FILM_REVIEW_FOREGROUND_ROWS,
  FILM_REVIEW_FOREGROUND_OPACITY,
  type FilmReviewForeground,
  FILM_REVIEW_MOTION_MARKER,
  FILM_REVIEW_MEASUREMENT_MARKER,
  type FilmReviewMeasurement,
  type FilmReviewRect,
} from "../../contracts/film";

import { measureReviewGraphics } from "./review-graphics";
import { resolveFilmCaptionFontSize } from "./FilmCaptions";
import { useReviewMotionRegistry } from "./review-motion";

const effectiveOpacity = (element: Element) => {
  let opacity = 1;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = getComputedStyle(current);
    if (style.display === "none") return 0;
    opacity *= Number(style.opacity);
  }
  // Visibility can be overridden by descendants, unlike display and opacity.
  return getComputedStyle(element).visibility === "visible" ? opacity : 0;
};

// Hit testing sees transparent layout boxes too. Only painted leaves/backgrounds
// can cover text; svg/g viewport boxes and unpainted HTML wrappers cannot.
const painted = (element: Element) => {
  if (element instanceof SVGElement) {
    if (element instanceof SVGImageElement) return true;
    if (
      !(
        element instanceof SVGGeometryElement ||
        element instanceof SVGTextContentElement
      )
    )
      return false;
    const style = getComputedStyle(element);
    return (
      (style.fill !== "none" && Number(style.fillOpacity) > 0) ||
      (style.stroke !== "none" &&
        Number(style.strokeOpacity) > 0 &&
        Number.parseFloat(style.strokeWidth) > 0)
    );
  }
  const style = getComputedStyle(element);
  return (
    style.backgroundImage !== "none" ||
    !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor) ||
    ["IMG", "VIDEO", "CANVAS"].includes(element.tagName) ||
    [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
  );
};
const related = (a: Element, b: Element) => a.contains(b) || b.contains(a);

// Compare the nearest group element, not its attribute value: separate recipe
// instances (including nested groups) must still be able to occlude each other.
const sameTextGroup = (a: Element, b: Element) => {
  const group = a.closest("[data-axmorf-text-group]");
  return group !== null && group === b.closest("[data-axmorf-text-group]");
};

export const foregroundSampler = (root: Element) => {
  const opacityCache = new WeakMap<Element, number>();
  const opacity = (element: Element) => {
    if (!opacityCache.has(element))
      opacityCache.set(element, effectiveOpacity(element));
    return opacityCache.get(element)!;
  };
  // Temporarily enable native hit testing without changing paint or stacking.
  // This also covers inherited pointer-events:none and preserves SVG geometry.
  const skipped = [root, ...root.querySelectorAll("*")]
    .filter((element) => getComputedStyle(element).pointerEvents === "none")
    .filter(
      (element): element is HTMLElement | SVGElement =>
        element instanceof HTMLElement || element instanceof SVGElement,
    );
  return (
    element: Element,
    rects: readonly DOMRect[],
  ): FilmReviewForeground | undefined => {
    const restore = skipped.map((element) => ({
      element,
      value: element.style.getPropertyValue("pointer-events"),
      priority: element.style.getPropertyPriority("pointer-events"),
    }));
    for (const { element } of restore)
      element.style.setProperty("pointer-events", "auto", "important");
    const clippedGroup =
      element.closest("[data-axmorf-text-group]") !== null &&
      getComputedStyle(element).clipPath !== "none";
    let samples = 0,
      covered = 0,
      unknown = 0;
    try {
      const viewport = root.getBoundingClientRect();
      for (const rect of rects) {
        const left = Math.max(rect.left, viewport.left, 0);
        const top = Math.max(rect.top, viewport.top, 0);
        const right = Math.min(rect.right, viewport.right, window.innerWidth);
        const bottom = Math.min(
          rect.bottom,
          viewport.bottom,
          window.innerHeight,
        );
        if (right <= left || bottom <= top) continue;
        for (let row = 0; row < FILM_REVIEW_FOREGROUND_ROWS; row++) {
          for (
            let column = 0;
            column < FILM_REVIEW_FOREGROUND_COLUMNS;
            column++
          ) {
            const x =
              left +
              ((column + 0.5) * (right - left)) /
                FILM_REVIEW_FOREGROUND_COLUMNS;
            const y =
              top +
              ((row + 0.5) * (bottom - top)) / FILM_REVIEW_FOREGROUND_ROWS;
            const stack = document.elementsFromPoint(x, y);
            // A shared ancestor is not the text's paint position. In particular,
            // clipped AxiomMorph shards can miss the hit test entirely; treating
            // their ancestor as text falsely puts background graphics in front.
            const textIndex = stack.findIndex((hit) => element.contains(hit));
            // Range rectangles include the whole glyph, including clipped-out
            // shard regions where there is no text to cover.
            if (textIndex < 0 && clippedGroup) continue;
            samples++;
            if (textIndex < 0) {
              unknown++;
              continue;
            }
            if (
              stack
                .slice(0, textIndex)
                .some(
                  (hit) =>
                    root.contains(hit) &&
                    !related(element, hit) &&
                    !hit.closest("[data-axmorf-captions]") &&
                    !sameTextGroup(element, hit) &&
                    painted(hit) &&
                    opacity(hit) >= FILM_REVIEW_FOREGROUND_OPACITY,
                )
            )
              covered++;
          }
        }
      }
      return samples ? { samples, covered, unknown } : undefined;
    } finally {
      // Measurement is synchronous. Restore before Remotion captures the frame.
      for (const { element, value, priority } of restore) {
        if (value) element.style.setProperty("pointer-events", value, priority);
        else element.style.removeProperty("pointer-events");
      }
    }
  };
};

const captionBlock = (element: Element, marker: Element) => {
  const box = element.closest("[data-axmorf-caption-box]");
  if (box && marker.contains(box)) return box;
  let block = element;
  while (
    block.parentElement &&
    block.parentElement !== marker &&
    ["inline", "contents"].includes(getComputedStyle(block).display)
  ) {
    block = block.parentElement;
  }
  return block;
};

export const measureReviewText = (
  root: HTMLDivElement,
  width: number,
  height: number,
): Pick<FilmReviewMeasurement, "texts" | "truncated" | "captionFontSize"> => {
  const origin = root.getBoundingClientRect();
  // Remove only Remotion's outer preview scale, retaining authored transforms.
  // CLI --scale changes deviceScaleFactor, not these CSS composition coordinates.
  const scale = origin.width / width;
  const rectOf = (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): FilmReviewRect => ({
    x: (rect.left - origin.left) / scale,
    y: (rect.top - origin.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  });
  const foreground = foregroundSampler(root);
  // Normalize computed CSS/SVG colors through the browser, including color().
  // This detached canvas never changes the rendered frame.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const colors = canvas.getContext("2d", { willReadFrequently: true });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: FilmReviewMeasurement["texts"] = [];
  let truncated = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const snippet = node.textContent?.replace(/\s+/gu, " ").trim().slice(0, 24);
    const element = node.parentElement;
    if (!snippet || !element || effectiveOpacity(element) < 0.05) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0,
    );
    if (!rects.length) continue;
    if (texts.length === FILM_REVIEW_MAX_TEXTS) {
      truncated = true;
      break;
    }
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    let color: FilmReviewMeasurement["texts"][number]["color"];
    const fill =
      element instanceof SVGElement ? style.fill : style.webkitTextFillColor;
    if (colors && CSS.supports("color", fill)) {
      colors.clearRect(0, 0, 1, 1);
      colors.fillStyle = fill;
      colors.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colors.getImageData(0, 0, 1, 1).data;
      const alpha =
        (a / 255) *
        effectiveOpacity(element) *
        (element instanceof SVGElement ? Number(style.fillOpacity) : 1);
      if (alpha > 0) color = [r, g, b, Math.min(1, alpha)];
    }
    const textGroup = element.closest("[data-axmorf-text-group]");
    let transformScale = 1;
    if (element instanceof SVGGraphicsElement) {
      const matrix = element.getScreenCTM();
      if (matrix)
        transformScale =
          Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) /
          scale;
    } else {
      // Inline/contents nodes can have no offsetHeight. The nearest laid-out
      // HTML ancestor still includes the accumulated ancestor transform scale.
      let box: Element | null = element;
      while (box && (!(box instanceof HTMLElement) || box.offsetHeight === 0))
        box = box.parentElement;
      if (box instanceof HTMLElement)
        transformScale =
          box.getBoundingClientRect().height / box.offsetHeight / scale;
    }
    const marker = element.closest("[data-axmorf-captions]");
    const block = marker
      ? captionBlock(element, marker).getBoundingClientRect()
      : null;
    texts.push({
      snippet,
      caption: marker !== null,
      ...(element.closest("[data-axmorf-status-tag]")
        ? { statusTag: true }
        : {}),
      ...(marker ? {} : { foreground: foreground(element, rects) }),
      fontSize: fontSize * transformScale,
      ...(color ? { color } : {}),
      ...(textGroup
        ? {
            textGroup: (
              textGroup.getAttribute("data-axmorf-text-group") || "text-group"
            ).slice(0, 80),
          }
        : {}),
      rect: rectOf({ left, top, width: right - left, height: bottom - top }),
      ...(block && block.width > 0 && block.height > 0
        ? { captionRect: rectOf(block) }
        : {}),
    });
  }
  const captions = texts.filter((text) => text.caption);
  return {
    texts,
    truncated,
    captionFontSize: captions.length
      ? Math.max(...captions.map((text) => text.fontSize))
      : resolveFilmCaptionFontSize(width, height),
  };
};

/** Mounted only by reviewLoader; the wrapper adds no painted content. */
export const ReviewMeasure = ({
  index,
  frame,
  children,
  readability = true,
}: {
  readonly readability?: boolean;
  readonly index: number;
  readonly frame: number;
  readonly children: ReactNode;
}) => {
  const motion = useReviewMotionRegistry();
  const root = useRef<HTMLDivElement>(null);
  const { width, height } = useVideoConfig();
  useLayoutEffect(() => {
    // Acquire only after commit: React can discard a render while Remotion
    // seeks to another frame, leaving a render-time handle without cleanup.
    const handle = delayRender("Measuring review readability");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const record = {
      index,
      frame,
      width,
      height,
      texts: [],
      truncated: false,
    } satisfies FilmReviewMeasurement;
    const run = async () => {
      try {
        await Promise.race([
          (async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            );
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(new Error("Review layout did not settle within 10s.")),
              10_000,
            );
          }),
        ]);
        if (cancelled) return;
        if (!root.current)
          throw new Error("Review measurement container is missing.");
        if (motion)
          console.warn(
            `${FILM_REVIEW_MOTION_MARKER} ${JSON.stringify({ index, frame, events: [...motion.events.values()], truncated: motion.truncated })}`,
          );
        if (readability)
          console.warn(
            `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify({
              ...record,
              ...(motion &&
              [...motion.events.values()].some(
                (event) =>
                  event.type === "scene-track" &&
                  event.scenes.some(
                    ({ enter }) =>
                      enter !== null &&
                      frame >= enter.startFrame &&
                      frame < enter.endFrame,
                  ),
              )
                ? { transitionWindow: true }
                : {}),
              ...measureReviewText(root.current, width, height),
              graphics: measureReviewGraphics(root.current, width, height),
            })}`,
          );
      } catch (error) {
        if (!cancelled)
          console.warn(
            `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify({ ...record, error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000) || "Review measurement failed." })}`,
          );
      } finally {
        clearTimeout(timer);
        continueRender(handle);
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      continueRender(handle);
    };
  }, [frame, height, index, width, motion, readability]);
  return (
    <div ref={root} style={{ position: "absolute", inset: 0 }}>
      {children}
    </div>
  );
};
