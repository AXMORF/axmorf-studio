import { useLayoutEffect, useRef, type ReactNode } from "react";
import { continueRender, delayRender, useVideoConfig } from "remotion";

import {
  FILM_REVIEW_MAX_TEXTS,
  FILM_REVIEW_MEASUREMENT_MARKER,
  type FilmReviewMeasurement,
  type FilmReviewRect,
} from "../../contracts/film";

const visible = (element: Element) => {
  let opacity = 1;
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const style = getComputedStyle(current);
    if (style.display === "none") return false;
    opacity *= Number(style.opacity);
  }
  // Visibility can be overridden by descendants, unlike display and opacity.
  return getComputedStyle(element).visibility === "visible" && opacity >= 0.05;
};

const captionBlock = (element: Element, marker: Element) => {
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

const measure = (
  root: HTMLDivElement,
  width: number,
): Pick<FilmReviewMeasurement, "texts" | "truncated"> => {
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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: FilmReviewMeasurement["texts"] = [];
  let truncated = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const snippet = node.textContent?.replace(/\s+/gu, " ").trim().slice(0, 24);
    const element = node.parentElement;
    if (!snippet || !element || !visible(element)) continue;
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
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
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
      fontSize: fontSize * transformScale,
      rect: rectOf({ left, top, width: right - left, height: bottom - top }),
      ...(block && block.width > 0 && block.height > 0
        ? { captionRect: rectOf(block) }
        : {}),
    });
  }
  return { texts, truncated };
};

/** Mounted only by reviewLoader; the wrapper adds no painted content. */
export const ReviewMeasure = ({
  index,
  frame,
  children,
}: {
  readonly index: number;
  readonly frame: number;
  readonly children: ReactNode;
}) => {
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
        console.warn(
          `${FILM_REVIEW_MEASUREMENT_MARKER} ${JSON.stringify({ ...record, ...measure(root.current, width) })}`,
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
  }, [frame, height, index, width]);
  return (
    <div ref={root} style={{ position: "absolute", inset: 0 }}>
      {children}
    </div>
  );
};
