/** Host-only regression: npm run check:host. Uses the pinned Remotion browser. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { openBrowser } from "@remotion/renderer";
import type {
  measureFixture,
  measureReadabilityFixture,
} from "../../tests/fixtures/foreground-browser";
import { readReviewFramePixels } from "../films/frame-compare";
import { measureTextContrast } from "../films/text-contrast";

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

test("contrast telemetry and actual rendered pixels in a real host browser", async (context) => {
  const bundle = await build({
    entryPoints: [resolve("tests/fixtures/foreground-browser.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "axmorfContrastTest",
    platform: "browser",
  });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE?.trim(),
  });
  const scratch = await mkdtemp(join(tmpdir(), "contrast-browser-"));
  const label = (style: string) =>
    `<span style="position:absolute;left:80px;top:70px;font:50px/1 sans-serif;${style}">训练账单</span>`;
  const background = (fill: string) =>
    `<div style="position:absolute;inset:0;background:${fill}"></div>`;
  const fixtures = [
    {
      name: "dark text over a dark background",
      html: background("#282828") + label("color:#141414"),
      low: true,
    },
    {
      name: "the label straddles paper and a dark room",
      html:
        background("linear-gradient(#282828 95px,#f5f5f5 95px)") +
        label("color:#141414"),
      low: true,
    },
    {
      name: "a painted dark plate cannot exempt dark text",
      html: background("#fff") + label("color:#141414;background:#282828"),
      low: true,
    },
    {
      name: "a light plate supports dark text",
      html: background("#282828") + label("color:#141414;background:#f5f5f5"),
      low: false,
    },
    {
      name: "an actual dark stroke supports white text on white",
      html:
        background("#fff") + label("color:#fff;-webkit-text-stroke:3px #000"),
      low: false,
    },
    {
      name: "a faint shadow cannot exempt white-on-white",
      html:
        background("#fff") + label("color:#fff;text-shadow:1px 1px 1px #ccc"),
      low: true,
    },
    {
      name: "SVG uses its computed fill rather than inherited color",
      html:
        background("#282828") +
        '<svg width="600" height="300" style="color:white"><text x="80" y="120" font-size="50" fill="#141414">训练账单</text></svg>',
      low: true,
    },
    {
      name: "grouped morphs are measured and retain their marker",
      html:
        background("#282828") +
        '<div data-axmorf-text-group="axiom-morph">' +
        label("color:#141414;clip-path:inset(0 50% 0 0)") +
        "</div>",
      low: true,
      group: "axiom-morph",
    },
    {
      name: "ancestor opacity reduces actual contrast",
      html:
        background("#fff") +
        '<div style="opacity:.1">' +
        label("color:#141414") +
        "</div>",
      low: true,
    },
  ];
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
    for (const [index, fixture] of fixtures.entries())
      await context.test(fixture.name, async () => {
        const telemetry = (await page.evaluate(
          `axmorfContrastTest.measureReadabilityFixture(${JSON.stringify(fixture.html)})`,
        )) as ReturnType<typeof measureReadabilityFixture>;
        const shot = await page
          ._client()
          .send("Page.captureScreenshot", { format: "png" });
        const imagePath = join(scratch, `${index}.png`);
        await writeFile(imagePath, Buffer.from(shot.value.data, "base64"));
        const image = await readReviewFramePixels({
          rootDir: process.cwd(),
          imagePath,
          pixelsPath: join(scratch, `${index}.png`),
        });
        assert.equal(telemetry.texts.length, 1);
        const text = telemetry.texts[0];
        assert.ok(text.color, "computed fill must be measured");
        assert.equal(text.textGroup, fixture.group);
        const measured = measureTextContrast({
          text,
          image,
          width: 600,
          height: 300,
        });
        assert.equal(measured.unknown, undefined);
        assert.ok(measured.worst);
        assert.equal(
          measured.worst.contrastRatio < 3,
          fixture.low,
          JSON.stringify(measured),
        );
      });
  } finally {
    await browser.close({ silent: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("semantic graphics in a real host browser", async (context) => {
  const { analyzeReviewGraphics } = await import("../films/graphics");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { GraphicReviewArtwork } =
    await import("../../packages/studio/src/remotion/compositions/capability-gallery/GraphicReviewGallery");
  type GraphicsFixture =
    typeof import("../../tests/fixtures/foreground-browser").measureGraphicsFixture;
  const bundle = await build({
    entryPoints: [resolve("tests/fixtures/foreground-browser.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "axmorfGraphicsTest",
    platform: "browser",
  });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE?.trim(),
  });
  const box = (attrs = "", style = "") =>
    `<div ${attrs} style="position:absolute;left:80px;top:70px;width:200px;height:150px;background:tan;${style}"></div>`;
  try {
    const page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: 0,
      onBrowserLog: null,
      onLog: () => {},
    });
    await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
    await page.evaluate(bundle.outputFiles[0].text);
    const measure = async (html: string, width = 600, height = 300) =>
      (await page.evaluate(
        `axmorfGraphicsTest.measureGraphicsFixture(${JSON.stringify(html)},${width},${height})`,
      )) as ReturnType<GraphicsFixture>;
    await context.test(
      "gallery calibration: compliant has no hints; counterexample reports all three",
      async () => {
        for (const invalid of [false, true]) {
          const html = renderToStaticMarkup(
            createElement(GraphicReviewArtwork, { invalid }),
          );
          const graphics = await measure(html, 960, 540);
          const result = analyzeReviewGraphics({
            records: [
              {
                index: 0,
                frame: 10,
                width: 960,
                height: 540,
                texts: [],
                truncated: false,
                graphics,
              },
            ],
            frames: [10],
            width: 960,
            height: 540,
          });
          assert.deepEqual(result.graphics.unknown, []);
          assert.deepEqual(
            result.graphicWarnings.map((w) => w.rule).sort(),
            invalid
              ? ["graphic-overlap", "too-many-subjects", "unlabeled-graphic"]
              : [],
          );
          assert.equal(
            graphics.objects.filter((o) => o.role === "subject").length,
            invalid ? 4 : 2,
          );
        }
      },
    );
    await context.test(
      "text-card gallery calibrates measured kinds, visible subjects and consecutive sample ranges",
      async () => {
        const { TextCardReviewArtwork } =
          await import("../../packages/studio/src/remotion/compositions/capability-gallery/TextCardReviewGallery");
        for (const cardOnly of [false, true]) {
          const graphics = await measure(
            renderToStaticMarkup(
              createElement(TextCardReviewArtwork, { cardOnly }),
            ),
            960,
            540,
          );
          const frames = [0, 10, 20, 29];
          const result = analyzeReviewGraphics({
            records: frames.map((frame, index) => ({
              index,
              frame,
              width: 960,
              height: 540,
              texts: [],
              truncated: false,
              graphics,
            })),
            frames,
            width: 960,
            height: 540,
          });
          assert.deepEqual(result.graphics.unknown, []);
          assert.deepEqual(
            result.graphicWarnings.map((w) => w.rule),
            cardOnly ? ["text-card-only"] : [],
          );
          if (cardOnly) {
            assert.deepEqual(result.graphicWarnings[0].frames, [0, 29]);
            assert.deepEqual(result.graphicWarnings[0].sampledFrames, frames);
          }
          const hidden = await measure(
            renderToStaticMarkup(
              createElement(TextCardReviewArtwork, { cardOnly: true }),
            ) +
              box(
                'data-axmorf-object="hidden diagram" data-axmorf-object-kind="diagram"',
                "opacity:0",
              ),
            960,
            540,
          );
          assert.ok(
            hidden.objects
              .filter((o) => o.role === "subject")
              .every((o) => o.kind === "card"),
          );
        }
        const legacy = await measure(box('data-axmorf-object="legacy prop"'));
        assert.equal(legacy.objects[0].kind, "prop");
        for (const kind of ["illustration", "diagram", "prop", "card"])
          assert.equal(
            (
              await measure(
                box(
                  `data-axmorf-object="kind" data-axmorf-object-kind="${kind}"`,
                ),
              )
            ).objects[0].kind,
            kind,
          );
        const invalid = await measure(
          box('data-axmorf-object="invalid" data-axmorf-object-kind="other"'),
        );
        assert.ok(invalid.unknown.length);
        assert.equal(invalid.objects.length, 0);
      },
    );
    await context.test(
      "group bounds use painted geometry, not full-frame SVG/HTML wrappers or text",
      async () => {
        const graphics = await measure(
          `<div data-axmorf-object="电表" style="position:absolute;inset:0"><svg width="600" height="300"><g><rect x="100" y="50" width="80" height="90" fill="tan"/></g><text x="10" y="240">outside label</text></svg></div>`,
        );
        assert.deepEqual(graphics.objects[0].rect, {
          x: 100,
          y: 50,
          width: 80,
          height: 90,
        });
        assert.equal(graphics.unlabeledArea, 0);
      },
    );
    await context.test(
      "opacity zero, hidden ancestors, display none, offscreen and transparent paint are omitted",
      async () => {
        for (const style of [
          "opacity:0",
          "display:none",
          "visibility:hidden",
          "left:700px",
          "background:rgba(0,0,0,0)",
        ])
          assert.equal(
            (await measure(box('data-axmorf-object="hidden"', style))).objects
              .length,
            0,
            style,
          );
        const graphics = await measure(
          `<div style="opacity:0">${box('data-axmorf-object="hidden"')}</div><svg width="600" height="300"><rect width="200" height="200" fill="transparent"/><rect width="200" height="200" fill-opacity="0"/></svg>`,
        );
        assert.equal(graphics.objects.length, 0);
        assert.equal(graphics.unlabeledArea, 0);
        assert.equal(
          (await measure(box('data-axmorf-object="faint"', "opacity:.01")))
            .objects.length,
          1,
        );
      },
    );
    await context.test(
      "viewport, overflow and inset clipping bound only the visible portion",
      async () => {
        const partial = await measure(
          box('data-axmorf-object="cropped"', "left:-50px;top:-20px"),
        );
        assert.deepEqual(partial.objects[0].rect, {
          x: 0,
          y: 0,
          width: 150,
          height: 130,
        });
        const overflow = await measure(
          `<div style="position:absolute;left:100px;top:100px;width:40px;height:50px;overflow:hidden">${box('data-axmorf-object="hidden"')}</div>`,
        );
        assert.equal(overflow.objects.length, 0);
        const clip = await measure(
          box('data-axmorf-object="clipped"', "clip-path:inset(0 50% 0 0)"),
        );
        assert.deepEqual(clip.objects[0].rect, {
          x: 80,
          y: 70,
          width: 100,
          height: 150,
        });
        const scaled = await measure(
          box(
            'data-axmorf-object="scaled"',
            "transform:scale(2);transform-origin:0 0;clip-path:inset(25px 50px)",
          ),
        );
        assert.deepEqual(scaled.objects[0].rect, {
          x: 180,
          y: 120,
          width: 200,
          height: 180,
        });
        assert.equal(
          (
            await measure(
              box('data-axmorf-object="hidden"', "clip-path:inset(100%)"),
            )
          ).objects.length,
          0,
        );
      },
    );
    await context.test(
      "nested annotations retain ancestry; relation and background roles stay distinct",
      async () => {
        const graphics = await measure(
          `<div data-axmorf-object="电表">${box('data-axmorf-object="指针"')}<svg width="600" height="300"><line data-axmorf-object="用量换算" data-axmorf-object-role="relation" x1="300" y1="100" x2="500" y2="100" stroke="red" stroke-width="6"/></svg></div>${box('data-axmorf-object="木桌" data-axmorf-object-role="background"')}`,
        );
        const parent = graphics.objects.find((o) => o.label === "电表")!;
        assert.ok(
          graphics.objects
            .find((o) => o.label === "指针")!
            .ancestors.includes(parent.id),
        );
        assert.equal(
          graphics.objects.find((o) => o.label === "用量换算")!.role,
          "relation",
        );
        assert.ok(
          graphics.objects.find((o) => o.label === "用量换算")!.rect.height > 0,
          "SVG stroke has visible area even for a horizontal line",
        );
        assert.equal(
          graphics.objects.find((o) => o.label === "木桌")!.role,
          "background",
        );
      },
    );
    await context.test(
      "unlabeled SVG paint and HTML backgrounds/borders count; text, system tags, full backgrounds, defs and overlays do not",
      async () => {
        const excluded = `<div style="position:absolute;inset:0;background:navy"></div><svg width="600" height="300"><defs><path d="M0 0H300V300H0Z"/></defs><rect width="600" height="300" fill="navy"/><text x="20" y="80" font-size="40">文字</text></svg>`;
        const system = [
          "data-axmorf-captions",
          "data-axmorf-status-tag",
          "data-axmorf-text-group",
        ]
          .map((attr) => `<div ${attr}>${box()}</div>`)
          .join("");
        assert.equal(
          (
            await measure(
              excluded +
                system +
                `<div class="axmorf-review-overlay">${box()}</div>`,
            )
          ).unlabeledArea,
          0,
        );
        assert.equal((await measure(box())).unlabeledArea, 30_000);
        assert.ok(
          (await measure(box("", "background:none;border:5px solid red")))
            .unlabeledArea > 30_000,
        );
        const path = await measure(
          '<svg width="600" height="300"><path d="M10 10H210V110H10Z" fill="tan"/></svg>',
        );
        assert.equal(path.unlabeledArea, 20_000);
      },
    );
    await context.test(
      "invalid, complex clipped and truncated measurements remain unknown",
      async () => {
        const invalid = await measure(box('data-axmorf-object=""'));
        assert.ok(invalid.unknown.length);
        assert.equal(invalid.unlabeledArea, 30_000);
        const clip = await measure(
          box('data-axmorf-object="masked"', "clip-path:circle(40%)"),
        );
        assert.ok(clip.unknown.length);
        const many = await measure(
          Array.from({ length: 121 }, (_, i) =>
            box(`data-axmorf-object="${i}"`),
          ).join(""),
        );
        assert.equal(many.truncated, true);
        assert.equal(many.objects.length, 120);
      },
    );
    await context.test(
      "measurement and data annotations leave actual still pixels unchanged",
      async () => {
        const html = renderToStaticMarkup(
          createElement(GraphicReviewArtwork, { invalid: false }),
        );
        await measure(html, 960, 540);
        const before = await page
          ._client()
          .send("Page.captureScreenshot", { format: "png" });
        await page.evaluate(
          `document.querySelectorAll('[data-axmorf-object]').forEach(node => { node.removeAttribute('data-axmorf-object'); node.removeAttribute('data-axmorf-object-role'); node.removeAttribute('data-axmorf-object-kind'); });`,
        );
        const after = await page
          ._client()
          .send("Page.captureScreenshot", { format: "png" });
        assert.equal(before.value.data, after.value.data);
      },
    );
  } finally {
    await browser.close({ silent: true });
  }
});

test("paper collage and global-only gallery calibrate response telemetry and card-only samples", async (context) => {
  const { bundle } = await import("@remotion/bundler");
  const { getCompositions, renderStill } = await import("@remotion/renderer");
  const { analyzeMotion, extractMotionMeasurements } =
    await import("../films/motion");
  const { analyzeReviewReadability } = await import("../films/readability");
  const scratch = await mkdtemp(join(tmpdir(), "paper-response-browser-"));
  const serveUrl = await bundle({
    entryPoint: resolve("tests/fixtures/beat-response-root.tsx"),
    publicDir: resolve("public"),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          "@axmorf/studio/remotion": resolve("packages/studio/src/remotion.ts"),
        },
      },
    }),
  });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE?.trim(),
  });
  try {
    const compositions = await getCompositions(serveUrl, {
      puppeteerInstance: browser,
    });
    for (const composition of compositions)
      await context.test(composition.id, async () => {
        for (const frame of composition.id === "Varied"
          ? [0, 2, 5, 30, 39, 45, 48, 58, 90, 100, 114, 140, 153, 170, 179]
          : [0]) {
          const logs: string[] = [];
          await renderStill({
            serveUrl,
            composition,
            frame,
            output: join(scratch, `${composition.id}-${frame}.png`),
            imageFormat: "png",
            puppeteerInstance: browser,
            logLevel: "error",
            onBrowserLog: (log) => logs.push(log.text),
          });
          const output = logs.join("\n");
          const parsed = extractMotionMeasurements(output);
          assert.equal(parsed.badLines, 0);
          const motion = analyzeMotion({
            records: parsed.records,
            frames: [frame],
            curve: {
              fps: 30,
              sampleSeconds: 0.5,
              samples: [],
              seconds: [],
              cuts: [],
            },
            durationInFrames: 180,
            fps: 30,
            hasNarration: false,
            legacyAudio: false,
            music: null,
            stillWarnings: [],
          });
          const responseWarnings = motion.motionWarnings.filter(
            (w) => w.rule === "beat-response-monotone",
          );
          assert.equal(
            responseWarnings.length,
            composition.id === "Varied" ? 0 : 1,
          );
          assert.equal(
            motion.unknown.filter((u) => u.rule === "beat-response-monotone")
              .length,
            0,
          );
          assert.equal(
            motion.summary.beatResponses?.[0].kinds.length,
            composition.id === "Varied" ? 5 : 0,
          );
          const image = await readReviewFramePixels({
            rootDir: process.cwd(),
            imagePath: join(scratch, `${composition.id}-${frame}.png`),
            pixelsPath: join(scratch, `${composition.id}-${frame}-rgb.png`),
          });
          const graphics = analyzeReviewReadability({
            output,
            frames: [frame],
            width: composition.width,
            height: composition.height,
            contrastFrames: new Map([[0, { image }]]),
          });
          assert.deepEqual(graphics.graphics.unknown, []);
          assert.deepEqual(
            graphics.graphicWarnings.map((w) => w.rule),
            composition.id === "Varied" && frame < 39 ? ["text-card-only"] : [],
          );
          assert.deepEqual(graphics.readability.missingFrames, []);
          assert.deepEqual(graphics.readability.truncatedFrames, []);
          assert.deepEqual(graphics.readability.unknown, []);
          assert.deepEqual(graphics.readabilityWarnings, []);
        }
      });
  } finally {
    await browser.close({ silent: true });
    await rm(scratch, { recursive: true, force: true });
  }
});

test("paper captions expose their real box, keep phone-readable explicit lines and protect the caption band", async (context) => {
  const { renderCaptionFixture, caption } =
    await import("../../tests/fixtures/film-captions");
  const { analyzeReviewGraphics } = await import("../films/graphics");
  const bundle = await build({
    entryPoints: [resolve("tests/fixtures/foreground-browser.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "captionTest",
    platform: "browser",
  });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE?.trim(),
  });
  const scratch = await mkdtemp(join(tmpdir(), "caption-browser-"));
  try {
    const page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: 0,
      onBrowserLog: null,
      onLog: () => {},
    });
    await page.evaluate(bundle.outputFiles[0].text);
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
    ])
      await context.test(
        `${width}×${height}: paper contrast and visible caption-band intrusion`,
        async () => {
          await page.setViewport({ width, height, deviceScaleFactor: 1 });
          const html =
            `<div style="position:absolute;inset:0;background:#d6c3a0" data-axmorf-object="桌面" data-axmorf-object-role="background"></div>` +
            renderCaptionFixture(
              { variant: "paper" },
              caption,
              undefined,
              width,
              height,
            );
          const telemetry = (await page.evaluate(
            `captionTest.measureReadabilityFixture(${JSON.stringify(html)},${width},${height})`,
          )) as ReturnType<typeof measureReadabilityFixture>;
          const text = telemetry.texts.find((t) => t.caption)!;
          assert.ok(
            text.captionRect,
            "measure the strip, not only its text span",
          );
          assert.ok(text.captionRect.width > text.rect.width);
          assert.ok(
            text.fontSize >= Math.round(Math.min(width, height) * 0.04),
          );
          const layout = await page.evaluate(
            `(() => {const node=document.querySelector('[data-axmorf-caption-box]');return {lines:node.textContent.split('\\n').length,wrap:getComputedStyle(node).whiteSpace,rotation:getComputedStyle(node.querySelector('span')).transform};})()`,
          );
          assert.deepEqual(layout, {
            lines: width < height ? 2 : 1,
            wrap: "pre",
            rotation: "none",
          });
          const imagePath = join(scratch, `${width}.png`);
          const shot = await page
            ._client()
            .send("Page.captureScreenshot", { format: "png" });
          await writeFile(imagePath, Buffer.from(shot.value.data, "base64"));
          const image = await readReviewFramePixels({
            rootDir: process.cwd(),
            imagePath,
            pixelsPath: join(scratch, `${width}-rgb.png`),
          });
          const contrast = measureTextContrast({ text, image, width, height });
          assert.equal(contrast.unknown, undefined);
          assert.ok(
            contrast.worst && contrast.worst.contrastRatio >= 4.5,
            JSON.stringify(contrast),
          );
          const bandIntruder = `<div data-axmorf-object="拿笔的手" style="position:absolute;left:${text.captionRect.x - 12}px;top:${text.captionRect.y + 12}px;width:10px;height:20px;background:#30343b"></div>`;
          for (const hidden of [false, true]) {
            const art =
              html +
              (hidden
                ? bandIntruder.replace("background:", "opacity:0;background:")
                : bandIntruder);
            const graphics = (await page.evaluate(
              `captionTest.measureGraphicsFixture(${JSON.stringify(art)},${width},${height})`,
            )) as ReturnType<
              typeof import("../../tests/fixtures/foreground-browser").measureGraphicsFixture
            >;
            const result = analyzeReviewGraphics({
              records: [
                {
                  index: 0,
                  frame: 700,
                  width,
                  height,
                  ...telemetry,
                  graphics,
                  transitionWindow: true,
                },
              ],
              frames: [700],
              width,
              height,
            });
            const warnings = result.graphicWarnings.filter(
              (w) => w.rule === "graphic-in-caption-band",
            );
            assert.equal(warnings.length, hidden ? 0 : 1);
            if (!hidden) {
              assert.deepEqual(
                warnings[0].objects.map((o) => o.label),
                ["拿笔的手"],
              );
              assert.equal(warnings[0].transitionWindow, true);
            }
          }
          const silent = renderCaptionFixture(
            { variant: "paper" },
            caption,
            undefined,
            width,
            height,
            60,
          );
          const noCaption = (await page.evaluate(
            `captionTest.measureReadabilityFixture(${JSON.stringify(silent)},${width},${height})`,
          )) as ReturnType<typeof measureReadabilityFixture>;
          assert.equal(noCaption.texts.length, 0);
        },
      );
  } finally {
    await browser.close({ silent: true });
    await rm(scratch, { recursive: true, force: true });
  }
});
