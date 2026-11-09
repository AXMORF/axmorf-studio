import {
  foregroundSampler,
  measureReviewText,
} from "../../packages/studio/src/remotion/film/review-measure";

/** Runs in Chromium; no DOM mocks, so SVG paths, clipping and stacking are native. */
export const measureFixture = (html: string) => {
  document.body.innerHTML = `<div id="root" style="position:absolute;inset:0;width:600px;height:300px">${html}</div>`;
  const root = document.getElementById("root")!;
  const text = document.getElementById("text")!;
  const range = document.createRange();
  range.selectNodeContents(text);
  const elements = [root, ...root.querySelectorAll("*")];
  const before = elements.map(
    (element) => getComputedStyle(element).pointerEvents,
  );
  const result = foregroundSampler(root)(text, [...range.getClientRects()]);
  return {
    result,
    restored: elements.every(
      (element, i) => getComputedStyle(element).pointerEvents === before[i],
    ),
  };
};

export const measureReadabilityFixture = (html: string) => {
  document.body.innerHTML = `<div id="root" style="position:absolute;inset:0;width:600px;height:300px">${html}</div>`;
  return measureReviewText(
    document.getElementById("root") as HTMLDivElement,
    600,
    300,
  );
};
