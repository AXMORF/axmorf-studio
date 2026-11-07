import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";

import { FilmStatusTag } from "../../packages/studio/src/remotion/film/FilmStatusTag";
import { resolveFilmCaptionFontSize } from "../../packages/studio/src/remotion/film/FilmCaptions";
import { minimumReadableFontSize } from "@axmorf/studio/contracts";
import type { FilmStatusTagProps } from "../../packages/studio/src/remotion/film/FilmStatusTag";

const render = (width: number, height: number, props: FilmStatusTagProps) =>
  renderToStaticMarkup(
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
        <FilmStatusTag {...props} />
      </Internals.CompositionManagerProvider>
    </Internals.CanUseRemotionHooksProvider>,
  );

test("FilmStatusTag scales with the canvas and keeps status and detail in the same readable style", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1080, 1920],
    [640, 480],
  ]) {
    const html = render(width, height, {
      status: "self-reported",
      detail: "机制示意",
    });
    const size = Number(html.match(/font-size:(\d+)px/)?.[1]);
    assert.equal(size, resolveFilmCaptionFontSize(width, height));
    assert.ok(size >= minimumReadableFontSize(width, height));
    assert.match(html, /data-axmorf-status-tag=""/);
    assert.match(html, /<span>作者自报<\/span><span>机制示意<\/span>/);
    assert.match(html, /background-color:#101c28/);
  }
});

test("FilmStatusTag maps all known statuses and preserves custom text and style overrides", () => {
  for (const [status, label] of Object.entries({
    observed: "已发生",
    signal: "迹象",
    speculation: "推测",
    candidate: "候选·待验证",
    opinion: "社区观点",
    "self-reported": "作者自报",
  }))
    assert.match(
      render(1920, 1080, { status }),
      new RegExp(`<span>${label}</span>`),
    );
  for (const status of ["旧公理", "constructor", "toString"])
    assert.ok(
      render(1920, 1080, { status }).includes(`<span>${status}</span>`),
    );
  const html = render(1920, 1080, {
    status: "signal",
    position: "top-right",
    style: { fontSize: 60, right: 100 },
  });
  assert.match(html, /right:100px/);
  assert.match(html, /font-size:60px/);
  assert.doesNotMatch(html, /left:\d+px/);
});
