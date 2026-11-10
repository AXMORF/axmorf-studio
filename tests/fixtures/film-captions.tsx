import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";
import { FilmSpecSchema } from "@axmorf/studio/contracts";
import {
  FilmCaptions,
  type FilmCaptionsProps,
} from "../../packages/studio/src/remotion/film/FilmCaptions";
import {
  FilmProvider,
  resolveFilmRuntime,
  useFilmTiming,
} from "../../packages/studio/src/remotion/film/context";
import { buildFilmTiming } from "../../scripts/films/voice";

export const spoken = "这是八千四百一十五个H一百小时，乘每小时二点五美元。";
export const caption = "这是 8,415 个 H100 小时，乘每小时 $2.5。";
export const captionSpec = FilmSpecSchema.parse({
  schemaVersion: 1,
  filmId: "caption-test",
  render: { width: 1920, height: 1080, fps: 30 },
  timeline: { narrationStartFrame: 0 },
  narration: [{ id: "hours", text: spoken }],
  publish: { title: "Captions" },
});
export const captionTiming = buildFilmTiming({
  spec: captionSpec,
  sentenceSamples: [48_000],
  narration: null,
});
export const renderCaptionFixture = (
  props: FilmCaptionsProps = {},
  copy?: string,
  saved = captionTiming,
  width = 1920,
  height = 1080,
  frame = 0,
) => {
  const runtime = resolveFilmRuntime({
    spec: {
      ...captionSpec,
      render: { ...captionSpec.render, width, height },
      narration: [
        {
          ...captionSpec.narration[0],
          ...(copy === undefined ? {} : { caption: copy }),
        },
      ],
    },
    timing: saved,
    music: null,
  });
  const Timing = () => (
    <span data-timing={useFilmTiming().sentence("hours").caption} />
  );
  return renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.CompositionManagerProvider
        onlyRenderComposition={null}
        currentCompositionMetadata={null}
        initialCanvasContent={{ type: "composition", compositionId: "test" }}
        initialCompositions={[
          {
            id: "test",
            width,
            height,
            fps: 30,
            durationInFrames: 300,
            component: () => null,
            defaultProps: {},
            folderName: null,
            parentFolderName: null,
            nonce: [],
            schema: null,
            calculateMetadata: null,
            stack: null,
          },
        ]}
      >
        <Internals.TimelineContext.Provider
          value={{
            frame: { test: frame },
            playing: false,
            rootId: "test",
            imperativePlaying: { current: false },
            audioAndVideoTags: { current: [] },
          }}
        >
          <FilmProvider runtime={runtime}>
            <FilmCaptions {...props} />
            <Timing />
          </FilmProvider>
        </Internals.TimelineContext.Provider>
      </Internals.CompositionManagerProvider>
    </Internals.CanUseRemotionHooksProvider>,
  );
};
