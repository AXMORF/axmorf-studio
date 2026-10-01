import { useLayoutEffect } from "react";
import {
  Composition,
  continueRender,
  delayRender,
  registerRoot,
  useCurrentFrame,
} from "remotion";
import { resolveSceneReadabilityPolicy } from "../../packages/studio/src/contracts/scene-readability";
import { CaptionLayer } from "../../packages/studio/src/remotion/runtime/narrative-core/CaptionLayer";
import {
  MeaningIdSchema,
  TtsChunkIdSchema,
} from "../../packages/studio/src/contracts/primitives";

const policy = resolveSceneReadabilityPolicy({ width: 1080, height: 1920 });
const Captions = ({
  captions,
  balanced,
}: {
  captions: string[];
  balanced: boolean;
}) => {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    const handle = delayRender(
      "Measure caption after Composition viewport layout",
    );
    let scheduled = 0;
    let attempts = 0;
    const measure = () => {
      const node = document.querySelector("[data-caption-max-lines]");
      if (!(node instanceof HTMLElement) || !node.firstChild) {
        continueRender(handle);
        return;
      }
      const initial = node.getBoundingClientRect();
      if (initial.top < 0 || initial.width < 500) {
        if (++attempts < 120) {
          scheduled = requestAnimationFrame(measure);
          return;
        }
        continueRender(handle);
        return;
      }
      if (!balanced) node.style.textWrap = "wrap";
      const text = node.firstChild;
      const lines = new Map<number, string>();
      for (let index = 0; index < (text.textContent?.length ?? 0); index++) {
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const y = Math.round(range.getBoundingClientRect().top);
        lines.set(y, (lines.get(y) ?? "") + text.textContent![index]);
      }
      const rect = node.getBoundingClientRect();
      console.log(
        "CAPTION_LAYOUT:" +
          JSON.stringify({
            frame,
            lines: [...lines.values()],
            rect: {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            },
            fontSize: getComputedStyle(node).fontSize,
            textWrap: getComputedStyle(node).textWrap,
          }),
      );
      continueRender(handle);
    };
    scheduled = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(scheduled);
      continueRender(handle);
    };
  }, [frame, balanced]);
  return (
    <CaptionLayer
      safeAreaPx={policy.captionSafeAreaPx}
      readabilityPolicy={policy}
      captionCues={captions.map((text, index) => ({
        chunkId: TtsChunkIdSchema.parse(`proof-${index}`),
        meaningId: MeaningIdSchema.parse("caption-proof"),
        startFrame: index,
        endFrame: index + 1,
        text,
      }))}
    />
  );
};
const Root = () => (
  <Composition
    id="CaptionWrapRegression"
    component={Captions}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={26}
    defaultProps={{ captions: Array(26).fill("字幕验证"), balanced: true }}
  />
);
registerRoot(Root);
