/** Host-only regression: npm run check:host. Uses the pinned Remotion browser. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { openBrowser } from "@remotion/renderer";
import type { measureFixture } from "../../tests/fixtures/foreground-browser";

const text =
  '<span id="text" style="position:absolute;left:100px;top:100px;font-size:50px;line-height:1">训练账单</span>';
const svg = (
  style: string,
  shape = '<path d="M90 90H320V170H90Z" fill="tan"/>',
) =>
  `<svg width="600" height="300" style="position:absolute;inset:0;${style}">${shape}</svg>`;
const html = (style: string) =>
  `<div style="position:absolute;left:90px;top:90px;width:230px;height:80px;background:tan;${style}"></div>`;
const cases = [
  {
    name: "SVG paper painted above a label is foreground",
    html: text + svg(""),
    covered: true,
  },
  {
    name: "SVG chip above text is detected even with pointer-events:none",
    html: text + svg("pointer-events:none!important"),
    covered: true,
  },
  {
    name: "HTML foreground and inherited pointer-events:none use native paint order",
    html: text + `<div style="pointer-events:none">${html("")}</div>`,
    covered: true,
  },
  {
    name: "z-index overrides DOM order for foreground HTML",
    html: html("z-index:2") + text,
    covered: true,
  },
  {
    name: "a narrow SVG intrusion is not suppressed by a percentage threshold",
    html:
      text +
      svg("", '<rect x="101" y="100" width="8" height="70" fill="tan"/>'),
    covered: true,
  },
  // Minimal reductions of the supplied films: both author the text above the art.
  {
    name: "v5 paper behind the label is not a foreground occluder",
    html: svg("") + text,
    covered: false,
  },
  {
    name: "v4 separate reading layer above the chip remains clear",
    html: svg("") + `<div style="position:absolute;inset:0">${text}</div>`,
    covered: false,
  },
  {
    name: "a compliant reading card ignores its own painted ancestor and the background",
    html:
      '<div style="position:absolute;inset:0;background:navy"><div style="position:absolute;inset:50px;background:tan">' +
      text +
      "</div></div>",
    covered: false,
  },
  {
    name: "AxiomMorph clipped glyphs in the same group do not cover one another",
    html:
      svg("") +
      `<div data-axmorf-text-group="axiom">${text.replace("line-height:1", "line-height:1;clip-path:inset(0 90% 0 0)")}${html("")}</div>`,
    covered: false,
  },
  {
    name: "NumberRoll glyphs in the same group retain external foreground detection",
    html:
      `<div data-axmorf-text-group="number">${text}${html("")}</div>` + svg(""),
    covered: true,
  },
  {
    name: "distinct groups with identical attribute values still occlude",
    html: `<div data-axmorf-text-group="same">${text}</div><div data-axmorf-text-group="same">${html("")}</div>`,
    covered: true,
  },
  {
    name: "unpainted SVG geometry cannot cover text",
    html:
      text +
      svg(
        "",
        '<rect x="90" y="90" width="230" height="80" fill="red" fill-opacity="0" stroke="none"/>',
      ),
    covered: false,
  },
  {
    name: "the empty SVG viewport does not cover text outside its path",
    html: text + svg("", '<circle cx="500" cy="220" r="15" fill="tan"/>'),
    covered: false,
  },
];

test("foreground sampler in a real host browser", async (context) => {
  const bundle = await build({
    entryPoints: [resolve("tests/fixtures/foreground-browser.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "axmorfForegroundTest",
    platform: "browser",
  });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE?.trim(),
  });
  try {
    const page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: 0,
      onBrowserLog: null,
      onLog: () => {},
    });
    await page.setViewport({ width: 600, height: 300, deviceScaleFactor: 1 });
    await page.evaluate(bundle.outputFiles[0].text);
    for (const fixture of cases)
      await context.test(fixture.name, async () => {
        const measurement = (await page.evaluate(
          `axmorfForegroundTest.measureFixture(${JSON.stringify(fixture.html)})`,
        )) as ReturnType<typeof measureFixture>;
        assert.ok(measurement.result, "text must be measured");
        assert.equal(measurement.result.covered > 0, fixture.covered);
        assert.equal(measurement.result.unknown, 0);
        assert.equal(
          measurement.restored,
          true,
          "hit-test overrides must be restored before capture",
        );
      });
  } finally {
    await browser.close({ silent: true });
  }
});
