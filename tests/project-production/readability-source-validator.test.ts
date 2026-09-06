import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";

import { validateRendererReadabilitySourceGraph } from "../../scripts/project-production/application/readability-source-validator";

const viewport = resolveSceneViewport(
  resolveSceneReadabilityPolicy({ width: 1080, height: 1920 }),
);

const validate = async (source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-readability-"));
  try {
    await writeFile(join(rootDir, "Renderer.tsx"), source);
    return await validateRendererReadabilitySourceGraph({
      rootDir,
      rendererPath: "Renderer.tsx",
      sourcePaths: ["Renderer.tsx"],
      sceneViewport: viewport,
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
};

test("font diagnostics identify the exact element and show a valid correction", async () => {
  await assert.rejects(
    validate(`const Renderer = () => (
  <svg>
    <text>Label</text>
  </svg>
);
export default Renderer;`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /inherited, relative, or not statically provable/u,
      );
      assert.match(error.message, /Renderer\.tsx:3:5/u);
      assert.match(error.message, /\[readability-font-size\]/u);
      assert.match(error.message, /<text>/u);
      assert.match(error.message, /fontSize=\{36\}/u);
      return true;
    },
  );
});

test("SVG text accepts explicit pixel font size in its style", async () => {
  await validate(`const Renderer = () => <svg><text style={{fontSize: 36}}>Label</text></svg>;
export default Renderer;`);
});

test("SVG text style overrides the presentation attribute and cannot hide shrinking text", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg><text fontSize={80} style={{fontSize: 12}}>Label</text></svg>;
export default Renderer;`),
    /Visible text size 12px is below the frozen 36px minimum.*Renderer\.tsx:1:/u,
  );
});

test("dynamic transforms report their exact expression and supported motion alternative", async () => {
  await assert.rejects(
    validate(
      "const Renderer = () => <div style={{transform: `translateY(${offset}px)`}} />;\nexport default Renderer;",
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /Renderer transform must be statically provable/u,
      );
      assert.match(error.message, /Renderer\.tsx:1:48/u);
      assert.match(error.message, /\[readability-transform\]/u);
      assert.match(error.message, /left\/top/u);
      return true;
    },
  );
});

test("readable fixed sizes and frame driven position remain valid", async () => {
  await validate(`const Renderer = () => <div style={{position: 'absolute', top: offset, fontSize: 36}}>Label</div>;
export default Renderer;`);
});

test("shrinking transforms preserve their rejection and expose a source location", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <div style={{transform: 'scale(0.5)'}} />;
export default Renderer;`),
    /Renderer scale must be statically proven not to shrink readable content.*Renderer\.tsx:1:48.*\[readability-scale\]/u,
  );
});

test("an unknown child expression identifies its actual container instead of a nested SVG text", async () => {
  await assert.rejects(
    validate(`const Renderer = () => (
  <svg>{items.map((item) => <text fontSize={36}>{item.label}</text>)}</svg>
);
export default Renderer;`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Renderer\.tsx:2:3/u);
      assert.match(error.message, /Set an explicit pixel size on <svg>/u);
      assert.match(error.message, /unknown JSX child expressions/u);
      return true;
    },
  );
});

test("an unknown or relative SVG style cannot fall back to a readable presentation attribute", async () => {
  for (const style of [
    "dynamicStyle",
    "{fontSize: '0.5em'}",
    "{fontSize: size}",
  ]) {
    await assert.rejects(
      validate(`const Renderer = () => <svg><text fontSize={80} style={${style}}>Label</text></svg>;
export default Renderer;`),
      /statically provable/u,
    );
  }
});

test("inline literal arrays mapped directly to JSX do not require a font on their structural container", async () => {
  await validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => (<g><text fontSize={36}>{value}</text></g>))}</svg>;
export default Renderer;`);
});

test("JSX mapped from literal arrays still validates the actual text element", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => <g><text fontSize={12}>{value}</text></g>)}</svg>;
export default Renderer;`),
    /Visible text size 12px is below the frozen 36px minimum/u,
  );
});

test("map expressions that return text remain subject to the container font requirement", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => value)}</svg>;
export default Renderer;`),
    /Set an explicit pixel size on <svg>/u,
  );
});

test("map fragment bodies cannot hide direct text from the container font requirement", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <div>{[1].map(value => <>Tiny {value}</>)}</div>;
export default Renderer;`),
    /Set an explicit pixel size on <div>/u,
  );
});
