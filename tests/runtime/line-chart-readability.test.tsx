import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";
import LineChart from "../../packages/studio/src/remotion/capabilities/visual-components/charts/LineChart";

const Frame = ({ children }: { children: ReactNode }) => (
  <Internals.CanUseRemotionHooksProvider>
    <Internals.TimelineContext.Provider
      value={{
        frame: {},
        playing: false,
        rootId: "test",
        imperativePlaying: { current: false },
        audioAndVideoTags: { current: [] },
      }}
    >
      {children}
    </Internals.TimelineContext.Provider>
  </Internals.CanUseRemotionHooksProvider>
);

test("LineChart exposes readable typography and theme colors for video", () => {
  const markup = renderToStaticMarkup(
    <Frame>
      <LineChart
        data={[
          { label: "起点", value: 20 },
          { label: "终点", value: 100 },
        ]}
        title="实际变化"
        xLabelFontSize={36}
        yLabelFontSize={36}
        titleFontSize={48}
        labelColor="#302c28"
        titleColor="#302c28"
        axisColor="#8b8175"
        pointStrokeColor="#302c28"
        background="transparent"
      />
    </Frame>,
  );
  assert.equal((markup.match(/font-size="36"/gu) ?? []).length, 7);
  assert.equal((markup.match(/fill="#302c28"/gu) ?? []).length, 7);
  assert.equal((markup.match(/stroke="#8b8175"/gu) ?? []).length, 2);
  assert.match(markup, /font-size:48px/u);
  assert.match(markup, /color:#302c28/u);
  assert.match(markup, /实际变化/u);
  const yLabelX = Number(markup.match(/text-anchor="end" x="([\d.]+)"/u)?.[1]);
  assert.ok(yLabelX >= 36 * 3 * 0.65, "reserve space for three-digit y labels");
});

test("LineChart retains default typography for existing consumers", () => {
  const markup = renderToStaticMarkup(
    <Frame>
      <LineChart />
    </Frame>,
  );
  assert.match(markup, /font-size="12"/u);
  assert.match(markup, /font-size="13"/u);
  assert.match(markup, /font-size:28px/u);
});
