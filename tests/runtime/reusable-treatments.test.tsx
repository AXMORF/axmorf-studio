import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";
import type { ReactNode } from "react";
import WhipPan from "../../packages/studio/src/remotion/capabilities/visual-components/cinematic/WhipPan";
import NoiseGrain from "../../packages/studio/src/remotion/capabilities/visual-components/backgrounds/NoiseGrain";

const render = (children: ReactNode, frame = 0) =>
  renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: { test: frame },
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        <Internals.SequenceContext.Provider
          value={{
            absoluteFrom: -frame,
            cumulatedFrom: 0,
            cumulatedNegativeFrom: 0,
            relativeFrom: -frame,
            parentFrom: 0,
            durationInFrames: 300,
            id: "test",
            width: 900,
            height: 1200,
            premounting: false,
            postmounting: false,
            premountDisplay: null,
            postmountDisplay: null,
          }}
        >
          {children}
        </Internals.SequenceContext.Provider>
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );

test("WhipPan uses authored content and local timing without demo words, backgrounds or text scaling", () => {
  const clip = (
    <WhipPan
      from={<span>Cause</span>}
      to={<span>Consequence</span>}
      startFrame={10}
      durationInFrames={20}
    />
  );
  const before = render(clip, 0);
  const middle = render(clip, 20);
  const after = render(clip, 40);
  assert.match(before, /Cause/u);
  assert.match(after, /Consequence/u);
  for (const markup of [before, middle, after])
    assert.doesNotMatch(markup, /Scene A|Blue content|background|scaleX/u);
  assert.notEqual(before, middle);
  assert.notEqual(middle, after);
  assert.equal(after, render(clip, 80));
});

test("NoiseGrain is a deterministic transparent overlay with bounded DOM size", () => {
  const grain = <NoiseGrain opacity={0.12} seed={7} holdFrames={2} />;
  const first = render(grain, 0);
  assert.equal(first, render(grain, 0));
  assert.equal(first, render(grain, 1));
  assert.notEqual(first, render(grain, 2));
  assert.match(first, /opacity:0.12/u);
  assert.doesNotMatch(
    first,
    /Film Grain|Subtle noise|linear-gradient|background/u,
  );
  assert.ok((first.match(/<rect/gu) ?? []).length <= 1);
  assert.throws(() => render(<NoiseGrain holdFrames={0} />), /holdFrames/u);
  assert.throws(
    () => render(<WhipPan durationInFrames={0} />),
    /durationInFrames/u,
  );
});
